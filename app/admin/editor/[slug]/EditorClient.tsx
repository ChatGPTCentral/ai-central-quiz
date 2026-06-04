'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { V2Option, V2Question, V2QuestionType } from '@/lib/form-schema'
import { QuestionRenderer } from '@/components/quiz/QuestionRenderer'

interface Props {
  slug: string
  initialQuestions: V2Question[]
  liveVersion: number | null
  draftVersion: number | null
  draftVersionId: string | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const TYPE_LABELS: Record<V2QuestionType, string> = {
  text: 'Short text',
  email: 'Email',
  chips: 'Single choice',
  'multi-chips': 'Multiple choice',
}

export default function EditorClient({
  slug,
  initialQuestions,
  liveVersion,
  draftVersion: initialDraftVersion,
  draftVersionId: initialDraftId,
}: Props) {
  const router = useRouter()
  const [questions, setQuestions] = useState<V2Question[]>(initialQuestions)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draftVersion, setDraftVersion] = useState<number | null>(initialDraftVersion)
  const [draftId, setDraftId] = useState<string | null>(initialDraftId)
  const [dirty, setDirty] = useState(false)
  const [publishedJustNow, setPublishedJustNow] = useState(false)

  const selected = questions[selectedIdx]

  // Preview state — answers stay isolated; preview is interactive but doesn't submit.
  const [previewAnswer, setPreviewAnswer] = useState<string>('')
  const [previewMulti, setPreviewMulti] = useState<string[]>([])

  const onSelect = (idx: number) => {
    setSelectedIdx(idx)
    setPreviewAnswer('')
    setPreviewMulti([])
  }

  const patchQuestion = useCallback((idx: number, patch: Partial<V2Question>) => {
    setQuestions(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
    setDirty(true)
    setPublishedJustNow(false)
  }, [])

  const patchOption = useCallback((qIdx: number, oIdx: number, patch: Partial<V2Option>) => {
    setQuestions(prev => {
      const next = [...prev]
      const opts = (next[qIdx].options ?? []).slice()
      opts[oIdx] = { ...opts[oIdx], ...patch }
      next[qIdx] = { ...next[qIdx], options: opts }
      return next
    })
    setDirty(true)
    setPublishedJustNow(false)
  }, [])

  const removeOption = (qIdx: number, oIdx: number) => {
    setQuestions(prev => {
      const next = [...prev]
      const opts = (next[qIdx].options ?? []).filter((_, i) => i !== oIdx)
      next[qIdx] = { ...next[qIdx], options: opts }
      return next
    })
    setDirty(true)
    setPublishedJustNow(false)
  }

  const addOption = (qIdx: number) => {
    setQuestions(prev => {
      const next = [...prev]
      const opts = (next[qIdx].options ?? []).slice()
      const slug = `opt_${opts.length + 1}`
      opts.push({ label: 'New option', value: slug })
      next[qIdx] = { ...next[qIdx], options: opts }
      return next
    })
    setDirty(true)
    setPublishedJustNow(false)
  }

  const saveDraft = async () => {
    setSaveState('saving')
    setError(null)
    try {
      const res = await fetch('/api/admin/form-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, questions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setDraftVersion(data.config.version)
      setDraftId(data.config.id)
      setSaveState('saved')
      setDirty(false)
      setTimeout(() => setSaveState('idle'), 1800)
    } catch (e) {
      setError(String(e))
      setSaveState('error')
    }
  }

  const publish = async () => {
    if (!draftId) {
      // No draft yet — save one first so we have a target id.
      await saveDraft()
    }
    // Re-read the id after saveDraft may have set it
    const targetId = draftId
    if (!targetId) return
    setSaveState('saving')
    setError(null)
    try {
      const res = await fetch('/api/admin/form-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, draftVersionId: targetId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Publish failed')
      setSaveState('saved')
      setPublishedJustNow(true)
      setDirty(false)
      setTimeout(() => setSaveState('idle'), 1800)
      router.refresh()
    } catch (e) {
      setError(String(e))
      setSaveState('error')
    }
  }

  const reset = () => {
    if (!confirm('Discard all unsaved edits?')) return
    setQuestions(initialQuestions)
    setDirty(false)
    setError(null)
  }

  const headerLabel = useMemo(() => {
    if (draftVersion && draftVersion > (liveVersion ?? 0)) return `Draft v${draftVersion}`
    if (liveVersion) return `Live v${liveVersion}`
    return 'No version'
  }, [draftVersion, liveVersion])

  return (
    <div className="flex h-screen bg-[#FFFDFA]">
      {/* LEFT — Question list */}
      <aside className="w-72 shrink-0 bg-white border-r border-[#E8E4DF] flex flex-col">
        <div className="px-4 py-3 border-b border-[#E8E4DF]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">Questions</div>
          <div className="text-xs text-[#9C9C9C] mt-1">{questions.length} total</div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => onSelect(i)}
              className={`w-full text-left px-4 py-2.5 flex items-start gap-2 transition-colors ${
                i === selectedIdx ? 'bg-[#046BB1]/10 border-l-2 border-[#046BB1]' : 'hover:bg-[#F5F5F5] border-l-2 border-transparent'
              }`}
            >
              <span className="text-[11px] font-bold text-[#9C9C9C] tabular-nums mt-0.5 w-5">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium text-[#333333] truncate">{q.label}</span>
                <span className="block text-[10px] uppercase tracking-wider text-[#9C9C9C] mt-0.5">{TYPE_LABELS[q.type]}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* CENTER — Preview pane */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 py-3 border-b border-[#E8E4DF] bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">{slug}</span>
            <span className="text-xs text-[#333333] font-semibold">{headerLabel}</span>
            {dirty && <span className="text-[10px] uppercase tracking-wider font-bold text-[#E48715]">unsaved</span>}
            {publishedJustNow && !dirty && <span className="text-[10px] uppercase tracking-wider font-bold text-[#62A758]">published</span>}
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <button onClick={reset} className="text-xs text-[#9C9C9C] hover:text-[#333333] px-2 py-1">
                Discard
              </button>
            )}
            <button
              onClick={saveDraft}
              disabled={!dirty || saveState === 'saving'}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
                dirty && saveState !== 'saving'
                  ? 'border-[#333333] text-[#333333] hover:bg-[#333333] hover:text-white'
                  : 'border-[#E8E4DF] text-[#9C9C9C] cursor-not-allowed'
              }`}
            >
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save draft'}
            </button>
            <button
              onClick={publish}
              disabled={saveState === 'saving' || (!draftId && !dirty)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                saveState === 'saving' || (!draftId && !dirty)
                  ? 'bg-[#E8E4DF] text-[#9C9C9C] cursor-not-allowed'
                  : 'bg-[#046BB1] text-white hover:opacity-90'
              }`}
            >
              Publish
            </button>
          </div>
        </div>
        {error && (
          <div className="px-6 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">{error}</div>
        )}
        <div className="flex-1 overflow-y-auto flex items-start justify-center pt-12 pb-12">
          <div className="w-full max-w-[580px] px-6">
            <QuestionRenderer
              question={selected}
              singleAnswer={previewAnswer}
              multiAnswer={previewMulti}
              stepNumber={selectedIdx + 1}
              accent="#046BB1"
              onSingleSelect={setPreviewAnswer}
              onMultiToggle={v => setPreviewMulti(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
              onTextChange={setPreviewAnswer}
            />
            <p className="text-[10px] uppercase tracking-widest text-[#9C9C9C] mt-6">
              Preview · uses live <code className="font-mono">QuestionRenderer</code>
            </p>
          </div>
        </div>
      </main>

      {/* RIGHT — Options panel */}
      <aside className="w-80 shrink-0 bg-white border-l border-[#E8E4DF] overflow-y-auto">
        {selected && (
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mb-1">ID</div>
              <code className="text-xs text-[#333333] font-mono">{selected.id}</code>
              {selected.dbColumn && (
                <div className="mt-1 text-[10px] uppercase tracking-wider text-[#9C9C9C]">
                  DB → <code className="font-mono">{selected.dbColumn}</code>
                </div>
              )}
            </div>

            <Field label="Type">
              <div className="text-xs text-[#333333]">{TYPE_LABELS[selected.type]}</div>
              <div className="text-[10px] text-[#9C9C9C] mt-1">Type changes ship in a follow-up — for now, edit copy & options.</div>
            </Field>

            <Field label="Label">
              <textarea
                value={selected.label}
                onChange={e => patchQuestion(selectedIdx, { label: e.target.value })}
                rows={2}
                className="w-full text-xs border border-[#E8E4DF] rounded px-2 py-1.5 focus:outline-none focus:border-[#046BB1] resize-none"
              />
            </Field>

            <Field label="Sublabel">
              <textarea
                value={selected.sublabel ?? ''}
                onChange={e => patchQuestion(selectedIdx, { sublabel: e.target.value || undefined })}
                rows={2}
                className="w-full text-xs border border-[#E8E4DF] rounded px-2 py-1.5 focus:outline-none focus:border-[#046BB1] resize-none"
                placeholder="Optional"
              />
            </Field>

            {(selected.type === 'text' || selected.type === 'email') && (
              <Field label="Placeholder">
                <input
                  value={selected.placeholder ?? ''}
                  onChange={e => patchQuestion(selectedIdx, { placeholder: e.target.value || undefined })}
                  className="w-full text-xs border border-[#E8E4DF] rounded px-2 py-1.5 focus:outline-none focus:border-[#046BB1]"
                  placeholder="Optional"
                />
              </Field>
            )}

            <Field label="Required">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={selected.required}
                  onChange={e => patchQuestion(selectedIdx, { required: e.target.checked })}
                />
                Required to advance
              </label>
            </Field>

            {(selected.type === 'chips' || selected.type === 'multi-chips') && selected.options && (
              <Field label={`Options (${selected.options.length})`}>
                <div className="space-y-1.5">
                  {selected.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-start gap-1.5 group">
                      <input
                        value={opt.label}
                        onChange={e => patchOption(selectedIdx, oIdx, { label: e.target.value })}
                        className="flex-1 text-xs border border-[#E8E4DF] rounded px-2 py-1.5 focus:outline-none focus:border-[#046BB1]"
                      />
                      <input
                        value={opt.value}
                        onChange={e => patchOption(selectedIdx, oIdx, { value: e.target.value })}
                        className="w-24 text-[10px] font-mono border border-[#E8E4DF] rounded px-1.5 py-1.5 focus:outline-none focus:border-[#046BB1] text-[#9C9C9C]"
                        title="Internal value (saved to DB)"
                      />
                      <button
                        onClick={() => removeOption(selectedIdx, oIdx)}
                        title="Remove"
                        className="text-[#9C9C9C] hover:text-red-600 px-1 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >×</button>
                    </div>
                  ))}
                  <button
                    onClick={() => addOption(selectedIdx)}
                    className="text-xs text-[#046BB1] hover:underline mt-1"
                  >
                    + Add option
                  </button>
                </div>
              </Field>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mb-1.5">{label}</div>
      {children}
    </div>
  )
}
