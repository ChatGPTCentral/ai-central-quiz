import type { EndScreenBlock } from '@/lib/form-schema'
import { resolveTokens, type TokenContext } from '@/lib/piping'

interface Props {
  blocks: EndScreenBlock[]
  tokens: TokenContext
  /** Accent color for primary buttons (defaults to AI Central Fulvous). */
  accent?: string
}

export function EndScreenBlocks({ blocks, tokens, accent = '#E48715' }: Props) {
  return (
    <div className="space-y-4">
      {blocks.map(block => {
        switch (block.type) {
          case 'heading': {
            const text = resolveTokens(block.text, tokens)
            const sizeCls =
              block.level === 1 ? 'text-[28px] sm:text-[32px] font-black leading-tight'
              : block.level === 2 ? 'text-[20px] sm:text-[24px] font-black leading-snug'
              : 'text-[16px] sm:text-[18px] font-bold'
            const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3')
            return (
              <Tag key={block.id} className={sizeCls} style={{ color: '#333333' }}>
                {text}
              </Tag>
            )
          }
          case 'paragraph': {
            const text = resolveTokens(block.text, tokens)
            return (
              <p key={block.id} className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: '#333333' }}>
                {text}
              </p>
            )
          }
          case 'bullets':
            return (
              <ul key={block.id} className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed" style={{ color: '#333333' }}>
                {block.items.map((item, i) => (
                  <li key={i}>{resolveTokens(item, tokens)}</li>
                ))}
              </ul>
            )
          case 'image':
            if (!block.src) return null
            return (
              <figure key={block.id} className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.src} alt={block.alt} className="w-full rounded-xl border" style={{ borderColor: '#E8E4DF' }} />
                {block.caption && (
                  <figcaption className="text-[12px] text-center" style={{ color: '#9C9C9C' }}>
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            )
          case 'button': {
            if (!block.url) return null
            const text = resolveTokens(block.text, tokens)
            const baseCls = 'inline-block w-full py-3 px-5 font-bold text-[14px] rounded-xl text-center transition-all active:scale-[0.99] hover:opacity-90'
            const style = block.variant === 'primary'
              ? { backgroundColor: accent, color: '#FFFFFF' }
              : { backgroundColor: 'transparent', color: '#333333', border: '1px solid #333333' }
            return (
              <a key={block.id} href={block.url} className={baseCls} style={style}>
                {text}
              </a>
            )
          }
          case 'divider':
            return <hr key={block.id} className="my-2 border-t" style={{ borderColor: '#E8E4DF' }} />
        }
      })}
    </div>
  )
}
