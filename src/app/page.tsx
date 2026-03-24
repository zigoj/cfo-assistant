import Link from "next/link";

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-teal-900 to-teal-700 text-white py-24 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-bold max-w-3xl mx-auto leading-tight mb-6">
          Month-end management packs.<br />Generated in 2 minutes.
        </h1>
        <p className="text-teal-100 text-lg max-w-xl mx-auto mb-10">
          Upload your bank statement and P&amp;L. Get a board-ready PDF with P&amp;L
          summary, cash-flow, KPIs, and GL bridge — no spreadsheet gymnastics.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="bg-teal-400 hover:bg-teal-300 text-slate-900 font-bold px-8 py-4 rounded-xl transition-transform hover:-translate-y-0.5"
          >
            Start free trial — 14 days free
          </Link>
          <Link
            href="/lite"
            className="border border-teal-400 text-teal-200 hover:bg-teal-900/40 font-semibold px-8 py-4 rounded-xl transition"
          >
            Try the free snapshot →
          </Link>
        </div>
      </section>

      {/* Stats strip */}
      <section className="bg-white border-b border-slate-100 py-10 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: "Avg processing time", value: "< 2 min" },
            { label: "Banks supported", value: "50+" },
            { label: "P&L formats", value: "Any Excel / CSV" },
            { label: "Gross margin", value: "≥ 80%" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-3xl font-bold text-teal-700">{value}</div>
              <div className="text-sm text-slate-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-12">How it works</h2>
        <div className="grid md:grid-cols-3 gap-10">
          {[
            {
              step: "1",
              title: "Upload your files",
              desc: "Drop in your PDF bank statement and P&L Excel. Optionally add a trial-balance CSV.",
            },
            {
              step: "2",
              title: "AI does the work",
              desc: "Transactions are parsed, categorized, anomalies flagged, and KPIs calculated automatically.",
            },
            {
              step: "3",
              title: "Download your pack",
              desc: "A board-ready PDF lands in your inbox and dashboard within 2 minutes.",
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="text-center">
              <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 font-bold text-xl flex items-center justify-center mx-auto mb-4">
                {step}
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-slate-500 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-slate-100 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">Simple pricing</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: "Starter",
                price: "£89",
                period: "/mo",
                meta: "3 reports/mo · 1 user",
                features: ["PDF bank parsing", "P&L import", "Cash-flow summary", "KPI pack", "Email delivery"],
                cta: "Start free trial",
                href: "/signup?plan=starter",
                highlight: false,
              },
              {
                name: "Pro",
                price: "£249",
                period: "/mo",
                meta: "12 reports/mo · 5 users",
                features: ["Everything in Starter", "White-label PDF", "Rules editor", "GL bridge", "Multi-month history"],
                cta: "Start free trial",
                href: "/signup?plan=pro",
                highlight: true,
              },
              {
                name: "Agency",
                price: "£599",
                period: "/mo",
                meta: "Unlimited reports · 20 users",
                features: ["Everything in Pro", "Budget vs. actual", "ML forecast (v2)", "Priority support", "API access (v2)"],
                cta: "Start free trial",
                href: "/signup?plan=agency",
                highlight: false,
              },
            ].map(({ name, price, period, meta, features, cta, href, highlight }) => (
              <div
                key={name}
                className={`rounded-2xl p-8 ${
                  highlight
                    ? "bg-teal-700 text-white ring-2 ring-teal-400"
                    : "bg-white border border-slate-200"
                }`}
              >
                <div className="font-bold text-lg mb-1">{name}</div>
                <div className="text-3xl font-bold mb-1">
                  {price}
                  <span className="text-sm font-normal opacity-70">{period}</span>
                </div>
                <div className={`text-sm mb-6 ${highlight ? "text-teal-200" : "text-slate-500"}`}>{meta}</div>
                <ul className="space-y-2 mb-8">
                  {features.map((f) => (
                    <li key={f} className={`text-sm flex gap-2 ${highlight ? "text-teal-100" : "text-slate-600"}`}>
                      <span className="text-teal-400">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={href}
                  className={`block text-center font-semibold py-3 rounded-xl transition ${
                    highlight
                      ? "bg-white text-teal-700 hover:bg-teal-50"
                      : "bg-teal-700 text-white hover:bg-teal-600"
                  }`}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-slate-500 text-sm mt-6">
            All plans include a 14-day free trial. No credit card required for the first 7 days.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 text-center text-sm text-slate-400">
        <p>© {new Date().getFullYear()} CFO Assistant. All rights reserved.</p>
        <div className="mt-2 space-x-4">
          <Link href="/privacy" className="hover:text-slate-600">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-600">Terms</Link>
        </div>
      </footer>
    </main>
  );
}
