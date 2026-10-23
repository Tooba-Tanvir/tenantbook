import { NextResponse } from "next/server";
import { handle, ApiError } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { env } from "@/env";

export const POST = handle(async () => {
  const session = await getSession();
  if (session.role === "MEMBER") throw new ApiError(403, "FORBIDDEN", "Only owners and admins can manage billing");
  const sub = await withTenant(session.tenantId, (tx) =>
    tx.subscription.findUnique({ where: { tenantId: session.tenantId } })
  );
  if (!sub) throw new ApiError(404, "NOT_FOUND", "No billing account yet");
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${env.APP_URL}/billing`,
  });
  return NextResponse.json({ url: portal.url });
});