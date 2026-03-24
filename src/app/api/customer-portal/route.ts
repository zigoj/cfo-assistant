import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgId } = await req.json() as { orgId: string }
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  // Verify caller is owner/admin
  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', orgId).eq('user_id', user.id).single()
  if (!member || !['owner', 'admin'].includes(member.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const admin = createSupabaseAdmin()
  const { data: org } = await admin.from('orgs').select('stripe_customer_id').eq('id', orgId).single()
  if (!org?.stripe_customer_id)
    return NextResponse.json({ error: 'No billing account found. Subscribe first.' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${appUrl}/settings`,
  })

  return NextResponse.json({ url: session.url })
}
