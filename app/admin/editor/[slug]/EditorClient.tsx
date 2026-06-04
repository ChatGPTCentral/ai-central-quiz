'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type {
  BranchingCondition,
  BranchingOp,
  BranchingRule,
  V2Option,
  V2Question,
  V2QuestionType,
} from '@/lib/form-schema'
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

const TYPE_ORDER: V2QuestionType[] = ['text', 'email', 'chips', 'multi-chips']

// Safety matrix — true means the transition is safe (no data loss).
// Lossy transitions are still allowed but show a warning.
function isSafeTypeChange(from: V2QuestionType, to: V2QuestionType): boolean {
  if (from === to) return true
  if (from === 'chips' && to === 'multi-chips') return true
  if (from === 'text' && to === 'email') return true
  return false
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'q'
}

const OP_LABELS: Record<BranchingOp, string> = {
  eq: 'equals',
  neq: 'does not equal',
  in: 'is one of',
  contains: 'includes',
  gt: 'is greater than',
  lt: 'is less than',
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
  const [selectedId, setSelectedId] = useState<string>(initialQuestions[0]?.id ?? '')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draftVersion, setDraftVersion] = useState<number | null>(initialDraftVersion)
  const [draftId, setDraftId] = useState<string | null>(initialDraftId)
  const [dirty, setDirty] = useState(false)
  const [publishedJustNow, setPublishedJustNow] = useState(false)

  const selectedIdx = Math.max(0, questions.findIndex(q => q.id === selectedId))
  const selected = questions[selectedIdx]

  const [previewAnswer, setPreviewAnswer] = useState<string>('')
  const [previewMulti, setPreviewMulti] = useState<string[]>([])

  const onSelect = (id: string) => {
    setSelectedId(id)
    setPreviewAnswer('')
    setPreviewMulti([])
  }

  // ── State mutators (all bump `dirty`) ─────────────────────────────
  const markDirty = () => { setDirty(true); setPublishedJustNow(false) }

  const patchQuestion = useCallback((idx: number, patch: Partial<V2Question>) => {
    setQuestions(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
    markDirty()
  }, [])

  const patchOption = useCallback((qIdx: number, oIdx: number, patch: Partial<V2Option>) => {
    setQuestions(prev => {
      const next = [...prev]
      const opts = (next[qIdx].options ?? []).slice()
      opts[oIdx] = { ...opts[oIdx], ...patch }
      next[qIdx] = { ...next[qIdx], options: opts }
      return next
    })
    markDirty()
  }, [])

  const removeOption = (qIdx: number, oIdx: number) => {
    setQuestions(prev => {
      const next = [...prev]
      const opts = (next[qIdx].options ?? []).filter((_, i) => i !== oIdx)
      next[qIdx] = { ...next[qIdx], options: opts }
      return next
    })
    markDirty()
  }

  const addOption = (qIdx: number) => {
    setQuestions(prev => {
      const next = [...prev]
      const opts = (next[qIdx].options ?? []).slice()
      opts.push({ label: 'New option', value: `opt_${opts.length + 1}` })
      next[qIdx] = { ...next[qIdx], options: opts }
      return next
    })
    markDirty()
  }

  const addQuestion = () => {
    setQuestions(prev => {
      const id = `new_${Date.now().toString(36)}`
      const newQ: V2Question = {
        id,
        type: 'chips',
        label: 'New question',
        required: false,
        options: [
          { label: 'Option A', value: 'a' },
          { label: 'Option B', value: 'b' },
        ],
      }
      const next = [...prev, newQ]
      setSelectedId(id)
      return next
    })
    markDirty()
  }

  const duplicateQuestion = (idx: number) => {
    setQuestions(prev => {
      const src = prev[idx]
      const id = `${src.id}_copy_${Date.now().toString(36).slice(-4)}`
      const copy: V2Question = { ...src, id, dbColumn: undefined, branching: [] }
      const next = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]
      setSelectedId(id)
      return next
    })
    markDirty()
  }

  const deleteQuestion = (idx: number) => {
    const q = questions[idx]
    if (q.dbColumn) {
      if (!confirm(`Q "${q.label}" persists to DB column \`${q.dbColumn}\`. Deleting will stop collecting this field. Continue?`)) return
    }
    setQuestions(prev => {
      const next = prev.filter((_, i) => i !== idx)
      // Clean up any branching rules that pointed to this question
      for (const other of next) {
        if (other.branching) {
          other.branching = other.branching.filter(r => r.goto !== q.id)
        }
      }
      if (next.length > 0) {
        const newSel = Math.min(idx, next.length - 1)
        setSelectedId(next[newSel].id)
      }
      return next
    })
    markDirty()
  }

  const changeType = (idx: number, to: V2QuestionType) => {
    const from = questions[idx].type
    if (from === to) return
    if (!isSafeTypeChange(from, to)) {
      const warnings: string[] = []
      if ((from === 'chips' || from === 'multi-chips') && !(to === 'chips' || to === 'multi-chips')) {
        warnings.push('Options will be discarded.')
      }
      if (from === 'multi-chips' && to === 'chips') {
        warnings.push('Multiple selections collapse to single.')
      }
      if (from === 'email' && to !== 'email') {
        warnings.push('Email validation will be removed.')
      }
      if (!confirm(`Lossy type change ${from} → ${to}:\n\n${warnings.join('\n')}\n\nContinue?`)) return
    }
    setQuestions(prev => {
      const next = [...prev]
      const q = { ...next[idx], type: to }
      // Ensure options exist for chips/multi-chips
      if ((to === 'chips' || to === 'multi-chips') && (!q.options || q.options.length < 2)) {
        q.options = [
          { label: 'Option A', value: 'a' },
          { label: 'Option B', value: 'b' },
        ]
      }
      // Drop options for text/email
      if (to === 'text' || to === 'email') {
        delete q.options
      }
      next[idx] = q
      return next
    })
    markDirty()
  }

  // ── Branching ─────────────────────────────────────────────────────
  const upstreamQuestions = useMemo(
    () => questions.slice(0, selectedIdx).filter(q => q.type === 'chips' || q.type === 'multi-chips'),
    [questions, selectedIdx],
  )
  const downstreamQuestions = useMemo(
    () => questions.slice(selectedIdx + 1),
    [questions, selectedIdx],
  )

  const addRule = () => {
    if (upstreamQuestions.length === 0) {
      alert('Branching needs at least one upstream choice question (chips / multi-chips).')
      return
    }
    const first = upstreamQuestions[0]
    const rule: BranchingRule = {
      when: [{ questionId: first.id, op: 'eq', value: first.options?.[0]?.value ?? '' }],
      goto: downstreamQuestions[0]?.id ?? 'end',
    }
    patchQuestion(selectedIdx, { branching: [...(selected.branching ?? []), rule] })
  }

  const patchRule = (rIdx: number, patch: Partial<BranchingRule>) => {
    const rules = (selected.branching ?? []).slice()
    rules[rIdx] = { ...rules[rIdx], ...patch }
    patchQuestion(selectedIdx, { branching: rules })
  }

  const patchCondition = (rIdx: number, cIdx: number, patch: Partial<BranchingCondition>) => {
    const rules = (selected.branching ?? []).slice()
    const conds = rules[rIdx].when.slice()
    conds[cIdx] = { ...conds[cIdx], ...patch }
    rules[rIdx] = { ...rules[rIdx], when: conds }
    patchQuestion(selectedIdx, { branching: rules })
  }

  const removeRule = (rIdx: number) => {
    const rules = (selected.branching ?? []).filter((_, i) => i !== rIdx)
    patchQuestion(selectedIdx, { branching: rules.length > 0 ? rules : undefined })
  }

  // ── Drag-drop reorder ─────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setQuestions(prev => {
      const oldIdx = prev.findIndex(q => q.id === active.id)
      const newIdx = prev.findIndex(q => q.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
    markDirty()
  }

  // ── Save / Publish ────────────────────────────────────────────────
  const saveDraft = async (): Promise<string | null> => {
    setSaveState('saving'); setError(null)
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
      return data.config.id as string
    } catch (e) {
      setError(String(e))
      setSaveState('error')
      return null
    }
  }

  const publish = async () => {
    let targetId = draftId
    if (dirty || !targetId) {
      const saved = await saveDraft()
      if (!saved) return
      targetId = saved
    }
    setSaveState('saving'); setError(null)
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
    setSelectedId(initialQuestions[0]?.id ?? '')
    setDirty(false)
    setError(null)
  }

  const headerLabel = useMemo(() => {
    if (draftVersion && draftVersion > (liveVersion ?? 0)) return `Draft v${draftVersion}`
    if (liveVersion) return `Live v${liveVersion}`
    return 'No version'
  }, [draftVersion, liveVersion])

  if (!selected) return <div className="p-10 text-sm text-[#9C9C9C]">No questions. <button onClick={addQuestion} className="text-[#046BB1] underline">Add one</button>.</div>

  return (
    <div className="flex h-screen bg-[#FFFDFA]">
      {/* LEFT — Question list */}
      <aside className="w-72 shrink-0 bg-white border-r border-[#E8E4DF] flex flex-col">
        <div className="px-4 py-3 border-b border-[#E8E4DF] flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">Questions</div>
            <div className="text-xs text-[#9C9C9C] mt-1">{questions.length} total</div>
          </div>
          <button
            onClick={addQuestion}
            title="Add question"
            className="text-sm font-semibold text-[#046BB1] hover:bg-[#046BB1]/10 w-7 h-7 rounded-md"
          >+</button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
              {questions.map((q, i) => (
                <SortableRow
                  key={q.id}
                  q={q}
                  idx={i}
                  active={q.id === selectedId}
                  onSelect={() => onSelect(q.id)}
                  onDuplicate={() => duplicateQuestion(i)}
                  onDelete={() => deleteQuestion(i)}
                />
              ))}
            </SortableContext>
          </DndContext>
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
        <div className="p-5 space-y-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mb-1">ID</div>
            <input
              value={selected.id}
              onChange={e => patchQuestion(selectedIdx, { id: slugify(e.target.value) })}
              className="text-xs text-[#333333] font-mono w-full border border-[#E8E4DF] rounded px-2 py-1 focus:outline-none focus:border-[#046BB1]"
              title="Internal id. Renaming may break historical analytics."
            />
            {selected.dbColumn && (
              <div className="mt-1 text-[10px] uppercase tracking-wider text-[#9C9C9C]">
                DB → <code className="font-mono">{selected.dbColumn}</code>
              </div>
            )}
          </div>

          <Field label="Type">
            <select
              value={selected.type}
              onChange={e => changeType(selectedIdx, e.target.value as V2QuestionType)}
              className="text-xs text-[#333333] w-full border border-[#E8E4DF] rounded px-2 py-1.5 focus:outline-none focus:border-[#046BB1] bg-white"
            >
              {TYPE_ORDER.map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
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

          {/* Branching */}
          <Field label="Logic">
            {(selected.branching ?? []).length === 0 && (
              <p className="text-[11px] text-[#9C9C9C] mb-2">
                No rules — proceeds linearly to the next question.
              </p>
            )}
            <div className="space-y-2">
              {(selected.branching ?? []).map((rule, rIdx) => (
                <RuleEditor
                  key={rIdx}
                  rule={rule}
                  upstream={upstreamQuestions}
                  downstream={downstreamQuestions}
                  onPatchRule={p => patchRule(rIdx, p)}
                  onPatchCondition={(cIdx, p) => patchCondition(rIdx, cIdx, p)}
                  onRemove={() => removeRule(rIdx)}
                />
              ))}
            </div>
            <button
              onClick={addRule}
              className="text-xs text-[#046BB1] hover:underline mt-2"
            >
              + Add rule
            </button>
          </Field>
        </div>
      </aside>
    </div>
  )
}

// ── Sortable question row ───────────────────────────────────────────
function SortableRow({
  q, idx, active, onSelect, onDuplicate, onDelete,
}: {
  q: V2Question
  idx: number
  active: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group w-full pl-1 pr-2 flex items-stretch gap-1 transition-colors ${
        active ? 'bg-[#046BB1]/10 border-l-2 border-[#046BB1]' : 'hover:bg-[#F5F5F5] border-l-2 border-transparent'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        className="cursor-grab text-[#9C9C9C] hover:text-[#333333] px-1 select-none text-xs"
      >⋮⋮</button>
      <button
        onClick={onSelect}
        className="flex-1 text-left py-2 flex items-start gap-2 min-w-0"
      >
        <span className="text-[11px] font-bold text-[#9C9C9C] tabular-nums mt-0.5 w-5">{idx + 1}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-medium text-[#333333] truncate">{q.label}</span>
          <span className="block text-[10px] uppercase tracking-wider text-[#9C9C9C] mt-0.5">
            {TYPE_LABELS[q.type]}
            {q.branching && q.branching.length > 0 && (
              <span className="ml-1.5 text-[#046BB1]">↪ {q.branching.length} rule{q.branching.length === 1 ? '' : 's'}</span>
            )}
          </span>
        </span>
      </button>
      <div className="flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onDuplicate} title="Duplicate" className="text-[#9C9C9C] hover:text-[#333333] text-xs px-1 py-0.5">⎘</button>
        <button onClick={onDelete} title="Delete" className="text-[#9C9C9C] hover:text-red-600 text-xs px-1 py-0.5">×</button>
      </div>
    </div>
  )
}

// ── Branching rule editor ───────────────────────────────────────────
function RuleEditor({
  rule, upstream, downstream, onPatchRule, onPatchCondition, onRemove,
}: {
  rule: BranchingRule
  upstream: V2Question[]
  downstream: V2Question[]
  onPatchRule: (p: Partial<BranchingRule>) => void
  onPatchCondition: (cIdx: number, p: Partial<BranchingCondition>) => void
  onRemove: () => void
}) {
  return (
    <div className="border border-[#E8E4DF] rounded-md p-2 space-y-1.5 bg-[#FFFDFA]">
      {rule.when.map((c, cIdx) => {
        const refQ = upstream.find(q => q.id === c.questionId)
        return (
          <div key={cIdx} className="flex flex-wrap items-center gap-1 text-[11px]">
            <span className="text-[#9C9C9C]">{cIdx === 0 ? 'If' : 'and'}</span>
            <select
              value={c.questionId}
              onChange={e => onPatchCondition(cIdx, { questionId: e.target.value, value: '' })}
              className="border border-[#E8E4DF] rounded px-1 py-0.5 bg-white max-w-[110px] truncate"
            >
              {upstream.map(q => (
                <option key={q.id} value={q.id}>{q.label.slice(0, 40)}</option>
              ))}
            </select>
            <select
              value={c.op}
              onChange={e => onPatchCondition(cIdx, { op: e.target.value as BranchingOp })}
              className="border border-[#E8E4DF] rounded px-1 py-0.5 bg-white"
            >
              {(Object.keys(OP_LABELS) as BranchingOp[]).map(op => (
                <option key={op} value={op}>{OP_LABELS[op]}</option>
              ))}
            </select>
            {refQ?.options ? (
              <select
                value={typeof c.value === 'string' ? c.value : c.value[0] ?? ''}
                onChange={e => onPatchCondition(cIdx, { value: e.target.value })}
                className="border border-[#E8E4DF] rounded px-1 py-0.5 bg-white max-w-[110px] truncate"
              >
                {refQ.options.map(o => (
                  <option key={o.value} value={o.value}>{o.label.slice(0, 30)}</option>
                ))}
              </select>
            ) : (
              <input
                value={typeof c.value === 'string' ? c.value : c.value[0] ?? ''}
                onChange={e => onPatchCondition(cIdx, { value: e.target.value })}
                className="border border-[#E8E4DF] rounded px-1 py-0.5 bg-white w-20"
              />
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-[#9C9C9C]">→ jump to</span>
        <select
          value={rule.goto}
          onChange={e => onPatchRule({ goto: e.target.value })}
          className="border border-[#E8E4DF] rounded px-1 py-0.5 bg-white max-w-[140px] truncate"
        >
          {downstream.map(q => (
            <option key={q.id} value={q.id}>{q.label.slice(0, 40)}</option>
          ))}
          <option value="end">End of form</option>
        </select>
        <button onClick={onRemove} title="Remove rule" className="ml-auto text-[#9C9C9C] hover:text-red-600 px-1">×</button>
      </div>
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
