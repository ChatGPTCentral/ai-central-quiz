import CheckoutLink from '@/components/CheckoutLink.client'

// Horizontal auto-scrolling social-proof strip under the hero: reviews
// interleaved with recent purchases, looping continuously (pure CSS
// animation — no JS, server-renderable). Every card is a checkout link.
// Pauses on hover; disabled for prefers-reduced-motion.

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const XANTHOUS = '#E7B02F'

// Fictional-buyer pool (same style as FomoPopup), staggered timestamps.
// Titles mirror the real converter profile (US-heavy, senior, hands-on
// practitioner roles); US cities carry their state code.
const PURCHASES = [
  { name: 'James R.', title: 'VP of Operations', flag: '🇺🇸', city: 'New York, NY', ago: '2m' },
  { name: 'Sarah M.', title: 'Marketing Director', flag: '🇺🇸', city: 'San Francisco, CA', ago: '11m' },
  { name: 'Laurent D.', title: 'Product Manager', flag: '🇫🇷', city: 'Paris', ago: '24m' },
  { name: 'Emily K.', title: 'HR Manager', flag: '🇺🇸', city: 'Austin, TX', ago: '38m' },
  { name: 'Tom W.', title: 'Head of Customer Success', flag: '🇬🇧', city: 'London', ago: '52m' },
  { name: 'Priya S.', title: 'Senior Business Analyst', flag: '🇮🇳', city: 'Bengaluru', ago: '1h' },
  { name: 'Daniel P.', title: 'Founder', flag: '🇺🇸', city: 'Los Angeles, CA', ago: '1h' },
  { name: 'Anna B.', title: 'Operations Lead', flag: '🇩🇪', city: 'Berlin', ago: '2h' },
  { name: 'Kevin O.', title: 'IT Systems Analyst', flag: '🇺🇸', city: 'Nashville, TN', ago: '2h' },
  { name: 'Sofia R.', title: 'Managing Director', flag: '🇪🇸', city: 'Madrid', ago: '3h' },
]

export interface MarqueeReview {
  name: string
  role: string
  text: string
  /** True only when the testimonial carries a genuine 5-star rating in
   *  Senja — cards without it show the quote and attribution, no stars. */
  rated?: boolean
}

function PurchaseCard({ p }: { p: (typeof PURCHASES)[number] }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', padding: '10px 14px', fontSize: 13 }}>
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: '#62A758' }} />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: '#2E7D32' }} />
      </span>
      <span style={{ color: RICH }}>
        <strong>{p.name}</strong> ({p.title}) from {p.flag} {p.city} started a trial of the AI Library
      </span>
      <span style={{ color: MUTE, fontSize: 11.5 }}>{p.ago} ago</span>
    </span>
  )
}

function ReviewCard({ r }: { r: MarqueeReview }) {
  const text = r.text.length > 92 ? `${r.text.slice(0, 92).trimEnd()}…` : r.text
  return (
    <span className="inline-flex flex-col justify-center" style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', padding: '8px 14px', maxWidth: 420 }}>
      {r.rated && (
        <span className="whitespace-nowrap" style={{ color: XANTHOUS, fontSize: 10, letterSpacing: '0.12em' }} aria-label="5 stars">★★★★★</span>
      )}
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
        .ac-marquee { animation: ac-marquee-scroll 90s linear infinite; will-change: transform }
        .ac-marquee:hover { animation-play-state: paused }
        @keyframes ac-marquee-scroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @media (prefers-reduced-motion: reduce) { .ac-marquee { animation: none } }
      `}</style>
    </section>
  )
}
