import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll().map(c => c.name)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  return NextResponse.json({
    cookies: allCookies,
    user: user ? { id: user.id, email: user.email } : null,
  })
}
