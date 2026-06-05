'use client'

import { useState } from 'react'
import type {
  EndScreen,
  EndScreenBlock,
  EndScreenBlockType,
  HeadingBlock,
  ParagraphBlock,
  BulletsBlock,
  ImageBlock,
  ButtonBlock,
} from '@/lib/form-schema'
import { TokenPicker } from '@/components/admin/TokenPicker'

interface Props {
  endScreen: EndScreen
  onPatchEndScreen: (patch: Partial<EndScreen>) => void
  onAddBlock: (type: EndScreenBlockType) => void
  onRemoveBlock: (idx: number) => void
  onMoveBlock: (from: number, to: number) => void
  onPatchBlock: (idx: number, patch: Partial<EndScreenBlock>) => void
}

const BLOCK_TYPE_LABELS: Record<EndScreenBlockType, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  bullets: 'Bulleted list',
  image: 'Image',
  button: 'Button',
  divider: 'Divider',
}

const BLOCK_TYPES: EndScreenBlockType[] = ['heading', 'paragraph', 'bullets', 'image', 'button', 'divider']

export function ResultPageEditor({
  endScreen,
  onPatchEndScreen,
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onPatchBlock,
}: Props) {
  const [addingMenuOpen, setAddingMenuOpen] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto bg-[#FFFDFA]">
      <div className="max-w-2xl mx-auto px-8 py-10 space-y-10">
        <header>
          <h1 className="text-xl font-bold text-[#333333]">Result page</h1>
          <p className="text-xs text-[#9C9C9C] mt-1">
            What users see after they finish the quiz. Hero copy and CTA replace the default
            archetype-driven version when set. Body blocks slot between the hero and the archetype card.
          </p>
        </header>

        {/* ── HERO ──────────────────────────────────────────── */}
        <section className="bg-white border border-[#E8E4DF] rounded-xl p-5 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">Hero band</div>

          <Field label="Headline" hint="Leave empty for the archetype-driven default. Supports {firstName}, {persona}, {stage}, {score}.">
            <input
              value={endScreen.heroHeadline ?? ''}
              onChange={e => onPatchEndScreen({ heroHeadline: e.target.value || undefined })}
              placeholder="e.g. Nice work, {firstName}. You scored {score}."
              className="w-full text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1]"
            />
            <TokenPicker
              availability="result"
              onInsert={literal => {
                const cur = endScreen.heroHeadline ?? ''
                onPatchEndScreen({ heroHeadline: `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}${literal}` })
              }}
            />
          </Field>

          <Field label="Sub copy" hint="Supports the same tokens.">
            <textarea
              value={endScreen.heroSubheadline ?? ''}
              onChange={e => onPatchEndScreen({ heroSubheadline: e.target.value || undefined })}
              placeholder="A one-line description that shows under the headline."
              rows={2}
              className="w-full text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1] resize-none"
            />
            <TokenPicker
              availability="result"
              onInsert={literal => {
                const cur = endScreen.heroSubheadline ?? ''
                onPatchEndScreen({ heroSubheadline: `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}${literal}` })
              }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Primary CTA text">
              <input
                value={endScreen.ctaText ?? ''}
                onChange={e => onPatchEndScreen({ ctaText: e.target.value || undefined })}
                placeholder="e.g. Get my plan"
                className="w-full text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1]"
              />
            </Field>
            <Field label="Primary CTA URL">
              <input
                value={endScreen.ctaUrl ?? ''}
                onChange={e => onPatchEndScreen({ ctaUrl: e.target.value || undefined })}
                placeholder="https://…"
                className="w-full text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1] font-mono text-xs"
              />
            </Field>
          </div>
        </section>

        {/* ── BLOCKS ────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">
              Body blocks ({endScreen.blocks.length})
            </div>
            <div className="relative">
              <button
                onClick={() => setAddingMenuOpen(o => !o)}
                className="text-xs font-semibold text-[#046BB1] hover:bg-[#046BB1]/10 px-3 py-1.5 rounded-md border border-[#046BB1]/30"
              >
                + Add block
              </button>
              {addingMenuOpen && (
                <div className="absolute right-0 mt-1 bg-white border border-[#E8E4DF] rounded-md shadow-lg z-10 min-w-[160px]">
                  {BLOCK_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => { onAddBlock(t); setAddingMenuOpen(false) }}
                      className="block w-full text-left text-xs px-3 py-2 hover:bg-[#F5F5F5]"
                    >
                      {BLOCK_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {endScreen.blocks.length === 0 ? (
            <div className="bg-white border border-dashed border-[#E8E4DF] rounded-xl px-6 py-10 text-center">
              <p className="text-xs text-[#9C9C9C]">
                No body blocks yet. The result page will render with the default archetype-driven layout.
                Add a block to start customizing.
              </p>
            </div>
          ) : (
            endScreen.blocks.map((block, idx) => (
              <BlockCard
                key={block.id}
                block={block}
                idx={idx}
                isFirst={idx === 0}
                isLast={idx === endScreen.blocks.length - 1}
                onPatch={patch => onPatchBlock(idx, patch)}
                onRemove={() => onRemoveBlock(idx)}
                onMoveUp={() => onMoveBlock(idx, idx - 1)}
                onMoveDown={() => onMoveBlock(idx, idx + 1)}
              />
            ))
          )}
        </section>
      </div>
    </div>
  )
}

// ── Per-block editor card ─────────────────────────────────────────
function BlockCard({
  block,
  idx,
  isFirst,
  isLast,
  onPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: EndScreenBlock
  idx: number
  isFirst: boolean
  isLast: boolean
  onPatch: (patch: Partial<EndScreenBlock>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="bg-white border border-[#E8E4DF] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">
            #{idx + 1} · {BLOCK_TYPE_LABELS[block.type]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onMoveUp} disabled={isFirst} className="text-xs text-[#9C9C9C] hover:text-[#333333] disabled:opacity-30 px-1.5 py-0.5">↑</button>
          <button onClick={onMoveDown} disabled={isLast} className="text-xs text-[#9C9C9C] hover:text-[#333333] disabled:opacity-30 px-1.5 py-0.5">↓</button>
          <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5">×</button>
        </div>
      </div>

      {block.type === 'heading' && (
        <>
          <input
            value={block.text}
            onChange={e => onPatch({ text: e.target.value } as Partial<HeadingBlock>)}
            placeholder="Heading text"
            className="w-full text-sm font-semibold border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1]"
          />
          <select
            value={block.level}
            onChange={e => onPatch({ level: Number(e.target.value) as 1 | 2 | 3 } as Partial<HeadingBlock>)}
            className="text-xs border border-[#E8E4DF] rounded px-2 py-1.5"
          >
            <option value={1}>H1 (largest)</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
        </>
      )}

      {block.type === 'paragraph' && (
        <>
          <textarea
            value={block.text}
            onChange={e => onPatch({ text: e.target.value } as Partial<ParagraphBlock>)}
            placeholder="Body text. Line breaks are preserved. Tokens like {firstName} and {persona} resolve at view time."
            rows={4}
            className="w-full text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1] resize-y"
          />
          <TokenPicker
            availability="result"
            onInsert={literal => onPatch({ text: `${block.text}${block.text && !block.text.endsWith(' ') ? ' ' : ''}${literal}` } as Partial<ParagraphBlock>)}
          />
        </>
      )}

      {block.type === 'bullets' && (
        <div className="space-y-2">
          {block.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[#9C9C9C]">•</span>
              <input
                value={item}
                onChange={e => {
                  const next = block.items.slice()
                  next[i] = e.target.value
                  onPatch({ items: next } as Partial<BulletsBlock>)
                }}
                className="flex-1 text-sm border border-[#E8E4DF] rounded px-2 py-1.5 focus:outline-none focus:border-[#046BB1]"
              />
              <button
                onClick={() => onPatch({ items: block.items.filter((_, k) => k !== i) } as Partial<BulletsBlock>)}
                className="text-xs text-red-500 hover:text-red-700 px-1.5"
              >×</button>
            </div>
          ))}
          <button
            onClick={() => onPatch({ items: [...block.items, ''] } as Partial<BulletsBlock>)}
            className="text-xs text-[#046BB1] hover:underline"
          >+ Add item</button>
        </div>
      )}

      {block.type === 'image' && (
        <div className="space-y-2">
          <input
            value={block.src}
            onChange={e => onPatch({ src: e.target.value } as Partial<ImageBlock>)}
            placeholder="Image URL (https://…)"
            className="w-full text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1] font-mono text-xs"
          />
          <input
            value={block.alt}
            onChange={e => onPatch({ alt: e.target.value } as Partial<ImageBlock>)}
            placeholder="Alt text (describe the image)"
            className="w-full text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1]"
          />
          <input
            value={block.caption ?? ''}
            onChange={e => onPatch({ caption: e.target.value || undefined } as Partial<ImageBlock>)}
            placeholder="Caption (optional)"
            className="w-full text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1]"
          />
          {block.src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.src} alt={block.alt} className="max-h-32 rounded border border-[#E8E4DF]" />
          )}
        </div>
      )}

      {block.type === 'button' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={block.text}
            onChange={e => onPatch({ text: e.target.value } as Partial<ButtonBlock>)}
            placeholder="Button text"
            className="text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1]"
          />
          <input
            value={block.url}
            onChange={e => onPatch({ url: e.target.value } as Partial<ButtonBlock>)}
            placeholder="https://…"
            className="text-sm border border-[#E8E4DF] rounded px-3 py-2 focus:outline-none focus:border-[#046BB1] font-mono text-xs"
          />
          <select
            value={block.variant}
            onChange={e => onPatch({ variant: e.target.value as 'primary' | 'secondary' } as Partial<ButtonBlock>)}
            className="text-xs border border-[#E8E4DF] rounded px-2 py-1.5 col-span-2"
          >
            <option value="primary">Primary (accent color)</option>
            <option value="secondary">Secondary (outline)</option>
          </select>
        </div>
      )}

      {block.type === 'divider' && (
        <div className="border-t border-[#E8E4DF] my-2" />
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mb-1">{label}</div>
      {hint && <div className="text-[10px] text-[#9C9C9C] mb-1">{hint}</div>}
      {children}
    </label>
  )
}
