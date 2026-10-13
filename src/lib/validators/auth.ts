import { z } from "zod";

export const loginSchema = z
  .object({
    orgSlug: z.string().trim().toLowerCase().min(1, "Organization is required"),
    email: z.string().trim().toLowerCase().email("Invalid email"),
    password: z.string().min(1, "Password is required"),
  })
  .strict();