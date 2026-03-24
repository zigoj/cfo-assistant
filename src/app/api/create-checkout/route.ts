import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'
import { getStripe, PLANS, PlanKey } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    planKey: PlanKey
    orgId?: string        // B2B: required; B2C: omit
    billing?: 'monthly' | 'annual'
    reportId?: string     // B2C one-off: attach to specific report
  }

  const { planKey, orgId, billing = 'monthly', reportId } = body
  if (!planKey || !(planKey in PLANS))
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const plan = PLANS[planKey]
  const admin = createSupabaseAdmin()

  // Resolve or create Stripe customer
  let stripeCustomerId: string | undefined

  if (orgId) {
    const { data: org } = await admin.from('orgs').select('stripe_customer_id,name').eq('id', orgId).single()
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })
    stripeCustomerId = org.stripe_customer_id ?? undefined

    if (!stripeCustomerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        name: org.name,
        metadata: { org_id: orgId },
      })
      stripeCustomerId = customer.id
      await admin.from('orgs').update({ stripe_customer_id: stripeCustomerId }).eq('id', orgId)
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const isSubscription = 'monthly' in plan || 'price' in plan && planKey === 'b2c_sub'
  const isOneOff = planKey === 'b2c_pack'

  let priceId: string
  if ('monthly' in plan) {
    priceId = billing === 'annual' ? (plan as any).annual : (plan as any).monthly
  } else {
    priceId = (plan as any).price
  }

  const session = await getStripe().checkout.sessions.create({
    customer: stripeCustomerId,
    customer_email: stripeCustomerId ? undefined : user.email,
    mode: isOneOff ? 'payment' : 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(isSubscription && !isOneOff ? { subscription_data: { trial_period_days: 14 } } : {}),
    success_url: `${appUrl}/reports${reportId ? `/${reportId}` : ''}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/settings?cancelled=1`,
    metadata: {
      user_id:   user.id,
      org_id:    orgId ?? '',
      plan_key:  planKey,
      report_id: reportId ?? '',
    },
    allow_promotion_codes: true,
  })

  return NextResponse.json({ checkoutUrl: session.url })
}
