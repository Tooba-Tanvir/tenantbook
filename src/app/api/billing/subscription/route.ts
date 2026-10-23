import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { getSession } from "@/lib/session";

export const GET = handle(async () => {
  const session = await getSession();
  const sub = await withTenant(session.tenantId, (tx) =>
    tx.subscription.findUnique({ where: { tenantId: session.tenantId } })
  );
  return NextResponse.json({
    data: {
      plan: sub?.plan ?? "FREE",
      status: sub?.status ?? "none",
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    },
  });
});