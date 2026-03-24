import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // RLS enforces org membership
  const { data: report, error } = await supabase
    .from('reports')
    .select('id,org_id,status,output_pdf_url,report_json,report_month')
    .eq('id', id)
    .single()

  if (error || !report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (report.status !== 'ready') return NextResponse.json({ error: 'Report not ready' }, { status: 202 })

  const format = req.nextUrl.searchParams.get('format') ?? 'json'

  if (format === 'pdf') {
    // Generate a fresh signed URL (24h TTL)
    const admin = createSupabaseAdmin()
    const { data: signedUrl } = await admin.storage
      .from('report-outputs')
      .createSignedUrl(`${report.org_id}/${id}/pack.pdf`, 86400)

    if (!signedUrl) return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })
    return NextResponse.redirect(signedUrl.signedUrl)
  }

  // JSON: return the cached structured report
  return NextResponse.json(report.report_json)
}
