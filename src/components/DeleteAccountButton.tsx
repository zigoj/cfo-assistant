'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteAccountButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete your account permanently? This cannot be undone.')) return
    setLoading(true)
    const res = await fetch('/api/delete-account', { method: 'DELETE' })
    if (res.ok) {
      router.push('/')
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Unknown error' }))
      alert(`Delete failed: ${error}`)
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-sm text-red-600 border border-red-200 hover:bg-red-50 px-4 py-2 rounded-xl transition disabled:opacity-60"
    >
      {loading ? 'Deleting…' : 'Delete account'}
    </button>
  )
}
