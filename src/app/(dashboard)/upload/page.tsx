'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import UploadForm from '@/components/UploadForm'

export default function UploadPage() {
  const router = useRouter()
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }

      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id, role, orgs(id, name, tier, report_quota, reports_used)')
        .eq('user_id', session.user.id)
        .limit(1)
        .single()

      if (!membership) { router.replace('/onboard'); return }
      setOrg(membership.orgs)
      setLoading(false)
    })
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    )
  }

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
