import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' })
  }
  return _stripe
}

export const PLANS = {
  b2b_starter: {
    name: 'Starter',
    monthly: process.env.STRIPE_PRICE_B2B_STARTER_MONTHLY!,
    annual:  process.env.STRIPE_PRICE_B2B_STARTER_ANNUAL!,
    quota: 3,
    tier: 'starter',
  },
  b2b_pro: {
    name: 'Pro',
    monthly: process.env.STRIPE_PRICE_B2B_PRO_MONTHLY!,
    annual:  process.env.STRIPE_PRICE_B2B_PRO_ANNUAL!,
    quota: 12,
    tier: 'pro',
  },
  b2b_agency: {
    name: 'Agency',
    monthly: process.env.STRIPE_PRICE_B2B_AGENCY_MONTHLY!,
    annual:  process.env.STRIPE_PRICE_B2B_AGENCY_ANNUAL!,
    quota: 999,
    tier: 'agency',
  },
  b2c_pack: {
    name: 'Lite Pack',
    price: process.env.STRIPE_PRICE_B2C_PACK!,
    tier: 'b2c_pack',
  },
  b2c_sub: {
    name: 'Lite Monthly',
    price: process.env.STRIPE_PRICE_B2C_SUB!,
    tier: 'b2c_sub',
  },
} as const

export type PlanKey = keyof typeof PLANS
