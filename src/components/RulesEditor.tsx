'use client'
import { useState } from 'react'

interface Rule {
  id: string
  org_id: string | null
  rule_key: string
  name: string
  priority: number
  conditions: unknown
  action: unknown
  is_active: boolean
}

const BLANK_COND = JSON.stringify({ field: 'description', op: 'contains', value: '' }, null, 2)
const BLANK_ACT  = JSON.stringify({ category: '', type: 'expense' }, null, 2)

export default function RulesEditor({
  orgId,
  initialRules,
  isAdmin,
}: {
  orgId: string
  initialRules: Rule[]
  isAdmin: boolean
}) {
  const [rules, setRules] = useState(initialRules)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [err, setErr] = useState('')

  // New rule form state
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    rule_key: '', name: '', priority: '20',
    conditions: BLANK_COND, action: BLANK_ACT,
  })
  const [formErr, setFormErr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function toggleActive(rule: Rule) {
    setSaving(rule.id)
    setErr('')
    const updated = { ...rule, is_active: !rule.is_active, org_id: orgId }
    const res = await fetch('/api/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, rule: updated }),
    })
    const data = await res.json()
    if (!res.ok) { setErr(data.error ?? 'Save failed') }
    else {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active, org_id: orgId } : r))
    }
    setSaving(null)
  }

  async function deleteRule(rule: Rule) {
    if (!rule.org_id) return // can't delete global defaults via UI
    setDeleting(rule.id)
    setErr('')
    const res = await fetch(`/api/rules?id=${rule.id}&orgId=${orgId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { setErr(data.error ?? 'Delete failed') }
    else { setRules(prev => prev.filter(r => r.id !== rule.id)) }
    setDeleting(null)
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault()
    setFormErr('')
    let cond: unknown, act: unknown
    try { cond = JSON.parse(form.conditions) } catch { setFormErr('Conditions is not valid JSON'); return }
    try { act  = JSON.parse(form.action) } catch { setFormErr('Action is not valid JSON'); return }

    setSubmitting(true)
    const res = await fetch('/api/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId,
        rule: {
          rule_key: form.rule_key,
          name: form.name,
          priority: parseInt(form.priority, 10),
          conditions: cond,
          action: act,
          is_active: true,
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) { setFormErr(data.error ?? 'Save failed') }
    else {
      setRules(prev => [data.rule, ...prev.filter(r => r.rule_key !== data.rule.rule_key)])
      setShowForm(false)
      setForm({ rule_key: '', name: '', priority: '20', conditions: BLANK_COND, action: BLANK_ACT })
    }
    setSubmitting(false)
  }

  return (
    <div>
      {err && <p className="text-xs text-red-600 mb-3">{err}</p>}

      {/* Rules table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Rule</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium hidden md:table-cell">Key</th>
              <th className="text-center px-4 py-3 text-slate-500 font-medium w-16">Pri</th>
              <th className="text-center px-4 py-3 text-slate-500 font-medium w-16">Source</th>
              <th className="text-center px-4 py-3 text-slate-500 font-medium w-16">Active</th>
              {isAdmin && <th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-xs">No rules found.</td></tr>
            )}
            {rules.map(rule => (
              <tr key={rule.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-800">{rule.name}</td>
                <td className="px-4 py-2.5 text-slate-400 font-mono text-xs hidden md:table-cell">{rule.rule_key}</td>
                <td className="px-4 py-2.5 text-center text-slate-500">{rule.priority}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${rule.org_id ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                    {rule.org_id ? 'custom' : 'global'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {isAdmin ? (
                    <button
                      onClick={() => toggleActive(rule)}
                      disabled={saving === rule.id}
                      title={rule.is_active ? 'Disable' : 'Enable'}
                      className={`w-9 h-5 rounded-full transition-colors focus:outline-none ${rule.is_active ? 'bg-teal-500' : 'bg-slate-200'} ${saving === rule.id ? 'opacity-50' : ''}`}
                    >
                      <span className={`block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform mx-0.5 ${rule.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  ) : (
                    <span className={`w-2 h-2 rounded-full inline-block ${rule.is_active ? 'bg-teal-500' : 'bg-slate-300'}`} />
                  )}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2.5 text-center">
                    {rule.org_id && (
                      <button
                        onClick={() => deleteRule(rule)}
                        disabled={deleting === rule.id}
                        className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50"
                      >
                        {deleting === rule.id ? '…' : '✕'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add rule */}
      {isAdmin && (
        showForm ? (
          <form onSubmit={addRule} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-slate-700 text-sm">New rule override</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Rule key (unique)</label>
                <input required value={form.rule_key} onChange={e => setForm(f => ({ ...f, rule_key: e.target.value }))}
                  placeholder="my_custom_rule"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Display name</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="My custom rule"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Priority (higher = checked first)</label>
              <input type="number" min="1" max="100" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Conditions (JSON)</label>
              <textarea rows={4} value={form.conditions} onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))}
                className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Action (JSON)</label>
              <textarea rows={3} value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
                className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y" />
            </div>
            {formErr && <p className="text-xs text-red-600">{formErr}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={submitting}
                className="text-sm bg-teal-700 hover:bg-teal-600 text-white font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60">
                {submitting ? 'Saving…' : 'Save rule'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormErr('') }}
                className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 transition">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="text-sm text-teal-700 font-semibold hover:underline">
            + Add custom rule
          </button>
        )
      )}
    </div>
  )
}
