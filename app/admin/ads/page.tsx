import AdsPanel from './AdsPanel.client'

// Paid acquisition, judged against one honest bar.
//
// The quiz database and the LinkedIn ads agent already share a Postgres, so the
// two halves of the funnel were never really separate — they just had no single
// screen. This is that screen: LinkedIn owns spend, we own what happened after
// the click, and the only question worth asking is whether the two reconcile.

export const dynamic = 'force-dynamic'

export default function AdsPage() {
  return (
    <div className="max-w-[1100px]">
      <h1 style={{ fontSize: 23, fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.02em' }}>Ads</h1>
      <p style={{ fontSize: 13.5, color: '#4A4A4A', marginTop: 4, marginBottom: 20, lineHeight: 1.5 }}>
        What paid traffic does after it lands, and whether it pays for itself
      </p>
      <AdsPanel />
    </div>
  )
}
