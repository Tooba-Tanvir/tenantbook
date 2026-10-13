import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { handle, ApiError } from "@/lib/api";
import { prisma, withTenant } from "@/lib/db";
import { createSession } from "@/lib/session";
import { loginSchema } from "@/lib/validators/auth";

export const POST = handle(async (req) => {
  const body = loginSchema.parse(await req.json());

  // Step 1: slug se tenantId (SECURITY DEFINER function, RLS bypass)
 const rows = await prisma.$queryRaw<{ id: string | null }[]>`
  SELECT resolve_tenant(${body.orgSlug}::text) AS id
`;
  const tenantId = rows[0]?.id;

  // Same error har case mein, taake attacker ko pata na chale org ya email sahi hai
  const invalid = new ApiError(401, "UNAUTHORIZED", "Invalid credentials");
  if (!tenantId) throw invalid;

  // Step 2: user lookup tenant ke andar
  const user = await withTenant(tenantId, (tx) =>
    tx.user.findUnique({
      where: { tenantId_email: { tenantId, email: body.email } },
      include: { role: true },
    })
  );
  if (!user) throw invalid;

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) throw invalid;

  await createSession({ userId: user.id, tenantId, role: user.role.name });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role.name },
  });
});