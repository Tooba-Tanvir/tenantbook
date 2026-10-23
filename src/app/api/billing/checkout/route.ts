import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, ApiError } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { PLANS } from "@/lib/plans";
import { env } from "@/env";

const body = z.object({ plan: z.enum(["PRO", "BUSINESS"]) }).strict();

export const POST = handle(async (req) => {
  const session = await getSession();
  if (session.role === "MEMBER") throw new ApiError(403, "FORBIDDEN", "Only owners and admins can manage billing");
  const { plan } = body.parse(await req.json());
  const { tenantId } = session;

  const existing = await withTenant(tenantId, (tx) => tx.subscription.findUnique({ where: { tenantId } }));
  if (existing && ["active", "trialing", "past_due"].includes(existing.status)) {
    throw new ApiError(409, "CONFLICT", "You already have a subscription. Use change plan instead.");
  }

  let customerId = existing?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { tenantId } });
    customerId = customer.id;
    await withTenant(tenantId, (tx) =>
      tx.subscription.create({ data: { tenantId, stripeCustomerId: customerId! } })
    );
  }

  const checkout = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PLANS[plan].priceId!, quantity: 1 }],
      success_url: `${env.APP_URL}/billing?checkout=success`,
      cancel_url: `${env.APP_URL}/pricing?checkout=cancelled`,
      metadata: { tenantId },
      subscription_data: { metadata: { tenantId } },
    },
    req.headers.get("idempotency-key") ? { idempotencyKey: req.headers.get("idempotency-key")! } : undefined
  );
  return NextResponse.json({ url: checkout.url });
});