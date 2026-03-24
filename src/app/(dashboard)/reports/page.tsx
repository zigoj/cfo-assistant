import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import ReportsList from '@/components/ReportsList'

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members').select('org_id, role').eq('user_id', user.id).limit(1).single()
  if (!membership) redirect('/upload')

  const { data: reports } = await supabase
    .from('reports')
    .select('id, report_month, status, kpi_runway_days, kpi_gross_margin, kpi_cash_close')
    .eq('org_id', membership.org_id)
    .order('report_month', { ascending: false })
    .limit(24)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Link href="/upload"
          className="bg-teal-700 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
          + New report
        </Link>
      </div>

      <ReportsList
        initialReports={reports ?? []}
        orgId={membership.org_id}
        isAdmin={['owner', 'admin'].includes(membership.role)}
      />
    </div>
  )
}
