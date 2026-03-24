import Link from 'next/link'

export const metadata = {
  title: 'About — CFO Assistant',
  description: 'How CFO Assistant works, what it produces, and who it is built for.',
}

export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20 space-y-16">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <section>
        <p className="text-teal-600 font-semibold uppercase tracking-wide text-sm mb-2">Product overview</p>
        <h1 className="text-4xl font-bold text-slate-900 mb-4 leading-tight">
          CFO Assistant — Month-End Pack<br />in 2 Minutes
        </h1>
        <p className="text-slate-600 text-lg leading-relaxed">
          CFO Assistant turns a PDF bank statement and an Excel P&L into a
          complete, board-ready management pack — automatically. No spreadsheet
          gymnastics, no copy-paste, no consultant fees.
        </p>
      </section>

      {/* ── What you upload ───────────────────────────────────────── */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">What you upload</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {[
            {
              icon: '🏦',
              title: 'Bank statement PDF',
              body: 'Any UK bank — Barclays, HSBC, Lloyds, Monzo, Starling, or any generic layout. The parser auto-detects table structure; a regex fallback and Claude Haiku handle edge cases.',
            },
            {
              icon: '📊',
              title: 'P&L (Excel or CSV)',
              body: 'Upload any column-based P&L export. The engine auto-detects the header row, maps column synonyms, and infers Revenue / COGS / OpEx sections.',
            },
            {
              icon: '🧾',
              title: 'Trial balance CSV (optional)',
              body: 'Provide a TB for a full GL bridge — comparing opening vs. closing balances and generating suggested journal entries for anomalous movements.',
            },
            {
              icon: '📈',
              title: 'Budget CSV (optional)',
              body: 'Add a budget file to get actuals-vs-budget variance columns in every table and a variance commentary in the narrative.',
            },
          ].map(({ icon, title, body }) => (
            <div key={title} className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What you get ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">What you get</h2>
        <div className="space-y-5">
          {[
            {
              tag: 'KPI Snapshot',
              items: ['Cash runway (days)', 'Monthly burn rate', 'Gross margin %', 'Closing cash balance'],
            },
            {
              tag: 'P&L Summary',
              items: ['Revenue, COGS, Gross Profit, EBITDA, PBT, PAT', 'Actuals vs. budget (if budget provided)', 'Month-on-month variance'],
            },
            {
              tag: 'Cash-Flow Statement',
              items: ['Operating / investing / financing split', 'Categorised from bank transactions', 'Top 5 cost buckets by category'],
            },
            {
              tag: 'Anomaly Flags',
              items: ['Duplicate payments', 'Round-number outliers', 'Payroll timing anomalies', 'Large statistical outliers (z-score)', 'Inbound payments without invoice reference'],
            },
            {
              tag: 'AI Narrative',
              items: ['~250-word management commentary (Claude Sonnet)', 'GL bridge & suggested journal entries (Claude Haiku)', 'Plain-English explanation of every anomaly'],
            },
            {
              tag: 'Board-Ready PDF',
              items: ['A4 print layout (WeasyPrint)', 'KPI cards, P&L table, cash-flow, cost chart, anomaly table', 'Delivered by email and available for instant download'],
            },
          ].map(({ tag, items }) => (
            <div key={tag} className="flex gap-4">
              <div className="shrink-0 mt-0.5 w-28 text-right">
                <span className="bg-teal-100 text-teal-700 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
                  {tag}
                </span>
              </div>
              <ul className="text-slate-600 text-sm space-y-1">
                {items.map(i => (
                  <li key={i} className="flex gap-2"><span className="text-teal-500 mt-0.5">•</span>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">How it works under the hood</h2>
        <ol className="space-y-4 text-slate-600 text-sm">
          {[
            ['Upload', 'Files land in Supabase Storage. A report row is created and the pipeline is queued as a background task.'],
            ['Parse', 'pdfplumber extracts bank tables; pandas reads the P&L Excel/CSV. A confidence score is attached to each parsed row.'],
            ['Categorise', 'A JSON rules engine evaluates each transaction against 15+ rules (priority-ordered, org-overridable). Low-confidence rows are enriched via Claude Haiku.'],
            ['Anomaly detection', 'Five anomaly rules run: duplicate detection (SequenceMatcher), z-score outlier, round-number check, payroll timing window, and unmatched inbound.'],
            ['KPI calculation', 'Burn rate, runway, gross margin, and net cash-flow are derived from the categorised transaction set and P&L lines.'],
            ['Narrative', 'Claude Sonnet generates a ~250-word management commentary. Claude Haiku suggests corrective journal entries for high/medium anomalies.'],
            ['Render & deliver', 'WeasyPrint renders the HTML template to A4 PDF. The PDF is uploaded to Supabase Storage, the report row is updated to "ready", and Resend delivers the email.'],
          ].map(([step, desc], i) => (
            <li key={step} className="flex gap-4">
              <span className="shrink-0 w-6 h-6 bg-teal-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div>
                <span className="font-semibold text-slate-800">{step} — </span>
                {desc}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Tech stack ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Tech stack</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-slate-600">
          {[
            ['Frontend', 'Next.js 16 App Router, Tailwind CSS'],
            ['Auth & DB', 'Supabase Auth + PostgreSQL (RLS)'],
            ['Storage', 'Supabase Storage (report-inputs / report-outputs)'],
            ['Payments', 'Stripe (subscriptions + one-off checkout)'],
            ['Email', 'Resend'],
            ['Worker', 'Python FastAPI (background tasks)'],
            ['Parsing', 'pdfplumber, pandas, openpyxl'],
            ['AI', 'Anthropic Claude Haiku + Sonnet'],
            ['PDF render', 'WeasyPrint (A4 HTML → PDF)'],
            ['Rules engine', 'JSON rules + Supabase org overrides'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="font-semibold text-slate-800 w-28 shrink-0">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="bg-teal-700 text-white rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Ready to get started?</h2>
        <p className="text-teal-200 text-sm mb-6">
          14-day free trial · no credit card needed for the first 7 days
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/signup?plan=starter"
            className="bg-white text-teal-700 font-bold px-8 py-3 rounded-xl hover:bg-teal-50 transition">
            Start free trial
          </Link>
          <Link href="/lite"
            className="border border-teal-400 text-teal-200 font-semibold px-8 py-3 rounded-xl hover:bg-teal-600 transition">
            Try the free snapshot →
          </Link>
        </div>
      </section>

      <footer className="text-center text-xs text-slate-400">
        <Link href="/" className="hover:text-slate-600">← Back to home</Link>
      </footer>
    </main>
  )
}
