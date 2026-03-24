import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import UploadForm from '@/components/UploadForm'

export default async function UploadPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role, orgs(id, name, tier, report_quota, reports_used)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) redirect('/onboard')

  const org = membership.orgs as any

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">New management pack</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload your files and we'll generate your report in under 2 minutes.
        </p>
        <div className="mt-3 text-xs text-slate-400">
          {org.name} · {org.tier} plan · {org.reports_used}/{org.report_quota === 999 ? '∞' : org.report_quota} reports used this month
        </div>
      </div>
      <UploadForm orgId={org.id} />
    </div>
  )
}
