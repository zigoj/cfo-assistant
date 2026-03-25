'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface FileSlot {
  key: 'bank_pdf' | 'pl_excel' | 'tb_csv' | 'budget_csv'
  label: string
  accept: string
  required: boolean
  hint: string
}

interface FileSlotWithSample extends FileSlot {
  sample?: string
}

const SLOTS: FileSlotWithSample[] = [
  { key: 'bank_pdf',    label: 'Bank statement (PDF)',          accept: '.pdf',                  required: true,  hint: 'Digital PDF from your bank — any major UK bank supported', sample: '/templates/bank_statement_demo.pdf' },
  { key: 'pl_excel',   label: 'P&L (Excel or CSV)',            accept: '.xlsx,.xls,.csv',        required: true,  hint: 'Your own P&L template — we map columns automatically', sample: '/templates/pl_demo.xlsx' },
  { key: 'tb_csv',     label: 'Trial balance (CSV) — optional', accept: '.csv',                  required: false, hint: 'For GL bridge reconciliation' },
  { key: 'budget_csv', label: 'Budget (Excel or CSV) — optional', accept: '.xlsx,.xls,.csv',     required: false, hint: 'For budget vs. actual comparison' },
]

export default function UploadForm({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [files, setFiles]           = useState<Partial<Record<FileSlot['key'], File>>>({})
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [uploading, setUploading]   = useState(false)
  const [progress, setProgress]     = useState(0)
  const [error, setError]           = useState('')

  function handleFile(key: FileSlot['key'], file: File | null) {
    setFiles(prev => file ? { ...prev, [key]: file } : (({ [key]: _, ...rest }) => rest)(prev))
  }

  const handleDrop = useCallback((key: FileSlot['key'], e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(key, file)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.bank_pdf && !files.pl_excel) { setError('Upload at least a bank PDF or P&L file'); return }
    setError('')
    setUploading(true)
    setProgress(10)

    const fd = new FormData()
    fd.append('org_id', orgId)
    fd.append('report_month', reportMonth)
    for (const [key, file] of Object.entries(files)) fd.append(key, file)

    setProgress(30)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    setProgress(70)

    if (!res.ok) {
      const { error: msg } = await res.json()
      setError(msg ?? 'Upload failed')
      setUploading(false)
      setProgress(0)
      return
    }

    const { reportId } = await res.json()
    setProgress(100)
    router.push(`/reports/${reportId}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Month picker */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Report month</label>
        <input type="month" required
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={reportMonth.slice(0, 7)}
          onChange={e => setReportMonth(e.target.value + '-01')} />
      </div>

      {/* File slots */}
      {SLOTS.map(slot => (
        <div key={slot.key}>
          <label className="flex items-center justify-between text-sm font-medium text-slate-700 mb-1">
            <span>
              {slot.label}
              {slot.required && <span className="text-red-500 ml-1">*</span>}
            </span>
            {slot.sample && (
              <a href={slot.sample} download className="text-xs text-teal-600 hover:underline font-normal" onClick={e => e.stopPropagation()}>
                ↓ sample
              </a>
            )}
          </label>
          <div
            onDrop={e => handleDrop(slot.key, e)}
            onDragOver={e => e.preventDefault()}
            onClick={() => document.getElementById(`file-${slot.key}`)?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition
              ${files[slot.key] ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'}`}
          >
            <input id={`file-${slot.key}`} type="file" accept={slot.accept} className="hidden"
              onChange={e => handleFile(slot.key, e.target.files?.[0] ?? null)} />
            {files[slot.key] ? (
              <div className="flex items-center justify-center gap-2 text-sm text-teal-700 font-medium">
                <span>✓</span>
                <span>{files[slot.key]!.name}</span>
                <button type="button" onClick={ev => { ev.stopPropagation(); handleFile(slot.key, null) }}
                  className="text-slate-400 hover:text-red-500 ml-2">✕</button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600">Drop file here or <span className="text-teal-700 font-medium">browse</span></p>
                <p className="text-xs text-slate-400 mt-1">{slot.hint}</p>
                <p className="text-xs text-slate-300 mt-1">{slot.accept.replace(/\./g, '').toUpperCase()}</p>
              </div>
            )}
          </div>
        </div>
      ))}

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {uploading && (
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div className="bg-teal-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}

      <button type="submit" disabled={uploading}
        className="w-full bg-teal-700 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60">
        {uploading ? `Uploading… ${progress}%` : 'Generate management pack →'}
      </button>
    </form>
  )
}
