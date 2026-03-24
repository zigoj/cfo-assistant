interface AnomalyBadgeProps {
  type: string
  severity: 'high' | 'medium' | 'low'
  message: string
  suggestedEntry?: string
}

const severityStyles = {
  high:   { bar: 'bg-red-500',   bg: 'bg-red-50 border-red-200',   text: 'text-red-800',   label: 'High' },
  medium: { bar: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', label: 'Medium' },
  low:    { bar: 'bg-blue-400',  bg: 'bg-blue-50 border-blue-200',  text: 'text-blue-800',  label: 'Low' },
}

export default function AnomalyBadge({ type, severity, message, suggestedEntry }: AnomalyBadgeProps) {
  const s = severityStyles[severity] ?? severityStyles.low
  return (
    <div className={`flex gap-3 border rounded-xl overflow-hidden ${s.bg}`}>
      <div className={`w-1 flex-shrink-0 ${s.bar}`} />
      <div className="py-3 pr-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-bold uppercase tracking-wide ${s.text}`}>{s.label}</span>
          <span className="text-xs text-slate-400">{type.replace(/_/g, ' ')}</span>
        </div>
        <p className="text-sm text-slate-700">{message}</p>
        {suggestedEntry && (
          <p className="text-xs text-slate-500 mt-1 italic">Suggestion: {suggestedEntry}</p>
        )}
      </div>
    </div>
  )
}
