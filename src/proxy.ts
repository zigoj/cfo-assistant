import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Routes that require authentication
const PROTECTED = ['/upload', '/reports', '/settings']
// Routes that should redirect to /upload if already logged in
const AUTH_ROUTES = ['/login', '/signup']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  let res = NextResponse.next({ request: req })

  // Skip auth check if Supabase env vars are not configured yet
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return res
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    }
  )

  // Session refresh only — route protection is handled client-side
  await supabase.auth.getUser()

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/stripe-webhook|api/lite-upload).*)',
  ],
}
