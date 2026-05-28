'use client'

import { useState } from 'react'
import { QUESTIONS_V2 } from '@/lib/questions-v2'
import { stageDef, personaDef } from '@/lib/segmentation-v2'

type Answers = Record<string, string | string[]>

interface SaveResult {
  saved: boolean
  email: string
  previousStage: string | null
  newStage: string
  newStageReason: string
  newPersona: string
  newPersonaReason: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  v2Recorded: any
}

export default function SurveyV2Preview() {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState(0)  // 0 = email entry, 1..6 = questions, 7 = done
  const [answers, setAnswers] = useState<Answers>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)
  const [err, setErr] = useState('')

  const TOTAL = QUESTIONS_V2.length
  const q = step >= 1 && step <= TOTAL ? QUESTIONS_V2[step - 1] : null

  function setSingle(value: string) {
    if (!q) return
    setAnswers(prev => ({ ...prev, [q.id]: value }))
  }
  function toggleMulti(value: string) {
    if (!q) return
    setAnswers(prev => {
      const cur = (prev[q.id] as string[]) || []
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
      return { ...prev, [q.id]: next }
    })
  }

  async function submit() {
    setBusy(true); setErr(''); setResult(null)
    try {
      const res = await fetch('/api/admin/sandbox/survey-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, answers }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'failed'); return }
      setResult(data as SaveResult)
      setStep(TOTAL + 1)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setStep(0); setAnswers({}); setResult(null); setErr('')
  }

  const canAdvance = (() => {
    if (!q) return !!email
    const a = answers[q.id]
    if (!q.required) return true
    if (q.type === 'multi-chips') return Array.isArray(a) && a.length > 0
    return typeof a === 'string' && a.length > 0
  })()

  return (
    <div className="space-y-4">
      {/* Progress + reset */}
      <section className="bg-white border border-[#E8E4DF] rounded-xl px-5 py-3 flex items-center justify-between">
        <div className="text-[11px] text-[#9C9C9C]">
          {step === 0 && <>Step <strong>0/{TOTAL}</strong> · enter target email</>}
          {step >= 1 && step <= TOTAL && <>Step <strong>{step}/{TOTAL}</strong> · {q?.id}</>}
          {step > TOTAL && <>Done · row reclassified</>}
        </div>
        {step > 0 && (
          <button onClick={reset} className="text-[11px] font-bold uppercase tracking-wider text-[#9C9C9C] hover:text-[#333333]">↺ start over</button>
        )}
      </section>

      {err && <div className="px-5 py-3 text-[12px] text-[#8A1F1F] bg-[#BE3B3B]/10 border border-[#BE3B3B]/40 rounded">✕ {err}</div>}

      {/* Step 0: email picker */}
      {step === 0 && (
        <section className="bg-white border border-[#E8E4DF] rounded-xl px-5 py-6">
          <label className="block text-[12px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-2">Target email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value.trim().toLowerCase())}
            placeholder="someone@example.com"
            className="w-full text-[15px] px-3 py-2 border-2 border-[#E8E4DF] focus:border-[#046BB1] rounded-lg outline-none"
            autoFocus
          />
          <p className="text-[11px] text-[#9C9C9C] mt-2">Must exist in the CRM. Their existing quiz/Stripe/Beehiiv data is preserved; we only write the v2 columns.</p>
          <button
            onClick={() => setStep(1)}
            disabled={!email}
            className="mt-4 px-4 py-2 text-[12px] font-bold uppercase tracking-wider rounded bg-[#333333] text-[#FFFDFA] hover:opacity-90 disabled:opacity-40"
          >Begin survey →</button>
        </section>
      )}

      {/* Question card */}
      {q && (
        <section className="bg-white border border-[#E8E4DF] rounded-xl px-5 py-6">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#046BB1] mb-2">Q{step} · {q.dbColumn}</div>
          <h2 className="text-xl font-black text-[#333333] mb-1 leading-tight">{q.label}</h2>
          {q.sublabel && <p className="text-[13px] text-[#9C9C9C] mb-4">{q.sublabel}</p>}
          {!q.sublabel && <div className="mb-4" />}

          {/* Single-select chips */}
          {q.type === 'chips' && (
            <div className="flex flex-col gap-2">
              {q.options.map(opt => {
                const sel = answers[q.id] === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSingle(opt.value)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      sel ? 'border-[#046BB1] bg-[#046BB1]/5' : 'border-[#E8E4DF] bg-white hover:border-[#9C9C9C]'
                    }`}
                  >
                    {opt.emoji && <span className="text-lg shrink-0">{opt.emoji}</span>}
                    <span className={`text-[14px] font-medium ${sel ? 'text-[#046BB1]' : 'text-[#333333]'}`}>{opt.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Multi-select chips */}
          {q.type === 'multi-chips' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {q.options.map(opt => {
                const sel = ((answers[q.id] as string[]) || []).includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleMulti(opt.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                      sel ? 'border-[#046BB1] bg-[#046BB1]/5' : 'border-[#E8E4DF] bg-white hover:border-[#9C9C9C]'
                    }`}
                  >
                    <span className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${sel ? 'bg-[#046BB1] border-[#046BB1]' : 'border-[#E8E4DF]'}`}>
                      {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4 7.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    <span className={`text-[13px] ${sel ? 'text-[#046BB1] font-bold' : 'text-[#333333]'}`}>{opt.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={step === 1}
              className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider rounded border border-[#E8E4DF] text-[#9C9C9C] hover:bg-[#FFFDFA] disabled:opacity-40"
            >← Back</button>
            {step < TOTAL ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded bg-[#333333] text-[#FFFDFA] hover:opacity-90 disabled:opacity-40"
              >Next →</button>
            ) : (
              <button
                onClick={submit}
                disabled={!canAdvance || busy}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded bg-[#E48715] text-[#FFFDFA] hover:opacity-90 disabled:opacity-40"
              >{busy ? 'Saving…' : 'Save + reclassify ✨'}</button>
            )}
          </div>
        </section>
      )}

      {/* Result card */}
      {result && (
        <section className="bg-white border-2 border-[#62A758] rounded-xl px-5 py-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#2D6A26] mb-2">Done · row reclassified</div>
          <p className="text-[13px] text-[#333333] mb-4">
            <strong>{result.email}</strong> was classified using the new Survey v2 signals.
          </p>

          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="text-[11px] text-[#9C9C9C]">Previous stage:</div>
            <div className="text-[12px]">
              {result.previousStage ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ backgroundColor: (stageDef(result.previousStage)?.color || '#9C9C9C') + '22', color: stageDef(result.previousStage)?.color }}>
                  {stageDef(result.previousStage)?.emoji} {stageDef(result.previousStage)?.label || result.previousStage}
                </span>
              ) : <span className="text-[#9C9C9C]">none</span>}
            </div>
            <div className="text-[#9C9C9C]">→</div>
            <div className="text-[12px]">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded text-[12px] font-bold" style={{ backgroundColor: (stageDef(result.newStage)?.color || '#333333') + '22', color: stageDef(result.newStage)?.color }}>
                {stageDef(result.newStage)?.emoji} {stageDef(result.newStage)?.label || result.newStage}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-[#9C9C9C] mb-2"><strong>Stage reason:</strong> {result.newStageReason}</div>
          <div className="text-[11px] text-[#9C9C9C] mb-4">
            <strong>Persona:</strong>{' '}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ backgroundColor: (personaDef(result.newPersona)?.color || '#9C9C9C') + '22', color: personaDef(result.newPersona)?.color }}>
              {personaDef(result.newPersona)?.emoji} {personaDef(result.newPersona)?.label || result.newPersona}
            </span>
            {' '}- - {result.newPersonaReason}
          </div>

          <details className="text-[11px] text-[#9C9C9C]">
            <summary className="cursor-pointer font-bold">Recorded values</summary>
            <pre className="mt-2 p-2 bg-[#F5F5F5] rounded text-[10px] overflow-x-auto">{JSON.stringify(result.v2Recorded, null, 2)}</pre>
          </details>

          <button onClick={reset} className="mt-4 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-white border border-[#E8E4DF] text-[#333333] hover:bg-[#FEF7E7]">Take it again →</button>
        </section>
      )}
    </div>
  )
}
