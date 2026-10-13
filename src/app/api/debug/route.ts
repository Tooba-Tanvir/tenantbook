import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const who = await prisma.$queryRaw`
    SELECT current_database() AS db, current_user AS usr,
           inet_server_addr()::text AS addr, inet_server_port() AS port,
           current_setting('search_path') AS search_path`;
  const fn = await prisma.$queryRaw`
    SELECT proname, pronamespace::regnamespace::text AS schema
    FROM pg_proc WHERE proname = 'resolve_tenant'`;
  return NextResponse.json({
    who,
    fn,
    url: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"),
  });
}