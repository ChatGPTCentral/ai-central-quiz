// Dynamic member-pass image (1200x630) for social sharing. Rendered with
// next/og (satori) from query params so the share unfurl on LinkedIn / X /
// WhatsApp shows the person's actual pass. No DB access — everything comes
// from the URL, so the edge runtime can cache aggressively.
//
//   /api/pass-image?name=Fig+Jam&stage=PRACTITIONER&profile=Decision+Maker
//                   &pct=14&issued=07+%2F+2026&ref=AC-0723

import { ImageResponse } from 'next/og'

export const runtime = 'edge'

const CREAM = '#FEF7E7'
const INK = '#333333'
const RICH = '#1A1A1A'
const PAPER = '#FFFDFA'
const XANTHOUS = '#E7B02F'

/** Deterministic barcode bars from a seed (same scheme as PassCard). */
function barcodeBars(seed: string, width: number): { x: number; w: number }[] {
  let h = 0
  for (const c of seed) h = ((h * 31 + c.charCodeAt(0)) >>> 0)
  const bars: { x: number; w: number }[] = [{ x: 0, w: 4 }, { x: 6, w: 2 }]
  let x = 12
  while (x < width - 16) {
    h = ((h * 1103515245 + 12345) >>> 0)
    const w = 2 + (h % 7)
    h = ((h * 1103515245 + 12345) >>> 0)
    const gap = 2 + (h % 5)
    bars.push({ x, w })
    x += w + gap
  }
  bars.push({ x: width - 10, w: 2 }, { x: width - 6, w: 4 })
  return bars
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const now = new Date()
  const defaultIssued = `${String(now.getMonth() + 1).padStart(2, '0')} / ${now.getFullYear()}`
  const name = (searchParams.get('name') || 'AI Professional').slice(0, 40).toUpperCase()
  const stage = (searchParams.get('stage') || 'CURIOUS').slice(0, 24).toUpperCase()
  const profile = (searchParams.get('profile') || 'AI Professional').slice(0, 24)
  const pct = (searchParams.get('pct') || '38').replace(/[^0-9.]/g, '') || '38'
  const issued = (searchParams.get('issued') || defaultIssued).slice(0, 12)
  const ref = (searchParams.get('ref') || 'AC-0723').slice(0, 12).toUpperCase()
  const desc = (searchParams.get('desc') || '').slice(0, 240)

  // Optional v2 additions (default behavior below is untouched without them):
  // style=id renders the US-ID card layout; photo= embeds the member's
  // uploaded face, accepted ONLY from our own public pass-photos bucket.
  const style = searchParams.get('style')
  const photoRaw = searchParams.get('photo') || ''
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const photo =
    photoRaw && supaUrl && photoRaw.startsWith(`${supaUrl}/storage/v1/object/public/pass-photos/`)
      ? photoRaw.slice(0, 500)
      : ''

  if (style === 'id') {
    const idBars = barcodeBars(ref, 360)
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 1000, border: `6px solid ${RICH}`, backgroundColor: '#FDFBF3', boxShadow: '0 16px 48px rgba(0,0,0,.25)' }}>
            {/* header band */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: INK, padding: '20px 36px' }}>
              <span style={{ fontSize: 24, letterSpacing: 6, color: CREAM }}>AI CENTRAL · MEMBER IDENTIFICATION</span>
              <span style={{ fontSize: 22, letterSpacing: 3, color: XANTHOUS }}>{issued}</span>
            </div>
            <div style={{ display: 'flex', height: 8, background: XANTHOUS }} />

            {/* body: photo box + fields */}
            <div style={{ display: 'flex', gap: 36, padding: '30px 36px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 218, height: 272, border: `4px solid ${RICH}`, backgroundColor: '#F1ECE1', overflow: 'hidden' }}>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} width={218} height={272} style={{ objectFit: 'cover', width: 218, height: 272 }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ display: 'flex', width: 84, height: 84, borderRadius: 42, backgroundColor: '#D9D2C2' }} />
                    <div style={{ display: 'flex', width: 140, height: 74, borderTopLeftRadius: 70, borderTopRightRadius: 70, backgroundColor: '#D9D2C2', marginTop: 10 }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontSize: 17, letterSpacing: 4, color: '#9C9C9C' }}>NAME</span>
                <span style={{ fontSize: 58, fontWeight: 700, letterSpacing: -1, color: RICH, lineHeight: 1.02 }}>{name}</span>
                <span style={{ marginTop: 12, fontSize: 24, letterSpacing: 4, color: '#E48715', fontWeight: 700 }}>STAGE: {stage}</span>
                <div style={{ display: 'flex', marginTop: 22, borderTop: '2px solid #DDD5C4', paddingTop: 18, gap: 60 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 15, letterSpacing: 3, color: '#9C9C9C' }}>PROFILE</span>
                    <span style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: RICH }}>{profile}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 15, letterSpacing: 3, color: '#9C9C9C' }}>AI LEADERSHIP</span>
                    <span style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: '#E48715' }}>Top {pct}% World</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 15, letterSpacing: 3, color: '#9C9C9C' }}>ID NO.</span>
                    <span style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: RICH }}>{ref}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* barcode strip */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CREAM, borderTop: `4px solid ${RICH}`, padding: '14px 36px' }}>
              <div style={{ display: 'flex', width: 360, height: 36, position: 'relative' }}>
                {idBars.map((b, i) => (
                  <div key={i} style={{ position: 'absolute', left: b.x, top: 0, width: b.w, height: 36, backgroundColor: RICH, display: 'flex' }} />
                ))}
              </div>
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: RICH }}>VERIFIED MEMBER</span>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    )
  }

  const bars = barcodeBars(ref, 420)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: PAPER,
        }}
      >
        {/* The pass card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 940,
            border: `6px solid ${RICH}`,
            backgroundColor: INK,
            boxShadow: '0 16px 48px rgba(0,0,0,.3)',
            transform: 'rotate(-1.6deg)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', padding: '44px 52px 36px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 22, letterSpacing: 4, color: CREAM, opacity: 0.65 }}>
                AI CENTRAL · MEMBER PASS
              </span>
              <span style={{ fontSize: 22, letterSpacing: 3, color: XANTHOUS }}>{issued}</span>
            </div>

            {/* Name */}
            <div
              style={{
                marginTop: 30,
                fontSize: 84,
                fontWeight: 700,
                letterSpacing: -2,
                color: CREAM,
                lineHeight: 1,
              }}
            >
              {name}
            </div>

            {/* Stage line */}
            <div style={{ marginTop: 18, fontSize: 26, letterSpacing: 4, color: XANTHOUS, display: 'flex' }}>
              STAGE: {stage}
            </div>

            {/* Divider */}
            <div style={{ marginTop: 30, height: 2, backgroundColor: 'rgba(254,247,231,0.25)', display: 'flex' }} />

            {/* Fields */}
            <div style={{ display: 'flex', marginTop: desc ? 22 : 26, gap: 80 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 18, letterSpacing: 3, color: CREAM, opacity: 0.5 }}>PROFILE</span>
                <span style={{ marginTop: 8, fontSize: 30, fontWeight: 700, color: CREAM }}>{profile}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 18, letterSpacing: 3, color: CREAM, opacity: 0.5 }}>AI LEADERSHIP SCORE</span>
                <span style={{ marginTop: 8, fontSize: 30, fontWeight: 700, color: XANTHOUS }}>
                  Top {pct}% World
                </span>
              </div>
            </div>

            {/* Profile description (download variant) */}
            {desc ? (
              <div style={{ display: 'flex', marginTop: 20, fontSize: 19, lineHeight: 1.4, color: CREAM, opacity: 0.75, maxWidth: 820 }}>
                {desc}
              </div>
            ) : null}
          </div>

          {/* Barcode strip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: CREAM,
              borderTop: `6px solid ${RICH}`,
              padding: '18px 52px',
            }}
          >
            <div style={{ display: 'flex', width: 420, height: 44, position: 'relative' }}>
              {bars.map((b, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: b.x,
                    top: 0,
                    width: b.w,
                    height: 44,
                    backgroundColor: RICH,
                    display: 'flex',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2, color: RICH }}>NO. {ref}</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
