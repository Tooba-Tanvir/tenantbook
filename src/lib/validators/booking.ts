import { z } from "zod";

export const bookingStatus = z.enum(["CONFIRMED", "PENDING", "CANCELLED"]);

// 1. Base object, with no refine yet
const bookingBase = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    status: bookingStatus.default("CONFIRMED"),
  })
  .strict(); // reject unknown fields

// 2. Create = base + date check
export const createBookingSchema = bookingBase.refine(
  (v) => v.endsAt > v.startsAt,
  { message: "endsAt must be after startsAt", path: ["endsAt"] }
);

// 3. Update = every field optional, date check only when both dates are sent
export const updateBookingSchema = bookingBase
  .partial()
  .refine(
    (v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt,
    { message: "endsAt must be after startsAt", path: ["endsAt"] }
  );

export const listQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: bookingStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;