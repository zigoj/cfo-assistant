import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import ReportViewer from '@/components/ReportViewer'

export default async function ReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { reportId } = await params

  const { data: report } = await supabase
    .from('reports')
    .select('id,status,progress_pct,error_msg,report_month,kpi_runway_days,kpi_burn_rate,kpi_gross_margin,kpi_cash_close,report_json,org_id')
    .eq('id', reportId)
    .single()

  if (!report) redirect('/upload')

  return <ReportViewer initialReport={report} />
}
