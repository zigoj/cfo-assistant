'use client'
import { useState } from 'react'

const NEXT_TIER: Record<string, string> = {
  free: 'starter', starter: 'pro', pro: 'agency',
}
const TIER_LABEL: Record<string, string> = {
  starter: 'Starter — £89/mo', pro: 'Pro — £249/mo', agency: 'Agency — £599/mo',
}
const ANNUAL_DISCOUNT = '2 months free'

export default function UpgradeButton({ orgId, currentTier }: { orgId: string; currentTier: string }) {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const nextTier = NEXT_TIER[currentTier] ?? 'pro'

  async function handleUpgrade() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey: `b2b_${nextTier}`, orgId, billing }),
    })
    const { checkoutUrl, error: err } = await res.json()
    if (err) { setError(err); setLoading(false); return }
    window.location.href = checkoutUrl
  }

  return (
    <div className="space-y-3">
      {/* Billing toggle */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mx-auto">
        {(['monthly', 'annual'] as const).map(b => (
          <button key={b} onClick={() => setBilling(b)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${billing === b ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {b === 'monthly' ? 'Monthly' : `Annual (${ANNUAL_DISCOUNT})`}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-xs text-center">{error}</p>}

      <button onClick={handleUpgrade} disabled={loading}
        className="block w-full text-center text-sm bg-teal-700 hover:bg-teal-600 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60">
        {loading ? 'Redirecting…' : `Upgrade to ${TIER_LABEL[nextTier] ?? nextTier} →`}
      </button>
    </div>
  )
}
