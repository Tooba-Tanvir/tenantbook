import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, ApiError } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { PLANS } from "@/lib/plans";

const body = z.object({ plan: z.enum(["PRO", "BUSINESS"]) }).strict();

export const POST = handle(async (req) => {
  const session = await getSession();
  if (session.role === "MEMBER") throw new ApiError(403, "FORBIDDEN", "Only owners and admins can manage billing");
  const { plan } = body.parse(await req.json());
  const { tenantId } = session;

  const sub = await withTenant(tenantId, (tx) => tx.subscription.findUnique({ where: { tenantId } }));
  if (!sub?.stripeSubscriptionId) throw new ApiError(404, "NOT_FOUND", "No active subscription");
  if (sub.plan === plan) throw new ApiError(409, "CONFLICT", "Already on this plan");

  const current = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    items: [{ id: current.items.data[0].id, price: PLANS[plan].priceId! }],
    proration_behavior: "create_prorations",
  });

  // Do NOT write the new plan here. The webhook updates the DB; the UI polls until it changes.
  return NextResponse.json({ status: "pending", target: plan }, { status: 202 });
});