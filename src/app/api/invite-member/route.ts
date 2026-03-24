/**
 * POST /api/invite-member
 * Invites a user to an org by email. If they already have an account,
 * adds them as a member directly. If not, sends a Supabase magic-link
 * invite email (they'll join on first sign-in via the callback route).
 *
 * Body: { orgId, email, role? }
 * Only org owners/admins may call this.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'

const TIER_SEAT_LIMITS: Record<string, number> = {
  free: 2, starter: 2, pro: 5, agency: 20,
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgId, email, role = 'member' } = await req.json() as {
    orgId: string; email: string; role?: string
  }
  if (!orgId || !email) return NextResponse.json({ error: 'orgId and email required' }, { status: 400 })
  if (!['admin', 'member'].includes(role))
    return NextResponse.json({ error: 'role must be admin or member' }, { status: 400 })

  // Verify caller is owner/admin of the org
  const { data: caller } = await supabase
    .from('org_members').select('role')
    .eq('org_id', orgId).eq('user_id', user.id).single()
  if (!caller || !['owner', 'admin'].includes(caller.role))
    return NextResponse.json({ error: 'Only admins can invite members' }, { status: 403 })

  const admin = createSupabaseAdmin()

  // Enforce seat limit
  const { data: org } = await admin.from('orgs').select('tier').eq('id', orgId).single()
  const limit = TIER_SEAT_LIMITS[org?.tier ?? 'free'] ?? 1
  const { count } = await admin
    .from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId)
  if ((count ?? 0) >= limit)
    return NextResponse.json({
      error: `Your plan allows ${limit} seat${limit === 1 ? '' : 's'}. Upgrade to add more.`
    }, { status: 402 })

  // Check if the invited email already has an account
  const { data: existingUsers } = await admin.auth.admin.listUsers()
  const existing = existingUsers?.users?.find((u: { email?: string }) => u.email === email)

  if (existing) {
    // Check not already a member
    const { data: already } = await admin
      .from('org_members').select('id')
      .eq('org_id', orgId).eq('user_id', existing.id).single()
    if (already) return NextResponse.json({ error: 'User is already a member' }, { status: 409 })

    await admin.from('org_members').insert({ org_id: orgId, user_id: existing.id, role })
    return NextResponse.json({ invited: email, status: 'added_existing' })
  }

  // New user — send magic-link invite; store pending invite so callback can add membership
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/api/auth/callback?next=/upload`,
    data: { pending_org_id: orgId, pending_role: role },
  })

  return NextResponse.json({ invited: email, status: 'invite_sent' })
}

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: members } = await supabase
    .from('org_members')
    .select('id, role, created_at, user_id')
    .eq('org_id', orgId)
    .order('created_at')

  if (!members?.length) return NextResponse.json({ members: [] })

  // Enrich with emails using admin client
  const admin = createSupabaseAdmin()
  const enriched = await Promise.all(
    members.map(async (m) => {
      const { data } = await admin.auth.admin.getUserById(m.user_id)
      return { ...m, email: data?.user?.email ?? null }
    })
  )

  return NextResponse.json({ members: enriched })
}

export async function DELETE(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId')
  const orgId    = req.nextUrl.searchParams.get('orgId')
  if (!memberId || !orgId) return NextResponse.json({ error: 'memberId and orgId required' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('org_members').select('role')
    .eq('org_id', orgId).eq('user_id', user.id).single()
  if (!caller || !['owner', 'admin'].includes(caller.role))
    return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 })

  const admin = createSupabaseAdmin()

  // Don't allow removing the last owner
  const { data: target } = await admin.from('org_members').select('role, user_id').eq('id', memberId).single()
  if (target?.role === 'owner') {
    const { count } = await admin
      .from('org_members').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('role', 'owner')
    if ((count ?? 0) <= 1)
      return NextResponse.json({ error: 'Cannot remove the last owner' }, { status: 400 })
  }

  await admin.from('org_members').delete().eq('id', memberId).eq('org_id', orgId)
  return NextResponse.json({ removed: memberId })
}
