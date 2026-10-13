import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { handle, ApiError } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createBookingSchema, listQuerySchema } from "@/lib/validators/booking";

export const GET = handle(async (req) => {
  const session = await getSession();
  const url = new URL(req.url);
  const q = listQuerySchema.parse(Object.fromEntries(url.searchParams));

  const where = {
    ...(q.status && { status: q.status }),
    // overlap: booking range from..to ke andar kahin bhi aaye
    ...(q.to && { startsAt: { lt: q.to } }),
    ...(q.from && { endsAt: { gt: q.from } }),
  };

  const [data, total] = await withTenant(session.tenantId, async (tx) =>
    Promise.all([
      tx.booking.findMany({
        where,
        orderBy: { startsAt: "asc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { id: true, name: true } } },
      }),
      tx.booking.count({ where }),
    ])
  );

  return NextResponse.json({ data, page: q.page, pageSize: q.pageSize, total });
});

export const POST = handle(async (req) => {
  const session = await getSession();

  const key = req.headers.get("idempotency-key");
  if (!key || key.length > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "Idempotency-Key header is required", [
      { path: "Idempotency-Key", message: "Send a unique key (UUID) per submit" },
    ]);
  }

  const body = createBookingSchema.parse(await req.json());
  const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");

  const result = await withTenant(session.tenantId, async (tx) => {
    // 1. Key claim karein. Conflict par DO NOTHING; dusri request yahan unique index par wait karti hai.
    const claimed = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "IdempotencyKey" ("id", "tenantId", "key", "requestHash", "responseStatus", "responseBody")
      VALUES (${randomUUID()}::text, ${session.tenantId}::text, ${key}::text, ${requestHash}::text, 0, '{}'::jsonb)
      ON CONFLICT ("tenantId", "key") DO NOTHING
      RETURNING "id"`;

    // 2. Key pehle se hai: stored response wapas dein
    if (claimed.length === 0) {
      const existing = await tx.idempotencyKey.findUnique({
        where: { tenantId_key: { tenantId: session.tenantId, key } },
      });
      if (!existing) throw new ApiError(500, "INTERNAL_ERROR", "Idempotency state missing");
      if (existing.requestHash !== requestHash) {
        throw new ApiError(
          422,
          "IDEMPOTENCY_KEY_REUSED",
          "This Idempotency-Key was already used with a different request body"
        );
      }
      return { status: existing.responseStatus, body: existing.responseBody, replayed: true };
    }

    // 3. Nayi key: booking banayein aur response save karein
    const booking = await tx.booking.create({
      data: { ...body, tenantId: session.tenantId, userId: session.userId },
    });
    const responseBody = JSON.parse(JSON.stringify({ data: booking }));
    await tx.idempotencyKey.update({
      where: { tenantId_key: { tenantId: session.tenantId, key } },
      data: { responseStatus: 201, responseBody },
    });
    return { status: 201, body: responseBody, replayed: false };
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.replayed ? { "Idempotent-Replayed": "true" } : undefined,
  });
});