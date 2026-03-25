'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const plan = searchParams.get('plan') ?? 'free'

  const [orgName, setOrgName]   = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)

    const supabase = createSupabaseBrowserClient()
    let signupData: any, signupError: any
    try {
      const result = await supabase.auth.signUp({
        email,
        password,
        options: { data: { org_name: orgName } },
      })
      signupData = result.data
      signupError = result.error
    } catch {
      setError('Cannot reach authentication server. Check your NEXT_PUBLIC_SUPABASE_URL in .env.local.')
      setLoading(false)
      return
    }
    if (signupError) { setError(signupError.message); setLoading(false); return }

    // Create org + membership via server action (called after auth)
    const res = await fetch('/api/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName, plan }),
    })
    if (!res.ok) {
      const { error: msg } = await res.json()
      setError(msg ?? 'Setup failed')
      setLoading(false)
      return
    }
    const { orgId } = await res.json()

    // Redirect to checkout if paid plan
    if (plan !== 'free') {
      const checkout = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey: `b2b_${plan}`, orgId, billing: 'monthly' }),
      })
      const { checkoutUrl } = await checkout.json()
      window.location.href = checkoutUrl
      return
    }

    router.push('/upload')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold mb-2">Create your account</h1>
        <p className="text-sm text-slate-500 mb-6">14-day free trial · No credit card required for 7 days</p>
        {error && <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business name</label>
            <input type="text" required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={orgName} onChange={e => setOrgName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Work email</label>
            <input type="email" required autoComplete="email"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input type="password" required autoComplete="new-password" minLength={8}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-teal-700 hover:bg-teal-600 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60">
            {loading ? 'Setting up…' : 'Create account'}
          </button>
        </form>
        <p className="text-sm text-slate-500 text-center mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-teal-700 font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-slate-400">Loading…</div></div>}>
      <SignupForm />
    </Suspense>
  )
}
