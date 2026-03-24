import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'
import RulesEditor from '@/components/RulesEditor'

export default async function RulesPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) redirect('/upload')

  const orgId = membership.org_id
  const isAdmin = ['owner', 'admin'].includes(membership.role)

  // Fetch rules server-side for initial render
  const admin = createSupabaseAdmin()
  const { data: rawRules } = await admin
    .from('categorization_rules')
    .select('*')
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order('priority', { ascending: false })

  // Shadow global rules with org overrides of the same rule_key
  const keysSeen = new Set<string>()
  const rules = (rawRules ?? []).filter((r: { rule_key: string; org_id: string | null }) => {
    if (r.org_id === orgId) { keysSeen.add(r.rule_key); return true }
    return !keysSeen.has(r.rule_key)
  })

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/settings" className="text-slate-400 hover:text-slate-600 transition text-sm">← Settings</Link>
        <h1 className="text-2xl font-bold">Categorisation rules</h1>
      </div>

      <p className="text-sm text-slate-500 mb-6">
        Rules determine how bank transactions are classified in your reports. Global defaults apply
        to all organisations. Add custom overrides to match your chart of accounts — they take
        precedence over globals with the same key.
      </p>

      <RulesEditor orgId={orgId} initialRules={rules} isAdmin={isAdmin} />
    </div>
  )
}
