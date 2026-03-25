'use client'
/**
 * /onboard — shown when a logged-in user has no org membership yet.
 * Creates the org via /api/onboard, then starts checkout for paid plans
 * or goes straight to /upload for free/trial.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PLANS = [
  { key: 'starter', label: 'Starter', price: '£89/mo', quota: '3 reports/mo · 14-day trial' },
  { key: 'pro',     label: 'Pro',     price: '£249/mo', quota: '12 reports/mo · 14-day trial' },
  { key: 'agency',  label: 'Agency',  price: '£599/mo', quota: 'Unlimited · 14-day trial' },
]

export default function OnboardPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [plan, setPlan]       = useState('starter')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgName.trim()) { setError('Business name is required'); return }
    setError('')
    setLoading(true)

    const res = await fetch('/api/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName: orgName.trim(), plan }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Setup failed'); setLoading(false); return }

    const { orgId } = data

    // All paid plans start with Stripe checkout (trial enabled)
    const checkout = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey: `b2b_${plan}`, orgId, billing: 'monthly' }),
    })
    const { checkoutUrl, error: checkoutErr } = await checkout.json()
    if (checkoutErr) { setError(checkoutErr); setLoading(false); return }

    window.location.href = checkoutUrl
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold mb-1">Set up your organisation</h1>
        <p className="text-sm text-slate-500 mb-6">One-time setup — 14-day trial, cancel anytime.</p>

        {error && <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business name</label>
            <input type="text" required autoFocus
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={orgName} onChange={e => setOrgName(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Plan</label>
            <div className="space-y-2">
              {PLANS.map(p => (
                <label key={p.key}
                  className={`flex items-start gap-3 border rounded-xl p-3 cursor-pointer transition
                    ${plan === p.key ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="plan" value={p.key}
                    checked={plan === p.key} onChange={() => setPlan(p.key)}
                    className="mt-0.5 accent-teal-600" />
                  <div>
                    <div className="font-medium text-sm text-slate-900">{p.label} — {p.price}</div>
                    <div className="text-xs text-slate-500">{p.quota}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-teal-700 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60">
            {loading ? 'Setting up…' : 'Continue to checkout →'}
          </button>

          <button type="button" disabled={loading}
            onClick={async () => {
              if (!orgName.trim()) { setError('Business name is required'); return }
              setError(''); setLoading(true)
              const res = await fetch('/api/onboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgName: orgName.trim(), plan: 'free' }),
              })
              const data = await res.json()
              if (!res.ok) { setError(data.error ?? 'Setup failed'); setLoading(false); return }
              router.push('/upload')
            }}
            className="w-full border border-teal-600 text-teal-700 hover:bg-teal-50 font-medium py-3 rounded-xl transition disabled:opacity-60 text-sm">
            Start free trial — no card required
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-5">
          Your trial starts immediately. You won't be charged for 14 days.
        </p>
        <p className="text-sm text-center mt-4">
          <Link href="/upload" className="text-teal-700 hover:underline text-sm">
            Already set up? Go to upload →
          </Link>
        </p>
      </div>
    </div>
  )
}
