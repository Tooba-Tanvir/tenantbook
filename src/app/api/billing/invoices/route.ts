import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { getSession } from "@/lib/session";

export const GET = handle(async () => {
  const session = await getSession();
  const data = await withTenant(session.tenantId, (tx) =>
    tx.invoice.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
  );
  return NextResponse.json({ data });
});