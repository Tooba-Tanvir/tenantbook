import { env } from "@/env";

export type PlanId = "FREE" | "PRO" | "BUSINESS";

export const PLANS: Record<PlanId, { name: string; priceCents: number; priceId?: string; bookingLimit: number | null; features: string[] }> = {
  FREE:     { name: "Free",     priceCents: 0,    bookingLimit: 20,   features: ["20 bookings / month", "1 organization"] },
  PRO:      { name: "Pro",      priceCents: 1900, priceId: env.STRIPE_PRICE_PRO,      bookingLimit: 500,  features: ["500 bookings / month", "Email support"] },
  BUSINESS: { name: "Business", priceCents: 4900, priceId: env.STRIPE_PRICE_BUSINESS, bookingLimit: null, features: ["Unlimited bookings", "Priority support"] },
};

export const planFromPriceId = (priceId?: string): PlanId =>
  priceId === env.STRIPE_PRICE_PRO ? "PRO" : priceId === env.STRIPE_PRICE_BUSINESS ? "BUSINESS" : "FREE";