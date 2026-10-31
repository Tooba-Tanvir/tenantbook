import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Week 3: Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_PRO: z.string().min(1),
  STRIPE_PRICE_BUSINESS: z.string().min(1),
  APP_URL: z.string().url(),

  // Week 4: realtime
  REALTIME_PORT: z.coerce.number().default(4000),
});

export const env = schema.parse(process.env);