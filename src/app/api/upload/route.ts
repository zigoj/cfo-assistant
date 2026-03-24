import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'
import { enqueueAnalysis } from '@/lib/worker-client'

const ALLOWED_TYPES: Record<string, string[]> = {
  bank_pdf:   ['application/pdf'],
  pl_excel:   ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel', 'text/csv'],
  tb_csv:     ['text/csv', 'text/plain'],
  budget_csv: ['text/csv', 'text/plain',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
}
const MAX_BYTES = 20 * 1024 * 1024  // 20 MB

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const orgId       = form.get('org_id') as string
  const reportMonth = form.get('report_month') as string   // 'YYYY-MM-DD'

  if (!orgId || !reportMonth)
    return NextResponse.json({ error: 'org_id and report_month required' }, { status: 400 })

  // Verify membership
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'Not a member of this org' }, { status: 403 })

  // Verify quota
  const admin = createSupabaseAdmin()
  const { data: org } = await admin.from('orgs').select('tier,report_quota,reports_used,currency').eq('id', orgId).single()
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  if (org.reports_used >= org.report_quota)
    return NextResponse.json({ error: 'Monthly report quota reached. Please upgrade your plan.' }, { status: 402 })

  // Upload files to Supabase Storage
  const storagePaths: Record<string, string | null> = {
    bank_pdf: null, pl_excel: null, tb_csv: null, budget_csv: null,
  }

  for (const field of ['bank_pdf', 'pl_excel', 'tb_csv', 'budget_csv'] as const) {
    const file = form.get(field) as File | null
    if (!file) continue

    if (!ALLOWED_TYPES[field].includes(file.type))
      return NextResponse.json({ error: `Invalid file type for ${field}: ${file.type}` }, { status: 400 })
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: `${field} exceeds 20 MB limit` }, { status: 400 })

    const ext = file.name.split('.').pop()
    const path = `${orgId}/${reportMonth}/${field}.${ext}`
    const { error: uploadError } = await admin.storage
      .from('report-inputs')
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })

    if (uploadError)
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })

    storagePaths[field] = path
  }

  if (!storagePaths.bank_pdf && !storagePaths.pl_excel)
    return NextResponse.json({ error: 'At least a bank PDF or P&L file is required' }, { status: 400 })

  // Create report row
  const { data: report, error: reportError } = await admin
    .from('reports')
    .insert({
      org_id:          orgId,
      created_by:      user.id,
      report_month:    reportMonth,
      status:          'pending',
      input_bank_pdf:  storagePaths.bank_pdf,
      input_pl_excel:  storagePaths.pl_excel,
      input_tb_csv:    storagePaths.tb_csv,
      input_budget_csv: storagePaths.budget_csv,
    })
    .select('id')
    .single()

  if (reportError)
    return NextResponse.json({ error: reportError.message }, { status: 500 })

  // Increment quota usage
  await admin.from('orgs').update({ reports_used: org.reports_used + 1 }).eq('id', orgId)

  // Kick off async worker
  await enqueueAnalysis({
    reportId:      report.id,
    orgId,
    currency:      org.currency ?? 'GBP',
    inputBankPdf:  storagePaths.bank_pdf,
    inputPlExcel:  storagePaths.pl_excel,
    inputTbCsv:    storagePaths.tb_csv,
    inputBudgetCsv: storagePaths.budget_csv,
  }).catch(async (err) => {
    // Mark report as error if worker enqueue fails — don't block response
    await admin.from('reports').update({ status: 'error', error_msg: err.message }).eq('id', report.id)
  })

  return NextResponse.json({ reportId: report.id }, { status: 201 })
}
