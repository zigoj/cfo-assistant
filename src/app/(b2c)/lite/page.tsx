'use client'
import { useState } from 'react'
import Link from 'next/link'

interface FreeResult {
  runwayDays: number | null
  burnRate: number
  grossMargin: number | null
  cashClose: number
  reportId?: string
}

export default function LitePage() {
  const [bankFile, setBankFile]     = useState<File | null>(null)
  const [plFile, setPlFile]         = useState<File | null>(null)
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState<FreeResult | null>(null)
  const [reportId, setReportId]     = useState<string | null>(null)
  const [error, setError]           = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!bankFile && !plFile) { setError('Upload at least one file to get your snapshot'); return }
    setError('')
    setLoading(true)

    // Guest upload — creates a temporary anonymous report
    const fd = new FormData()
    fd.append('mode', 'lite')
    if (bankFile) fd.append('bank_pdf', bankFile)
    if (plFile) fd.append('pl_excel', plFile)

    const res = await fetch('/api/lite-upload', { method: 'POST', body: fd })
    if (!res.ok) {
      const { error: msg } = await res.json()
      setError(msg ?? 'Could not process your files')
      setLoading(false)
      return
    }
    const data = await res.json()
    setResult(data.snapshot)
    setReportId(data.reportId)
    setLoading(false)
  }

  const sym = '£'
  const runwayColor = result && result.runwayDays != null && result.runwayDays < 60 ? '#dc2626' : '#059669'

  async function handleBuyPack() {
    if (!reportId) return
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey: 'b2c_pack', reportId }),
    })
    const { checkoutUrl, error: err } = await res.json()
    if (err) { setError(err); return }
    window.location.href = checkoutUrl
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-900 to-teal-700 text-white">
      <div className="max-w-lg mx-auto px-4 py-16">
        <Link href="/" className="text-teal-300 text-sm hover:text-white transition mb-6 inline-block">← Back</Link>

        <h1 className="text-3xl font-bold mb-3">Free Cash Snapshot</h1>
        <p className="text-teal-100 mb-10">
          Drop in your bank statement and P&amp;L. We'll tell you how long your cash lasts — free, instantly.
        </p>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'Bank statement (PDF)', accept: '.pdf', state: bankFile, set: setBankFile },
              { label: 'P&L (Excel or CSV)', accept: '.xlsx,.xls,.csv', state: plFile, set: setPlFile },
            ].map(({ label, accept, state, set }) => (
              <div key={label}
                onClick={() => document.getElementById(`lite-${label}`)?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition
                  ${state ? 'border-teal-300 bg-teal-900/40' : 'border-teal-600 hover:border-teal-400'}`}>
                <input id={`lite-${label}`} type="file" accept={accept} className="hidden"
                  onChange={e => set(e.target.files?.[0] ?? null)} />
                {state ? (
                  <p className="text-teal-300 text-sm font-medium">✓ {state.name}</p>
                ) : (
                  <p className="text-teal-200 text-sm">{label} — drop or click</p>
                )}
              </div>
            ))}

            {error && <p className="text-red-300 text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-teal-400 hover:bg-teal-300 text-slate-900 font-bold py-3.5 rounded-xl transition disabled:opacity-60">
              {loading ? 'Analysing…' : 'Get my free snapshot →'}
            </button>
            <p className="text-xs text-teal-400 text-center">No account required · files deleted after 1 hour</p>
          </form>
        ) : (
          <div className="space-y-6">
            {/* The hook — cash runway front and centre */}
            <div className="bg-white/10 backdrop-blur rounded-2xl p-8 text-center border border-white/20">
              <p className="text-teal-200 text-sm font-medium uppercase tracking-wide mb-2">Your cash lasts</p>
              <p className="text-7xl font-black tabular-nums" style={{ color: runwayColor }}>
                {result.runwayDays ?? '—'}
              </p>
              <p className="text-teal-200 text-lg mt-1">days</p>
              {result.runwayDays != null && result.runwayDays < 60 && (
                <p className="text-red-300 text-sm mt-3 font-medium">⚠ Less than 60 days — action recommended</p>
              )}
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Burn rate', value: `${sym}${Math.abs(result.burnRate).toLocaleString('en-GB', { maximumFractionDigits: 0 })}/mo` },
                { label: 'Gross margin', value: result.grossMargin != null ? `${(result.grossMargin * 100).toFixed(1)}%` : '—' },
                { label: 'Cash close', value: `${sym}${Math.abs(result.cashClose).toLocaleString('en-GB', { maximumFractionDigits: 0 })}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-teal-300 text-xs mb-1">{label}</p>
                  <p className="font-bold tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            {/* Upsell */}
            <div className="bg-teal-800/60 border border-teal-500 rounded-2xl p-6">
              <p className="font-semibold mb-1">Get the full management pack</p>
              <p className="text-teal-200 text-sm mb-4">
                P&L summary · cash-flow statement · anomaly flags · GL bridge · board-ready PDF
              </p>
              <div className="flex gap-3">
                <button onClick={handleBuyPack}
                  className="flex-1 text-center bg-teal-400 hover:bg-teal-300 text-slate-900 font-bold py-2.5 rounded-xl transition text-sm">
                  Get full pack — £19
                </button>
                <Link href="/signup?plan=starter"
                  className="flex-1 text-center border border-teal-400 text-teal-200 hover:bg-teal-700 font-semibold py-2.5 rounded-xl transition text-sm">
                  Monthly plan
                </Link>
              </div>
            </div>

            <button onClick={() => { setResult(null); setReportId(null) }}
              className="w-full text-center text-sm text-teal-400 hover:text-white transition">
              ← Try another file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
