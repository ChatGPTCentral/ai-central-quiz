// "You're early" — global AI-adoption context for the result page.
//
// The thesis (from the global AI adoption picture): AI feels ubiquitous
// online, but in the real world the large majority of people still have not
// started. That makes the reader an early mover — which is the opportunity
// AI Central helps them win.
//
// Figures (rounded, illustrative — sourced 2026):
//   • ~18% of the world's working-age population uses AI regularly
//     (World Bank / Microsoft "state of global AI diffusion", 2026)
//   • ~71% of adults have never tried a tool like ChatGPT (public surveys)
//   • ~900M weekly ChatGPT users out of ~8 billion people (OpenAI, 2026)

const ADOPTED = 18 // of 100 — working-age adults using AI regularly
const YOU_INDEX = 4 // which dot is "you" (sits inside the early band)

export function AdoptionGauge({ firstName }: { firstName?: string }) {
  const lead = firstName ? `${firstName}, you're` : "You're"
  const cells = Array.from({ length: 100 }, (_, i) => i)

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

      <div
        className="rounded-2xl p-6 sm:p-7"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DF', boxShadow: '0 4px 30px rgba(228,135,21,0.06)' }}
      >
        {/* 10×10 dot matrix — ~18 filled (use AI), one of them is "you" */}
        <div className="grid grid-cols-10 gap-1.5 sm:gap-2 max-w-[340px] mx-auto">
          {cells.map((i) => {
            const adopted = i < ADOPTED
            const isYou = i === YOU_INDEX
            return (
              <div
                key={i}
                className="relative aspect-square rounded-full"
                style={{
                  backgroundColor: adopted ? '#E48715' : '#EDE7DC',
                  boxShadow: isYou ? '0 0 0 2px #FFFFFF, 0 0 0 4px #333333' : undefined,
                }}
                title={isYou ? 'You' : adopted ? 'Uses AI' : 'Hasn’t started'}
                aria-label={isYou ? 'You — already using AI' : adopted ? 'Uses AI' : 'Has not started'}
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
          <strong>You</strong> are one of the <strong style={{ color: '#E48715' }}>~18</strong> who already use AI.{' '}
          <span style={{ color: '#9C9C9C' }}>The other <strong>82</strong> haven&apos;t started yet.</span>
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
