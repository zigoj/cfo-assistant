'use client'
import { useEffect, useState } from 'react'
import KpiCard from './KpiCard'
import AnomalyBadge from './AnomalyBadge'

interface ReportData {
  id: string
  status: string
  progress_pct: number
  error_msg: string | null
  report_month: string
  kpi_runway_days: number | null
  kpi_burn_rate: number | null
  kpi_gross_margin: number | null
  kpi_cash_close: number | null
  report_json: any
  org_id: string
}

export default function ReportViewer({ initialReport }: { initialReport: ReportData }) {
  const [report, setReport] = useState(initialReport)
  const isReady     = report.status === 'ready'
  const isError     = report.status === 'error'
  const isProcessing = report.status === 'processing' || report.status === 'pending'

  // Poll until ready
  useEffect(() => {
    if (isReady || isError) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/report-status?report_id=${report.id}`)
      const data = await res.json()
      setReport(prev => ({ ...prev, ...{
        status: data.status,
        progress_pct: data.progressPct,
        error_msg: data.errorMsg,
        kpi_runway_days: data.kpis?.runwayDays ?? prev.kpi_runway_days,
        kpi_burn_rate: data.kpis?.burnRate ?? prev.kpi_burn_rate,
        kpi_gross_margin: data.kpis?.grossMargin ?? prev.kpi_gross_margin,
        kpi_cash_close: data.kpis?.cashClose ?? prev.kpi_cash_close,
      }}))
    }, 3000)
    return () => clearInterval(interval)
  }, [report.id, isReady, isError])

  const monthLabel = new Date(report.report_month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const rj = report.report_json

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{monthLabel} Management Pack</h1>
          <p className="text-slate-500 text-sm mt-1 capitalize">{report.status}</p>
        </div>
        {isReady && (
          <a href={`/api/report/${report.id}?format=pdf`}
            className="bg-teal-700 hover:bg-teal-600 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm">
            Download PDF
          </a>
        )}
      </div>

      {/* Processing state */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="font-semibold text-blue-800">Generating your pack…</p>
          <p className="text-blue-600 text-sm mt-1">This takes about 60–90 seconds</p>
          <div className="mt-4 w-full bg-blue-100 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${report.progress_pct || 10}%` }} />
          </div>
          <p className="text-xs text-blue-400 mt-2">{report.progress_pct || 0}%</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="font-semibold text-red-700">Processing failed</p>
          <p className="text-red-600 text-sm mt-1">{report.error_msg ?? 'An unexpected error occurred.'}</p>
          <a href="/upload" className="mt-4 inline-block text-sm text-teal-700 font-medium hover:underline">Try uploading again →</a>
        </div>
      )}

      {/* Ready state */}
      {isReady && (
        <div className="space-y-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Cash runway" value={`${report.kpi_runway_days ?? '—'} days`}
              color={report.kpi_runway_days != null && report.kpi_runway_days < 60 ? 'red' : 'green'} />
            <KpiCard label="Net burn rate" value={fmt(report.kpi_burn_rate)} prefix="£" color="blue" />
            <KpiCard label="Gross margin" value={report.kpi_gross_margin != null ? `${(report.kpi_gross_margin * 100).toFixed(1)}%` : '—'}
              color={report.kpi_gross_margin != null && report.kpi_gross_margin < 0.5 ? 'red' : 'green'} />
            <KpiCard label="Closing cash" value={fmt(report.kpi_cash_close)} prefix="£" color="teal" />
          </div>

          {/* Anomaly flags */}
          {rj?.anomalies?.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3 text-slate-700">Anomalies to review ({rj.anomalies.length})</h2>
              <div className="space-y-2">
                {rj.anomalies.map((a: any, i: number) => (
                  <AnomalyBadge key={i} type={a.flag ?? a.type ?? 'ANOMALY'} severity={a.severity} message={a.message} suggestedEntry={a.suggested_entry} />
                ))}
              </div>
            </div>
          )}

          {/* P&L Summary */}
          {rj?.pl_summary && (
            <div>
              <h2 className="font-semibold mb-3 text-slate-700">P&L Summary</h2>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-slate-600 font-medium">Line item</th>
                      <th className="text-right px-4 py-3 text-slate-600 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rj.pl_summary.map((row: any, i: number) => (
                      <tr key={i} className={`border-b border-slate-100 ${row.is_total ? 'bg-slate-50 font-semibold' : ''}`}>
                        <td className={`px-4 py-2.5 ${row.indent ? 'pl-8 text-slate-500' : ''}`}>{row.label}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${row.value < 0 ? 'text-red-600' : ''}`}>
                          £{Math.abs(row.value).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Narrative */}
          {rj?.narrative && (
            <div>
              <h2 className="font-semibold mb-3 text-slate-700">Commentary</h2>
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {rj.narrative}
              </div>
            </div>
          )}

          {/* Suggested journal entries */}
          {rj?.suggested_journals?.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3 text-slate-700">Suggested Journal Entries</h2>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Flag</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Dr</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Cr</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-medium">Amount</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Narration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rj.suggested_journals.map((j: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{j.anomaly_flag?.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-2.5 text-slate-700">{j.dr_account}</td>
                        <td className="px-4 py-2.5 text-slate-700">{j.cr_account}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">£{Number(j.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{j.narration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Budget Variance */}
          {rj?.budget_variance?.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3 text-slate-700">Budget vs Actual</h2>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Account</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-medium">Budget</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-medium">Actual</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-medium">Variance</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rj.budget_variance.map((row: any, i: number) => {
                      const unfav = row.variance < 0
                      return (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2.5">{row.label}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">£{fmt(row.budget)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">£{fmt(row.actual)}</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${unfav ? 'text-red-600' : 'text-teal-700'}`}>
                            {unfav ? '-' : '+'}£{fmt(Math.abs(row.variance))}
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums text-xs ${unfav ? 'text-red-500' : 'text-teal-600'}`}>
                            {row.variance_pct != null ? `${unfav ? '' : '+'}${row.variance_pct}%` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GL Bridge */}
          {rj?.gl_bridge?.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3 text-slate-700">GL Bridge</h2>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Account</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-medium">Management</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-medium">TB</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-medium">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rj.gl_bridge.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5">{row.label}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">£{fmt(row.mgmt_value)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.tb_value != null ? `£${fmt(row.tb_value)}` : '—'}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${row.variance && Math.abs(row.variance) > 0.01 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                          {row.variance != null ? `£${fmt(row.variance)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function fmt(v: number | null) {
  if (v == null) return '—'
  return Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
