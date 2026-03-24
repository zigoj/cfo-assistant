interface KpiCardProps {
  label: string
  value: string
  prefix?: string
  color?: 'green' | 'red' | 'blue' | 'teal' | 'amber'
}

const colors = {
  green: 'bg-green-50 border-green-200 text-green-800',
  red:   'bg-red-50 border-red-200 text-red-800',
  blue:  'bg-blue-50 border-blue-200 text-blue-800',
  teal:  'bg-teal-50 border-teal-200 text-teal-800',
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
}

export default function KpiCard({ label, value, prefix, color = 'teal' }: KpiCardProps) {
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums">
        {prefix && <span className="text-lg">{prefix}</span>}
        {value}
      </p>
    </div>
  )
}
