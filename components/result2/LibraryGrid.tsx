import CheckoutLink from '@/components/CheckoutLink.client'

// "Show, don't tell" — a WALL of real covers, because the job of this section
// is to make 1,200 feel like 1,200. The first version grouped ten covers into
// four labelled rows, which had the opposite effect: chopping a small number
// into groups of three makes the library look tiny. Density is the message.
//
// No titles under the tiles. Titles force big tiles (ten per screen, not
// ninety), and we would be captioning covers we have not individually
// verified. The covers carry their own titles in the artwork.
//
// The wall is clipped and faded at the bottom so it reads as continuing past
// the frame rather than ending. That is the honest version of "there are more":
// we never claim the visible tiles are the whole library, and the caption says
// so in words too.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'

// The ten covers whose titles we hold in the repo (study plan + starter kit)
// lead the wall, so the most-scrutinised top-left tiles are the verified ones.
const VERIFIED = [
  'w_aice27', 'w_chau290', 'w_aice25', 'w_chau288', 'w_chau185',
  'w_chau136', 'w_aice24', 'w_aice33', 'w_defa10445', 'w_chau287',
]

// The rest of the catalogue under our own publisher slug. Every code here was
// probed and returns a real, distinct cover (bogus codes 404, so the range is
// meaningful rather than a CDN placeholder).
const SERIES = Array.from({ length: 90 }, (_, i) => `w_aice${i + 10}`)
  .filter(q => !VERIFIED.includes(q))

const COVERS = [...VERIFIED, ...SERIES]

const cover = (qf: string) => `https://img.tradepub.com/free/${qf}/images/${qf}c4.gif`

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 800, letterSpacing: '-0.04em', color: RICH, lineHeight: 1 }}>{n}</div>
      <div className="mt-1 font-mono uppercase" style={{ fontSize: 10, letterSpacing: '0.14em', color: MUTE, fontWeight: 700 }}>{label}</div>
    </div>
  )
}

export function LibraryGrid({ checkoutUrl, submissionId }: { checkoutUrl: string; submissionId?: string }) {
  return (
    <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: '#FFFDFA' }} aria-label="Inside the library">
      <div className="max-w-[1000px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
        <div className="text-center">
          <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>
            Inside the library
          </span>
          <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
            Tutorials you won&rsquo;t find anywhere else
          </h2>
          <p className="mt-3 mx-auto max-w-[620px]" style={{ fontWeight: 300, fontSize: 16.5, lineHeight: 1.5, color: BODY }}>
            Written and tested in-house, not scraped from the internet. Every one is step by step, with a
            screenshot at each stage, for professionals rather than developers.
          </p>
        </div>

        {/* The wall. One link, so a click anywhere on it opens checkout. */}
        <CheckoutLink
          href={checkoutUrl}
          placement="v2_library_grid"
          submissionId={submissionId}
          className="block mt-8"
          style={{ textDecoration: 'none', position: 'relative' }}
        >
          <div
            style={{
              maxHeight: 560,
              overflow: 'hidden',
              maskImage: 'linear-gradient(to bottom, #000 68%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, #000 68%, transparent 100%)',
            }}
          >
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 7 }}>
              {COVERS.map(qf => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={qf}
                  src={cover(qf)}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  style={{
                    width: '100%', aspectRatio: '3 / 4', objectFit: 'cover',
                    border: `1.5px solid ${INK}`, display: 'block', backgroundColor: CREAM,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Sits over the fade, so the wall visibly runs underneath it. */}
          <div className="text-center" style={{ marginTop: -18, position: 'relative' }}>
            <span
              className="inline-block font-mono uppercase"
              style={{
                fontSize: 11, letterSpacing: '0.14em', color: RICH, fontWeight: 700,
                backgroundColor: CREAM, border: `2px solid ${INK}`, padding: '8px 16px',
              }}
            >
              + 1,100 more inside &darr;
            </span>
          </div>
        </CheckoutLink>

        <div className="grid mt-9 text-center" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat n="1,200+" label="tutorials" />
          <Stat n="50+" label="templates" />
          <Stat n="Weekly" label="new drops" />
        </div>

        <p className="mt-6 text-center font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: '0.12em', color: MUTE, fontWeight: 700 }}>
          A sample of the covers &middot; the full library holds 1,200+ tutorials and 50+ templates
        </p>
      </div>
    </section>
  )
}
