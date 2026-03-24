// Internal call to the Python FastAPI worker

export interface AnalyzeJobPayload {
  reportId: string
  orgId: string
  currency: string
  inputBankPdf:  string | null   // Supabase Storage path
  inputPlExcel:  string | null
  inputTbCsv:    string | null
  inputBudgetCsv: string | null
}

export async function enqueueAnalysis(payload: AnalyzeJobPayload) {
  const workerUrl = process.env.WORKER_URL!
  const res = await fetch(`${workerUrl}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': process.env.WORKER_SECRET!,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Worker enqueue failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<{ jobId: string }>
}
