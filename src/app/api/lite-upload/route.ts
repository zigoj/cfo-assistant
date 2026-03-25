/**
 * B2C guest upload — no auth required.
 * Creates a temporary report row owned by a system "lite" org.
 * Returns free KPI snapshot immediately (synchronous mini-pipeline via worker).
 * Full pack unlocked after payment.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-server'
import { enqueueAnalysis } from '@/lib/worker-client'

export const maxDuration = 60  // Vercel Pro max; keeps poll window within function lifetime

const MAX_BYTES = 10 * 1024 * 1024  // 10 MB for guest uploads
const LITE_ORG_ID = (process.env.LITE_ORG_ID ?? '').trim()  // a fixed org in Supabase for B2C guests

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'At least one file required' }, { status: 400 })
  }
  const admin = createSupabaseAdmin()

  const bankFile = form.get('bank_pdf') as File | null
  const plFile   = form.get('pl_excel') as File | null

  if (!bankFile && !plFile)
    return NextResponse.json({ error: 'At least one file required' }, { status: 400 })

  const today = new Date()
  const reportMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  // Single prefix so all files for this upload share a folder
  const uploadPrefix = crypto.randomUUID()
  const storagePaths: Record<string, string | null> = { bank_pdf: null, pl_excel: null }

  for (const [key, file] of [['bank_pdf', bankFile], ['pl_excel', plFile]] as const) {
    if (!file) continue
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: `${key} exceeds 10 MB limit` }, { status: 400 })

    const ext  = file.name.split('.').pop()
    const path = `lite/${uploadPrefix}/${key}.${ext}`
    const { error } = await admin.storage
      .from('report-inputs')
      .upload(path, await file.arrayBuffer(), { contentType: file.type })
    if (error)
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 })
    storagePaths[key] = path
  }

  const { data: report, error: reportError } = await admin
    .from('reports')
    .insert({
      org_id:       LITE_ORG_ID,
      report_month: reportMonth,
      status:       'pending',
      input_bank_pdf:  storagePaths.bank_pdf,
      input_pl_excel:  storagePaths.pl_excel,
    })
    .select('id')
    .single()

  if (reportError)
    return NextResponse.json({ error: reportError.message }, { status: 500 })

  // Kick off async worker — it stores KPIs on the report row when done
  enqueueAnalysis({
    reportId:     report.id,
    orgId:        LITE_ORG_ID,
    currency:     'GBP',
    inputBankPdf: storagePaths.bank_pdf,
    inputPlExcel: storagePaths.pl_excel,
    inputTbCsv:   null,
    inputBudgetCsv: null,
  }).catch(() => {})

  // Poll for up to 54s — stays safely within the 60s maxDuration
  let snapshot = null
  for (let i = 0; i < 18; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const { data: r } = await admin
      .from('reports')
      .select('status, kpi_runway_days, kpi_burn_rate, kpi_gross_margin, kpi_cash_close')
      .eq('id', report.id)
      .single()
    if (r?.status === 'ready') {
      snapshot = {
        runwayDays:  r.kpi_runway_days,
        burnRate:    r.kpi_burn_rate ?? 0,
        grossMargin: r.kpi_gross_margin,
        cashClose:   r.kpi_cash_close ?? 0,
      }
      break
    }
    if (r?.status === 'error') break
  }

  if (!snapshot)
    return NextResponse.json({ error: 'Processing timed out — please try again' }, { status: 504 })

  return NextResponse.json({ snapshot, reportId: report.id })
}
