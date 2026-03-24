import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import DeleteAccountButton from '@/components/DeleteAccountButton'
import UpgradeButton from '@/components/UpgradeButton'
import MembersPanel from '@/components/MembersPanel'
import ManageBillingButton from '@/components/ManageBillingButton'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('role, orgs(id, name, tier, report_quota, reports_used, trial_ends_at, stripe_customer_id)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) redirect('/upload')

  const org = membership.orgs as any
  const sp = await searchParams
  const cancelled = sp.cancelled === '1'

  const PLAN_LABELS: Record<string, { label: string; price: string }> = {
    free:     { label: 'Free',    price: '£0' },
    starter:  { label: 'Starter', price: '£89/mo' },
    pro:      { label: 'Pro',     price: '£249/mo' },
    agency:   { label: 'Agency',  price: '£599/mo' },
    b2c_sub:  { label: 'Lite',    price: '£9/mo' },
    b2c_pack: { label: 'Lite Pack', price: '£19 one-off' },
  }
  const planInfo = PLAN_LABELS[org.tier] ?? { label: org.tier, price: '' }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      {cancelled && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-6">
          Checkout cancelled — your plan was not changed.
        </div>
      )}

      {/* Org */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <h2 className="font-semibold text-slate-700 mb-4">Organisation
          <Link href="/settings/rules" className="ml-3 text-xs font-normal text-teal-600 hover:underline">Categorisation rules →</Link>
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Name</span>
            <span className="font-medium">{org.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Your role</span>
            <span className="font-medium capitalize">{membership.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
        </div>
      </section>

      {/* Billing */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <h2 className="font-semibold text-slate-700 mb-4">Billing</h2>
        <div className="space-y-3 text-sm mb-5">
          <div className="flex justify-between">
            <span className="text-slate-500">Plan</span>
            <span className="font-medium">{planInfo.label} <span className="text-slate-400">{planInfo.price}</span></span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Reports used</span>
            <span className="font-medium">{org.reports_used} / {org.report_quota === 999 ? '∞' : org.report_quota}</span>
          </div>
          {org.trial_ends_at && new Date(org.trial_ends_at) > new Date() && (
            <div className="flex justify-between">
              <span className="text-slate-500">Trial ends</span>
              <span className="font-medium text-teal-700">
                {new Date(org.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>
        {org.tier === 'free' || org.tier === 'starter' || org.tier === 'pro' ? (
          <UpgradeButton orgId={org.id} currentTier={org.tier} />
        ) : null}
        {org.stripe_customer_id && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <ManageBillingButton orgId={org.id} />
          </div>
        )}
      </section>

      {/* Team members — pro/agency only, or any tier for the owner */}
      {['pro', 'agency'].includes(org.tier) || membership.role === 'owner' ? (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <h2 className="font-semibold text-slate-700 mb-1">Team members</h2>
          <p className="text-xs text-slate-400 mb-4">
            {org.tier === 'pro' ? 'Up to 5 seats' : org.tier === 'agency' ? 'Up to 20 seats' : '1 seat on your current plan'}
          </p>
          <MembersPanel
            orgId={org.id}
            currentUserId={user.id}
            isAdmin={['owner', 'admin'].includes(membership.role)}
          />
        </section>
      ) : null}

      {/* Danger zone */}
      <section className="bg-white rounded-2xl border border-red-100 p-6">
        <h2 className="font-semibold text-red-700 mb-2">Danger zone</h2>
        <p className="text-xs text-slate-500 mb-4">
          Deletes your account, organisation, all reports, and cancels your Stripe subscription.
          This cannot be undone.
        </p>
        <DeleteAccountButton />
      </section>
    </div>
  )
}
