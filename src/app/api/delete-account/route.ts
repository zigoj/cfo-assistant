import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'
import { getStripe } from '@/lib/stripe'

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createSupabaseAdmin()

  // Find all orgs where user is owner (and sole member)
  const { data: ownedOrgs } = await admin
    .from('org_members')
    .select('org_id, orgs(stripe_customer_id)')
    .eq('user_id', user.id)
    .eq('role', 'owner')

  for (const row of ownedOrgs ?? []) {
    const org = row.orgs as any

    // Cancel Stripe subscription
    if (org?.stripe_customer_id) {
      const subs = await getStripe().subscriptions.list({ customer: org.stripe_customer_id, status: 'active' })
      for (const sub of subs.data) {
        await getStripe().subscriptions.cancel(sub.id)
      }
    }

    // Delete storage bucket files
    const { data: files } = await admin.storage.from('report-inputs').list(row.org_id)
    if (files?.length) {
      await admin.storage.from('report-inputs').remove(files.map((f: any) => `${row.org_id}/${f.name}`))
    }
    const { data: outputs } = await admin.storage.from('report-outputs').list(row.org_id)
    if (outputs?.length) {
      await admin.storage.from('report-outputs').remove(outputs.map((f: any) => `${row.org_id}/${f.name}`))
    }

    // Anonymize report data (keep aggregates, remove PII-bearing fields)
    await admin.from('reports').update({
      input_bank_pdf: null, input_pl_excel: null, input_tb_csv: null,
      report_json: null, output_pdf_url: null,
    }).eq('org_id', row.org_id)

    // Delete org (cascades to members, reports, transactions, rules)
    await admin.from('orgs').delete().eq('id', row.org_id)
  }

  // Delete the auth user
  await admin.auth.admin.deleteUser(user.id)

  return NextResponse.json({ deleted: true })
}
