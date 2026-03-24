import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'
import { sendWelcomeEmail } from '@/lib/resend'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgName } = await req.json() as { orgName: string; plan: string }
  if (!orgName?.trim()) return NextResponse.json({ error: 'Business name required' }, { status: 400 })

  const admin = createSupabaseAdmin()

  // Check not already onboarded
  const { data: existing } = await admin.from('org_members').select('org_id').eq('user_id', user.id).limit(1).single()
  if (existing) return NextResponse.json({ orgId: existing.org_id })

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: org, error: orgError } = await admin
    .from('orgs')
    .insert({ name: orgName.trim(), tier: 'free', report_quota: 1, trial_ends_at: trialEndsAt })
    .select('id')
    .single()

  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 })

  await admin.from('org_members').insert({ org_id: org.id, user_id: user.id, role: 'owner' })

  await sendWelcomeEmail({ to: user.email!, orgName: orgName.trim() }).catch(() => {})

  return NextResponse.json({ orgId: org.id }, { status: 201 })
}
