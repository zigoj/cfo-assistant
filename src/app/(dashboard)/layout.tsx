import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('orgs(name, tier)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  const org = (membership?.orgs as any) ?? null

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/upload" className="font-bold text-teal-700 text-lg">CFO Assistant</Link>
            <nav className="hidden sm:flex items-center gap-4 text-sm text-slate-600">
              <Link href="/upload" className="hover:text-teal-700 transition">New report</Link>
              <Link href="/reports" className="hover:text-teal-700 transition">Reports</Link>
              <Link href="/settings" className="hover:text-teal-700 transition">Settings</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {org && (
              <span className="hidden sm:inline text-slate-400">{org.name}</span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              org?.tier === 'pro' ? 'bg-teal-100 text-teal-700'
              : org?.tier === 'agency' ? 'bg-purple-100 text-purple-700'
              : 'bg-slate-100 text-slate-500'
            }`}>
              {org?.tier ?? 'free'}
            </span>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="text-slate-400 hover:text-slate-700 transition text-xs">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
