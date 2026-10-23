import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { handle, ApiError } from "@/lib/api";
import { prisma, withTenant } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { planFromPriceId } from "@/lib/plans";
import { env } from "@/env";

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

async function tenantByCustomer(customerId: string) {
  const rows = await prisma.$queryRaw<{ id: string | null }[]>`
    SELECT resolve_tenant_by_customer(${customerId}::text) AS id`;
  return rows[0]?.id ?? null;
}

const customerId = (c: string | Stripe.Customer | Stripe.DeletedCustomer | null) =>
  typeof c === "string" ? c : c?.id ?? null;

async function syncSubscription(tx: Tx, tenantId: string, sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  // Newer Stripe API versions put the period on the item, older ones on the subscription
  const periodEnd = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const ended = sub.status === "canceled";
  await tx.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId, stripeCustomerId: customerId(sub.customer)!, stripeSubscriptionId: sub.id,
      plan: ended ? "FREE" : planFromPriceId(item?.price.id), status: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
    update: {
      stripeSubscriptionId: ended ? null : sub.id,
      plan: ended ? "FREE" : planFromPriceId(item?.price.id),
      status: ended ? "canceled" : sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}

async function upsertInvoice(tx: Tx, tenantId: string, inv: Stripe.Invoice) {
  const data = {
    tenantId, number: inv.number, amountPaid: inv.amount_paid, currency: inv.currency,
    status: inv.status ?? "unknown", hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    pdfUrl: inv.invoice_pdf ?? null, createdAt: new Date(inv.created * 1000),
  };
  await tx.invoice.upsert({ where: { id: inv.id! }, create: { id: inv.id!, ...data }, update: data });
}

export const POST = handle(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw new ApiError(400, "VALIDATION_ERROR", "Missing stripe-signature header");
  const raw = await req.text(); // raw body, required for signature check

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid webhook signature");
  }

  // 1. Work out the tenant and fetch fresh data (network calls stay outside the DB transaction)
  let tenantId: string | null = null;
  let apply: ((tx: Tx) => Promise<void>) | null = null;

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      tenantId = s.metadata?.tenantId ?? (s.customer ? await tenantByCustomer(customerId(s.customer)!) : null);
      if (tenantId && s.subscription) {
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
        const fresh = await stripe.subscriptions.retrieve(subId);
        apply = (tx) => syncSubscription(tx, tenantId!, fresh);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const s = event.data.object as Stripe.Subscription;
      tenantId = s.metadata?.tenantId ?? (await tenantByCustomer(customerId(s.customer)!));
      if (tenantId) {
        // Fetch the latest state so out-of-order events cannot overwrite newer data
        const fresh = await stripe.subscriptions.retrieve(s.id);
        apply = (tx) => syncSubscription(tx, tenantId!, fresh);
      }
      break;
    }
    case "invoice.finalized":
    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      tenantId = inv.customer ? await tenantByCustomer(customerId(inv.customer)!) : null;
      if (tenantId) apply = (tx) => upsertInvoice(tx, tenantId!, inv);
      break;
    }
    default:
      return NextResponse.json({ received: true, ignored: event.type });
  }

  // Unknown tenant: acknowledge so Stripe does not retry forever, but log it
  if (!tenantId || !apply) {
    console.warn(`[stripe] ${event.id} (${event.type}) has no matching tenant`);
    return NextResponse.json({ received: true, ignored: "no tenant" });
  }

  // 2. Dedup and apply in ONE transaction
  const result = await withTenant(tenantId, async (tx) => {
    const claimed = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "StripeEvent" ("id", "type") VALUES (${event.id}::text, ${event.type}::text)
      ON CONFLICT ("id") DO NOTHING RETURNING "id"`;
    if (claimed.length === 0) return "duplicate" as const;
    await apply!(tx);
    return "processed" as const;
  });

  return NextResponse.json({ received: true, result });
});