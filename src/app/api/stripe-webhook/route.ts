import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createSupabaseAdmin } from '@/lib/supabase-server'
import { sendPaymentFailedEmail } from '@/lib/resend'
import Stripe from 'stripe'

// App Router reads the raw body via req.text() — no bodyParser config needed

const TIER_QUOTAS: Record<string, { quota: number; tier: string }> = {
  b2b_starter: { tier: 'starter', quota: 3  },
  b2b_pro:     { tier: 'pro',     quota: 12 },
  b2b_agency:  { tier: 'agency',  quota: 999 },
  b2c_sub:     { tier: 'b2c_sub', quota: 1  },
}

export async function POST(req: NextRequest) {
  const payload   = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const { org_id, plan_key, report_id, user_id } = session.metadata ?? {}

      // B2C one-off pack: unlock the report
      if (plan_key === 'b2c_pack' && report_id) {
        await admin.from('reports').update({ paid_at: new Date().toISOString() }).eq('id', report_id)
      }

      // B2B / B2C sub: upgrade org tier
      if (org_id && TIER_QUOTAS[plan_key]) {
        const { tier, quota } = TIER_QUOTAS[plan_key]
        await admin.from('orgs').update({ tier, report_quota: quota, reports_used: 0 }).eq('id', org_id)
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      // Handle plan upgrade/downgrade
      const priceId = sub.items.data[0]?.price.id
      const { data: org } = await admin.from('orgs')
        .select('id').eq('stripe_customer_id', sub.customer as string).single()
      if (org) {
        // Map price → plan key and update quota
        // (price IDs resolved at runtime from env — do a reverse lookup)
        const planKey = resolvePlanKeyFromPrice(priceId)
        if (planKey && TIER_QUOTAS[planKey]) {
          const { tier, quota } = TIER_QUOTAS[planKey]
          await admin.from('orgs').update({ tier, report_quota: quota }).eq('id', org.id)
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const { data: org } = await admin.from('orgs')
        .select('id').eq('stripe_customer_id', sub.customer as string).single()
      if (org) {
        await admin.from('orgs').update({ tier: 'free', report_quota: 1 }).eq('id', org.id)
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      const { data: org } = await admin.from('orgs')
        .select('id, name').eq('stripe_customer_id', customerId).single()
      if (org) {
        // Find the org owner to email
        const { data: ownerMember } = await admin.from('org_members')
          .select('user_id').eq('org_id', org.id).eq('role', 'owner').limit(1).single()
        if (ownerMember) {
          const ownerUser = await admin.auth.admin.getUserById(ownerMember.user_id)
          const email = ownerUser.data.user?.email
          if (email) {
            const retryUrl = `${process.env.NEXT_PUBLIC_APP_URL}/settings`
            await sendPaymentFailedEmail({ to: email, orgName: org.name, retryUrl }).catch(() => {})
          }
        }
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}

function resolvePlanKeyFromPrice(priceId: string): string | null {
  const map: Record<string, string> = {
    [process.env.STRIPE_PRICE_B2B_STARTER_MONTHLY!]: 'b2b_starter',
    [process.env.STRIPE_PRICE_B2B_STARTER_ANNUAL!]:  'b2b_starter',
    [process.env.STRIPE_PRICE_B2B_PRO_MONTHLY!]:     'b2b_pro',
    [process.env.STRIPE_PRICE_B2B_PRO_ANNUAL!]:      'b2b_pro',
    [process.env.STRIPE_PRICE_B2B_AGENCY_MONTHLY!]:  'b2b_agency',
    [process.env.STRIPE_PRICE_B2B_AGENCY_ANNUAL!]:   'b2b_agency',
    [process.env.STRIPE_PRICE_B2C_SUB!]:             'b2c_sub',
  }
  return map[priceId] ?? null
}
