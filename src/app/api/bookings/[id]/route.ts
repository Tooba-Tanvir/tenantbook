import { NextResponse } from "next/server";
import { handle, ApiError } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { getSession, type Session } from "@/lib/session";
import { updateBookingSchema } from "@/lib/validators/booking";

type Ctx = { params: Promise<{ id: string }> };

function assertCanModify(session: Session, ownerId: string) {
  if (session.role === "MEMBER" && ownerId !== session.userId) {
    throw new ApiError(403, "FORBIDDEN", "You can only modify your own bookings");
  }
}

export const GET = handle<Ctx>(async (_req, ctx) => {
  const session = await getSession();
  const { id } = await ctx.params;

  const booking = await withTenant(session.tenantId, (tx) =>
    tx.booking.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
  );
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Booking not found");
  return NextResponse.json({ data: booking });
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const session = await getSession();
  const { id } = await ctx.params;
  const patch = updateBookingSchema.parse(await req.json());

  const updated = await withTenant(session.tenantId, async (tx) => {
    const existing = await tx.booking.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Booking not found");
    assertCanModify(session, existing.userId);

    // merged dates check (sirf endsAt bheja ho to bhi sahi chale)
    const startsAt = patch.startsAt ?? existing.startsAt;
    const endsAt = patch.endsAt ?? existing.endsAt;
    if (endsAt <= startsAt) {
      throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", [
        { path: "endsAt", message: "endsAt must be after startsAt" },
      ]);
    }
    return tx.booking.update({ where: { id }, data: patch });
  });

  return NextResponse.json({ data: updated });
});

export const DELETE = handle<Ctx>(async (_req, ctx) => {
  const session = await getSession();
  const { id } = await ctx.params;

  await withTenant(session.tenantId, async (tx) => {
    const existing = await tx.booking.findUnique({ where: { id } });
    if (!existing) return; // pehle se delete: phir bhi 204 (idempotent)
    assertCanModify(session, existing.userId);
    await tx.booking.deleteMany({ where: { id } });
  });

  return new NextResponse(null, { status: 204 });
});