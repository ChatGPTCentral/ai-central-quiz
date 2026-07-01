// "You're early" — global AI-adoption context, as a 100-dot matrix.
//
// The thesis: AI feels ubiquitous online, but in the real world the large
// majority still haven't started. That makes the reader an early mover — the
// opportunity AI Central helps them win.
//
// Two variants:
//   • 'cover'  — generic teaser (a "?" dot): "where will YOU land?"
//   • 'result' — personalized: the "you" dot is positioned by `percentile`
//                (ahead-of %), so a higher rung sits nearer the front.
//
// Figures (rounded, illustrative — sourced 2026):
//   • ~18% of working-age adults use AI regularly (World Bank / Microsoft)
//   • ~71% have never tried a tool like ChatGPT (public surveys)
//   • ~900M weekly ChatGPT users out of ~8 billion people (OpenAI)

const ADOPTED = 18 // of 100 — working-age adults using AI regularly

function youIndexFor(variant: 'cover' | 'result', percentile?: number): number {
  if (variant === 'result' && typeof percentile === 'number') {
    // Higher percentile ⇒ nearer the front of the "already started" band.
    const idx = Math.round(((100 - percentile) / 100) * ADOPTED)
    return Math.min(ADOPTED - 1, Math.max(0, idx))
  }
  return 4
}

interface Props {
  firstName?: string
  variant?: 'cover' | 'result'
  /** Result variant: "ahead of ~X% of people" — positions the you-dot. */
  percentile?: number
}

export function AdoptionGauge({ firstName, variant = 'result', percentile }: Props) {
  const lead = firstName ? `${firstName}, you're` : "You're"
  const youIndex = youIndexFor(variant, percentile)
  const cells = Array.from({ length: 100 }, (_, i) => i)
  const isCover = variant === 'cover'

  const card = (
    <div
      className="rounded-2xl p-6 sm:p-7"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DF', boxShadow: '0 4px 30px rgba(228,135,21,0.06)' }}
    >
      {/* 10×10 dot matrix — ~18 filled (use AI); one is "you" (or "?" on cover) */}
      <div className="grid grid-cols-10 gap-1.5 sm:gap-2 max-w-[340px] mx-auto">
        {cells.map((i) => {
          const adopted = i < ADOPTED
          const isYou = i === youIndex
          return (
            <div
              key={i}
              className="relative aspect-square rounded-full"
              style={{
                backgroundColor: adopted ? '#E48715' : '#EDE7DC',
                boxShadow: isYou ? '0 0 0 2px #FFFFFF, 0 0 0 4px #333333' : undefined,
              }}
              title={isYou ? (isCover ? 'You?' : 'You') : adopted ? 'Uses AI' : 'Hasn’t started'}
              aria-label={isYou ? 'You — already ahead' : adopted ? 'Uses AI' : 'Has not started'}
            />
          )
        })}
      </div>

      {/* Legend / "you are here" */}
      <p className="text-center text-[12.5px] mt-5 leading-relaxed" style={{ color: '#333333' }}>
        <span
          className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1"
          style={{ backgroundColor: '#E48715', boxShadow: '0 0 0 2px #fff, 0 0 0 3px #333' }}
        />
        {isCover ? (
          <>
            <strong>~18</strong> of every 100 people use AI.{' '}
            <span style={{ color: '#9C9C9C' }}>The other <strong>82</strong> haven&apos;t started. <strong style={{ color: '#E48715' }}>Where do you land?</strong></span>
          </>
        ) : (
          <>
            <strong>You</strong> are one of the <strong style={{ color: '#E48715' }}>~18</strong> who&apos;ve started
            {typeof percentile === 'number' ? <> — ahead of <strong>~{percentile}%</strong> of people</> : null}.{' '}
            <span style={{ color: '#9C9C9C' }}>The other <strong>82</strong> haven&apos;t.</span>
          </>
        )}
      </p>

      {/* Stat chips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
        {[
          { big: '71%', small: 'have never even tried ChatGPT' },
          { big: '~18%', small: 'of working-age adults use AI regularly' },
          { big: '900M', small: 'weekly ChatGPT users — of 8 billion people' },
        ].map((s) => (
          <div key={s.big} className="text-center p-3 rounded-xl" style={{ backgroundColor: '#FEF7E7' }}>
            <p className="text-2xl font-black tabular-nums" style={{ color: '#E48715' }}>{s.big}</p>
            <p className="text-[11px] leading-snug mt-1" style={{ color: '#555' }}>{s.small}</p>
          </div>
        ))}
      </div>
    </div>
  )

  // Cover: compact teaser (the cover page supplies its own headline above).
  if (isCover) {
    return (
      <div className="w-full max-w-lg mx-auto">
        <p className="text-[13px] text-center mb-3" style={{ color: '#9C9C9C' }}>
          If the world were 100 people:
        </p>
        {card}
      </div>
    )
  }

  // Result: full section with heading + the opportunity punchline.
  return (
    <section className="px-6 pb-12 max-w-2xl mx-auto w-full">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-3 text-center" style={{ color: '#9C9C9C' }}>
        The bigger picture
      </p>
      <h2 className="text-[24px] sm:text-[28px] font-black mb-2 text-center leading-tight" style={{ color: '#333333' }}>
        {lead} <span style={{ color: '#E48715' }}>earlier</span> than you think
      </h2>
      <p className="text-[14px] leading-relaxed text-center mb-6 max-w-md mx-auto" style={{ color: '#9C9C9C' }}>
        AI feels like it&apos;s everywhere online. In the real world, almost nobody has started. If the world were 100 people:
      </p>
      {card}
      <p className="text-[15px] leading-relaxed text-center mt-6 max-w-md mx-auto" style={{ color: '#333333' }}>
        <strong>That&apos;s the opportunity.</strong> The people who learn AI now spend the next decade ahead of the 82 still
        waiting. <span style={{ color: '#E48715' }}>AI Central gets you there first.</span>
      </p>
      <p className="text-[10px] text-center mt-3" style={{ color: '#C4BDB2' }}>
        Sources: OpenAI (900M weekly users, 2026) · World Bank &amp; Microsoft AI diffusion (2026) · public adoption surveys
      </p>
    </section>
  )
}
