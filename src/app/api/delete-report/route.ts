import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'

export async function DELETE(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get('reportId')
  const orgId    = req.nextUrl.searchParams.get('orgId')
  if (!reportId || !orgId)
    return NextResponse.json({ error: 'reportId and orgId required' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Caller must be an admin/owner of the org
  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', orgId).eq('user_id', user.id).single()
  if (!member || !['owner', 'admin'].includes(member.role))
    return NextResponse.json({ error: 'Only admins can delete reports' }, { status: 403 })

  const admin = createSupabaseAdmin()

  // Verify the report belongs to this org
  const { data: report } = await admin
    .from('reports').select('id, org_id').eq('id', reportId).eq('org_id', orgId).single()
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  // Remove storage objects (best-effort — don't fail if missing)
  await admin.storage.from('report-outputs').remove([`${orgId}/${reportId}/pack.pdf`]).catch(() => {})

  // Delete the report row (cascades to transactions)
  await admin.from('reports').delete().eq('id', reportId)

  return NextResponse.json({ deleted: reportId })
}
