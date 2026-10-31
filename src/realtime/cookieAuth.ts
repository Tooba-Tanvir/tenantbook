import { jwtVerify } from "jose";
import { env } from "@/env";
import { withTenant } from "@/lib/db";
import type { Handshake, RtUser } from "./createRealtime";

const secret = new TextEncoder().encode(env.AUTH_SECRET);
const COOKIE = "tb_session";

export async function cookieAuth({ cookie }: Handshake): Promise<RtUser | null> {
  const part = cookie?.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  if (!part) return null;
  try {
    const { payload } = await jwtVerify(part.slice(COOKIE.length + 1), secret);
    const userId = payload.userId as string;
    const tenantId = payload.tenantId as string;
    const user = await withTenant(tenantId, (tx) =>
      tx.user.findUnique({ where: { id: userId }, select: { name: true } })
    );
    return user ? { userId, tenantId, name: user.name } : null;
  } catch {
    return null;
  }
}