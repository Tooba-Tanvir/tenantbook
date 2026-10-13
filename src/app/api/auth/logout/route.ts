import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { clearSession } from "@/lib/session";

export const POST = handle(async () => {
  await clearSession();
  return new NextResponse(null, { status: 204 });
});