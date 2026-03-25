'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    let authError: any
    try {
      const result = await supabase.auth.signInWithPassword({ email, password })
      authError = result.error
    } catch {
      setError('Cannot reach authentication server. Check your NEXT_PUBLIC_SUPABASE_URL in .env.local.')
      setLoading(false)
      return
    }
    setLoading(false)
    if (authError) { setError(authError.message); return }
    router.push('/upload')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold mb-6">Sign in</h1>
        {error && <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" required autoComplete="email"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <Link href="/forgot-password" className="text-xs text-teal-700 hover:underline">Forgot password?</Link>
            </div>
            <input type="password" required autoComplete="current-password"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-teal-700 hover:bg-teal-600 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-sm text-slate-500 text-center mt-6">
          Don't have an account?{' '}
          <Link href="/signup" className="text-teal-700 font-medium hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  )
}
