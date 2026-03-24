import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const reportId = req.nextUrl.searchParams.get('reportId') ?? req.nextUrl.searchParams.get('report_id')
  if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 })

  const { data: report, error } = await supabase
    .from('reports')
    .select('id,status,progress_pct,error_msg,kpi_runway_days,kpi_burn_rate,kpi_gross_margin,kpi_cash_close,output_pdf_url,report_month')
    .eq('id', reportId)
    .single()

  if (error || !report)
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  return NextResponse.json({
    reportId:    report.id,
    status:      report.status,          // pending | processing | ready | error
    progressPct: report.progress_pct,
    errorMsg:    report.error_msg,
    ready:       report.status === 'ready',
    reportUrl:   report.status === 'ready' ? `/reports/${report.id}` : null,
    kpis: report.status === 'ready' ? {
      runwayDays:   report.kpi_runway_days,
      burnRate:     report.kpi_burn_rate,
      grossMargin:  report.kpi_gross_margin,
      cashClose:    report.kpi_cash_close,
    } : null,
  })
}
