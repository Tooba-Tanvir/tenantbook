import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/env";
import { ApiError } from "@/lib/api";

const COOKIE = "tb_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 din
const secret = new TextEncoder().encode(env.AUTH_SECRET);

export type Session = { userId: string; tenantId: string; role: string };

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<Session> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Not logged in");
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as string,
      tenantId: payload.tenantId as string,
      role: payload.role as string,
    };
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Session expired or invalid");
  }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}