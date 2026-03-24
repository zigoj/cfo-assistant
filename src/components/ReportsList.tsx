'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Report {
  id: string
  report_month: string
  status: string
  kpi_runway_days: number | null
  kpi_gross_margin: number | null
  kpi_cash_close: number | null
}

const STATUS_BADGE: Record<string, string> = {
  ready:      'bg-green-100 text-green-700',
  processing: 'bg-blue-100 text-blue-700',
  pending:    'bg-slate-100 text-slate-500',
  error:      'bg-red-100 text-red-700',
}

export default function ReportsList({
  initialReports,
  orgId,
  isAdmin,
}: {
  initialReports: Report[]
  orgId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [reports, setReports] = useState(initialReports)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [err, setErr] = useState('')

  async function handleDelete(reportId: string) {
    if (!confirm('Delete this report permanently? This cannot be undone.')) return
    setDeleting(reportId)
    setErr('')
    const res = await fetch(`/api/delete-report?reportId=${reportId}&orgId=${orgId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setErr(data.error ?? 'Delete failed')
    } else {
      setReports(prev => prev.filter(r => r.id !== reportId))
    }
    setDeleting(null)
  }

  if (!reports.length) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-lg mb-4">No reports yet</p>
        <Link href="/upload" className="text-teal-700 font-medium hover:underline">Upload your first files →</Link>
      </div>
    )
  }

  return (
    <>
      {err && <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Month</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">Runway</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">GM%</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">Cash close</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                <td className="px-4 py-3 font-medium">
                  {new Date(r.report_month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? STATUS_BADGE.pending}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {r.kpi_runway_days != null ? `${r.kpi_runway_days}d` : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {r.kpi_gross_margin != null ? `${(r.kpi_gross_margin * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {r.kpi_cash_close != null
                    ? `£${Math.abs(r.kpi_cash_close).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/reports/${r.id}`} className="text-teal-700 font-medium hover:underline">View →</Link>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deleting === r.id}
                        className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50"
                      >
                        {deleting === r.id ? '…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
