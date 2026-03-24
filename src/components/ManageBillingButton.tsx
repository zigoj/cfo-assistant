'use client'
import { useState } from 'react'

export default function ManageBillingButton({ orgId }: { orgId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/customer-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to open billing portal'); setLoading(false); return }
    window.location.href = data.url
  }

  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-sm text-teal-700 font-semibold hover:underline disabled:opacity-50 transition"
      >
        {loading ? 'Opening…' : 'Manage billing & invoices →'}
      </button>
    </div>
  )
}
