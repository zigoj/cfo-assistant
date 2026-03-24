/**
 * GET  /api/rules?orgId=…   — list all active rules for an org (global defaults + org overrides)
 * PUT  /api/rules            — upsert a rule override for the org
 * DELETE /api/rules?id=…    — delete an org-level rule override
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'

async function requireMember(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, orgId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()
  return data ? user : null
}

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const user = await requireMember(supabase, orgId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createSupabaseAdmin()

  // Fetch global rules (org_id IS NULL) + org overrides, ordered by priority desc
  const { data, error } = await admin
    .from('categorization_rules')
    .select('*')
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order('priority', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Org-level rules shadow global rules with the same name
  const namesSeen = new Set<string>()
  const rules = (data ?? []).filter((r: { rule_name: string; org_id: string | null }) => {
    if (r.org_id === orgId) { namesSeen.add(r.rule_name); return true }
    return !namesSeen.has(r.rule_name)
  })

  return NextResponse.json({ rules })
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { orgId, rule } = body as { orgId: string; rule: Record<string, unknown> }
  if (!orgId || !rule) return NextResponse.json({ error: 'orgId and rule required' }, { status: 400 })

  const user = await requireMember(supabase, orgId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only admins/owners can modify rules
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()
  if (!member || !['owner', 'admin'].includes(member.role))
    return NextResponse.json({ error: 'Only admins can modify rules' }, { status: 403 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('categorization_rules')
    .upsert({ ...rule, org_id: orgId }, { onConflict: 'org_id,rule_key' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!id || !orgId) return NextResponse.json({ error: 'id and orgId required' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const user = await requireMember(supabase, orgId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()
  if (!member || !['owner', 'admin'].includes(member.role))
    return NextResponse.json({ error: 'Only admins can delete rules' }, { status: 403 })

  const admin = createSupabaseAdmin()
  // Only allow deleting org-level overrides, not global defaults
  const { error } = await admin
    .from('categorization_rules')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: id })
}
