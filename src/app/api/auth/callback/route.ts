/**
 * Supabase Auth callback — handles magic-link and OAuth redirects.
 * Exchanges the code for a session, then:
 *   - If user metadata contains pending_org_id (invite flow), adds them to the org.
 *   - Redirects to the intended page.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/upload'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Check for pending invite metadata set by /api/invite-member
      const { data: { user } } = await supabase.auth.getUser()
      const meta = user?.user_metadata ?? {}
      const pendingOrgId   = meta.pending_org_id as string | undefined
      const pendingRole    = (meta.pending_role as string | undefined) ?? 'member'

      if (user && pendingOrgId) {
        const admin = createSupabaseAdmin()
        // Insert membership (ignore conflict — user may have been added already)
        await admin.from('org_members').upsert(
          { org_id: pendingOrgId, user_id: user.id, role: pendingRole },
          { onConflict: 'org_id,user_id', ignoreDuplicates: true }
        )
        // Clear the pending metadata so it doesn't re-trigger on next login
        await admin.auth.admin.updateUserById(user.id, {
          user_metadata: { ...meta, pending_org_id: null, pending_role: null },
        })
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Exchange failed — send back to login with error flag
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
