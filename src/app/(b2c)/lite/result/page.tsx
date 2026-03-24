'use client'
/**
 * /lite/result?session_id=cs_…&reportId=…
 * Shown after Stripe checkout success for the B2C one-off pack.
 * Polls /api/report-status until the full PDF is ready, then offers download.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

interface ReportStatus {
  status:    string
  reportUrl: string | null
  kpis?: {
    runwayDays:  number | null
    burnRate:    number
    grossMargin: number | null
    cashClose:   number
  }
}

function ResultContent() {
  const params   = useSearchParams()
  const reportId = params.get('reportId')
  const session  = params.get('session_id')

  const [report, setReport] = useState<ReportStatus | null>(null)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (!reportId) return

    let attempts = 0
    const MAX    = 40  // 2 min

    const poll = async () => {
      attempts++
      try {
        const res  = await fetch(`/api/report-status?reportId=${reportId}`)
        const data = await res.json()
        if (data.status === 'ready') {
          setReport(data)
          return
        }
        if (data.status === 'error') {
          setError('Processing failed — please contact support.')
          return
        }
      } catch {
        // transient network error — keep polling
      }
      if (attempts < MAX) setTimeout(poll, 3000)
      else setError('Processing is taking longer than expected — check back in a few minutes.')
    }

    poll()
  }, [reportId])

  const sym = '£'

  if (!reportId) {
    return (
      <div className="text-center py-24">
        <p className="text-red-300 mb-4">No report ID found. Did you arrive here by mistake?</p>
        <Link href="/lite" className="text-teal-300 hover:text-white transition">← Try again</Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <Link href="/" className="text-teal-300 text-sm hover:text-white transition mb-6 inline-block">← Back to home</Link>

      {error ? (
        <div className="bg-red-900/40 border border-red-500 rounded-2xl p-6 text-center">
          <p className="text-red-200 font-medium mb-2">Something went wrong</p>
          <p className="text-red-300 text-sm">{error}</p>
          <a href="mailto:hello@cfoassistant.com" className="text-teal-300 text-sm mt-4 inline-block hover:text-white transition">
            Contact support →
          </a>
        </div>
      ) : !report ? (
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mb-6" />
          <h1 className="text-2xl font-bold mb-2">Building your management pack…</h1>
          <p className="text-teal-200 text-sm">
            Analysing transactions, running anomaly checks, and generating your narrative.
            This usually takes under 60 seconds.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Success header */}
          <div className="text-center">
            <div className="text-5xl mb-3">✅</div>
            <h1 className="text-3xl font-bold mb-2">Your pack is ready</h1>
            <p className="text-teal-200 text-sm">Payment confirmed · full management pack generated</p>
          </div>

          {/* KPI summary */}
          {report.kpis && (
            <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20">
              <p className="text-teal-300 text-xs font-semibold uppercase tracking-wide mb-4">Snapshot</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Cash runway', value: report.kpis.runwayDays != null ? `${report.kpis.runwayDays} days` : '—', warn: (report.kpis.runwayDays ?? 999) < 60 },
                  { label: 'Burn rate',   value: `${sym}${Math.abs(report.kpis.burnRate).toLocaleString('en-GB', { maximumFractionDigits: 0 })}/mo` },
                  { label: 'Gross margin', value: report.kpis.grossMargin != null ? `${(report.kpis.grossMargin * 100).toFixed(1)}%` : '—' },
                  { label: 'Cash close',   value: `${sym}${Math.abs(report.kpis.cashClose).toLocaleString('en-GB', { maximumFractionDigits: 0 })}` },
                ].map(({ label, value, warn }) => (
                  <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                    <p className="text-teal-300 text-xs mb-1">{label}</p>
                    <p className={`font-bold tabular-nums ${warn ? 'text-red-300' : ''}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download CTA */}
          {report.reportUrl ? (
            <a href={report.reportUrl} target="_blank" rel="noreferrer"
              className="block w-full text-center bg-teal-400 hover:bg-teal-300 text-slate-900 font-bold py-4 rounded-2xl transition text-lg">
              Download full pack (PDF) →
            </a>
          ) : (
            <div className="bg-white/10 rounded-2xl p-4 text-center text-teal-300 text-sm">
              PDF generation in progress — refresh in a moment
            </div>
          )}

          {/* Upsell to subscription */}
          <div className="bg-teal-900/60 border border-teal-600 rounded-2xl p-5 text-sm">
            <p className="font-semibold mb-1">Get this every month automatically</p>
            <p className="text-teal-300 mb-3">
              Starter plan — unlimited reports, anomaly alerts, GL bridge, and board-ready pack delivered on the 1st.
            </p>
            <Link href="/signup?plan=starter"
              className="block text-center border border-teal-400 text-teal-200 hover:bg-teal-700 font-semibold py-2.5 rounded-xl transition">
              Start free 14-day trial →
            </Link>
          </div>

          {/* Link back */}
          <p className="text-center text-xs text-teal-500">
            Report ID: <span className="font-mono">{reportId}</span> · save this for support requests
          </p>
        </div>
      )}
    </div>
  )
}

export default function LiteResultPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-900 to-teal-700 text-white">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-10 h-10 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <ResultContent />
      </Suspense>
    </div>
  )
}
