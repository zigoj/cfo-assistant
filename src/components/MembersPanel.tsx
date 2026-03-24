'use client'
import { useState, useEffect, useCallback } from 'react'

interface Member {
  id: string
  user_id: string
  role: string
  email: string | null
  created_at: string
}

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-teal-100 text-teal-700',
  member: 'bg-slate-100 text-slate-600',
}

export default function MembersPanel({
  orgId,
  currentUserId,
  isAdmin,
}: {
  orgId: string
  currentUserId: string
  isAdmin: boolean
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [inviting, setInviting] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/invite-member?orgId=${orgId}`)
    const data = await res.json()
    setMembers(data.members ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setMsg(null)
    const res = await fetch('/api/invite-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, email, role }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMsg({ text: data.error ?? 'Invite failed', ok: false })
    } else {
      setMsg({
        text: data.status === 'added_existing'
          ? `${email} added to team.`
          : `Invite sent to ${email}.`,
        ok: true,
      })
      setEmail('')
      load()
    }
    setInviting(false)
  }

  async function handleRemove(memberId: string) {
    setRemoving(memberId)
    const res = await fetch(`/api/invite-member?memberId=${memberId}&orgId=${orgId}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    if (!res.ok) {
      setMsg({ text: data.error ?? 'Remove failed', ok: false })
    } else {
      setMembers(prev => prev.filter(m => m.id !== memberId))
    }
    setRemoving(null)
  }

  return (
    <div>
      {/* Member list */}
      {loading ? (
        <p className="text-sm text-slate-400 py-2">Loading…</p>
      ) : (
        <ul className="divide-y divide-slate-100 mb-5">
          {members.map(m => (
            <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-800 truncate">{m.email ?? m.user_id}</p>
                <p className="text-xs text-slate-400">
                  Joined {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_BADGE[m.role] ?? ROLE_BADGE.member}`}>
                  {m.role}
                </span>
                {isAdmin && m.user_id !== currentUserId && m.role !== 'owner' && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    disabled={removing === m.id}
                    className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50"
                  >
                    {removing === m.id ? '…' : 'Remove'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Invite form — admin/owner only */}
      {isAdmin && (
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              required
              placeholder="colleague@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value as 'admin' | 'member')}
              className="text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {msg && (
            <p className={`text-xs ${msg.ok ? 'text-teal-700' : 'text-red-600'}`}>{msg.text}</p>
          )}
          <button
            type="submit"
            disabled={inviting}
            className="w-full text-sm bg-teal-700 hover:bg-teal-600 text-white font-semibold py-2 rounded-lg transition disabled:opacity-60"
          >
            {inviting ? 'Sending…' : 'Invite team member'}
          </button>
        </form>
      )}
    </div>
  )
}
