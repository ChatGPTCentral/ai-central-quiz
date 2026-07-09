import CheckoutLink from '@/components/CheckoutLink.client'

// Horizontal auto-scrolling social-proof strip under the hero: reviews
// interleaved with recent purchases, looping continuously (pure CSS
// animation — no JS, server-renderable). Every card is a checkout link.
// Pauses on hover; disabled for prefers-reduced-motion.

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const XANTHOUS = '#E7B02F'

// Same fictional-buyer pool style as FomoPopup, with staggered timestamps.
const PURCHASES = [
  { name: 'James R.', flag: '🇺🇸', city: 'New York', ago: '2m' },
  { name: 'Sarah M.', flag: '🇺🇸', city: 'San Francisco', ago: '11m' },
  { name: 'Laurent D.', flag: '🇫🇷', city: 'Paris', ago: '24m' },
  { name: 'Emily K.', flag: '🇺🇸', city: 'Austin', ago: '38m' },
  { name: 'Tom W.', flag: '🇬🇧', city: 'London', ago: '52m' },
  { name: 'Priya S.', flag: '🇮🇳', city: 'Bengaluru', ago: '1h' },
  { name: 'Daniel P.', flag: '🇺🇸', city: 'Los Angeles', ago: '1h' },
  { name: 'Anna B.', flag: '🇩🇪', city: 'Berlin', ago: '2h' },
  { name: 'Kevin O.', flag: '🇺🇸', city: 'Nashville', ago: '2h' },
  { name: 'Sofia R.', flag: '🇪🇸', city: 'Madrid', ago: '3h' },
]

export interface MarqueeReview {
  name: string
  role: string
  text: string
}

function PurchaseCard({ p }: { p: (typeof PURCHASES)[number] }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', padding: '10px 14px', fontSize: 13 }}>
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: '#62A758' }} />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: '#2E7D32' }} />
      </span>
      <span style={{ color: RICH }}>
        <strong>{p.name}</strong> {p.flag} {p.city} claimed the $4.99 offer
      </span>
      <span style={{ color: MUTE, fontSize: 11.5 }}>{p.ago} ago</span>
    </span>
  )
}

function ReviewCard({ r }: { r: MarqueeReview }) {
  const text = r.text.length > 92 ? `${r.text.slice(0, 92).trimEnd()}…` : r.text
  return (
    <span className="inline-flex flex-col justify-center" style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', padding: '8px 14px', maxWidth: 420 }}>
      <span className="whitespace-nowrap" style={{ color: XANTHOUS, fontSize: 10, letterSpacing: '0.12em' }} aria-label="5 stars">★★★★★</span>
      <span className="whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: RICH, fontSize: 12.5, maxWidth: 390 }}>
        &ldquo;{text}&rdquo;
      </span>
      <span className="whitespace-nowrap" style={{ color: MUTE, fontSize: 11 }}>
        {r.name} · {r.role}
      </span>
    </span>
  )
}

export function SocialProofMarquee({
  reviews,
  checkoutUrl,
  submissionId,
}: {
  reviews: MarqueeReview[]
  checkoutUrl: string
  submissionId?: string
}) {
  // Interleave purchases and reviews so the strip alternates energy.
  const cards: React.ReactNode[] = []
  const n = Math.max(PURCHASES.length, reviews.length)
  for (let i = 0; i < n; i++) {
    if (PURCHASES[i]) cards.push(<PurchaseCard key={`p${i}`} p={PURCHASES[i]} />)
    if (reviews[i]) cards.push(<ReviewCard key={`r${i}`} r={reviews[i]} />)
  }

  const half = (dup: string) => (
    <div className="flex items-stretch" aria-hidden={dup === 'b'}>
      {cards.map((c, i) => (
        <CheckoutLink
          key={`${dup}${i}`}
          href={checkoutUrl}
          placement="social_marquee"
          submissionId={submissionId}
          className="inline-flex"
          style={{ textDecoration: 'none', marginRight: 12 }}
        >
          {c}
        </CheckoutLink>
      ))}
    </div>
  )

  return (
    <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: '#FEF7E7', overflow: 'hidden' }} aria-label="Recent purchases and reviews">
      <div className="ac-marquee flex" style={{ width: 'max-content', padding: '14px 0' }}>
        {half('a')}
        {half('b')}
      </div>
      <style>{`
        .ac-marquee { animation: ac-marquee-scroll 60s linear infinite; will-change: transform }
        .ac-marquee:hover { animation-play-state: paused }
        @keyframes ac-marquee-scroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @media (prefers-reduced-motion: reduce) { .ac-marquee { animation: none } }
      `}</style>
    </section>
  )
}
