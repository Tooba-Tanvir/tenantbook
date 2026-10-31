import { randomUUID } from "crypto";
import { withTenant } from "@/lib/db";
import type { NoteStore } from "./createRealtime";

export const prismaStore: NoteStore = {
  async canAccess(tenantId, bookingId) {
    const b = await withTenant(tenantId, (tx) =>
      tx.booking.findUnique({ where: { id: bookingId }, select: { id: true } })
    );
    return !!b;
  },

  async get(tenantId, bookingId) {
    const n = await withTenant(tenantId, (tx) => tx.bookingNote.findUnique({ where: { bookingId } }));
    return { content: n?.content ?? "", version: n?.version ?? 0 };
  },

  async save(tenantId, bookingId, content, baseVersion, userId) {
    return withTenant(tenantId, async (tx) => {
      if (baseVersion === 0) {
        const rows = await tx.$queryRaw<{ version: number }[]>`
          INSERT INTO "BookingNote" ("id","tenantId","bookingId","content","version","updatedBy","updatedAt")
          VALUES (${randomUUID()}::text, ${tenantId}::text, ${bookingId}::text, ${content}::text, 1, ${userId}::text, now())
          ON CONFLICT ("bookingId") DO NOTHING
          RETURNING "version"`;
        if (rows.length) return { ok: true as const, version: rows[0].version };
      } else {
        const rows = await tx.$queryRaw<{ version: number }[]>`
          UPDATE "BookingNote"
          SET "content" = ${content}::text, "version" = "version" + 1,
              "updatedBy" = ${userId}::text, "updatedAt" = now()
          WHERE "bookingId" = ${bookingId}::text AND "version" = ${baseVersion}::int
          RETURNING "version"`;
        if (rows.length) return { ok: true as const, version: rows[0].version };
      }
      const cur = await tx.bookingNote.findUnique({ where: { bookingId } });
      return { ok: false as const, current: { content: cur?.content ?? "", version: cur?.version ?? 0 } };
    });
  },
};