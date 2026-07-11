import CheckoutLink from '@/components/CheckoutLink.client'

// Result page v2 copy of the social-proof marquee (placement
// v2_social_marquee so the funnel compares pages). Deliberately a COPY —
// v2 must not modify any file the live /result imports. Content contract
// identical: portrait cards, real Senja reviews passed in, fictional
// trial pool below.

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const XANTHOUS = '#E7B02F'

// Buyer pool mirrors the real converter profile (US-heavy, senior,
// practitioner roles). Owner decision: no India entries.
const PURCHASES = [
  { name: 'James R.', title: 'VP of Operations', flag: '🇺🇸', city: 'New York, NY', ago: '2m' },
  { name: 'Sarah M.', title: 'Marketing Director', flag: '🇺🇸', city: 'San Francisco, CA', ago: '11m' },
  { name: 'Laurent D.', title: 'Product Manager', flag: '🇫🇷', city: 'Paris', ago: '24m' },
  { name: 'Emily K.', title: 'HR Manager', flag: '🇺🇸', city: 'Austin, TX', ago: '38m' },
  { name: 'Tom W.', title: 'Head of Customer Success', flag: '🇬🇧', city: 'London', ago: '52m' },
  { name: 'Rachel T.', title: 'Senior Business Analyst', flag: '🇺🇸', city: 'Chicago, IL', ago: '1h' },
  { name: 'Daniel P.', title: 'Founder', flag: '🇺🇸', city: 'Los Angeles, CA', ago: '1h' },
  { name: 'Anna B.', title: 'Operations Lead', flag: '🇩🇪', city: 'Berlin', ago: '2h' },
  { name: 'Kevin O.', title: 'IT Systems Analyst', flag: '🇺🇸', city: 'Nashville, TN', ago: '2h' },
  { name: 'Sofia R.', title: 'Managing Director', flag: '🇪🇸', city: 'Madrid', ago: '3h' },
]

export interface MarqueeReview {
  name: string
  role: string
  text: string
  rated?: boolean
  avatarUrl?: string
}

function PurchaseCard({ p }: { p: (typeof PURCHASES)[number] }) {
  return (
    <span className="inline-flex flex-col" style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', width: 216, height: 316, overflow: 'hidden' }}>
      <span className="flex items-center justify-center" style={{ width: '100%', height: 136, backgroundColor: '#FEF7E7', borderBottom: `2px solid ${INK}`, fontSize: 56, lineHeight: 1 }} aria-hidden>
        {p.flag}
      </span>
      <span className="flex flex-col flex-1 min-h-0" style={{ padding: '10px 12px 11px' }}>
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: '#2E7D32' }}>
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: '#62A758' }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: '#2E7D32' }} />
          </span>
          NEW TRIAL
        </span>
        <span className="whitespace-normal" style={{ color: RICH, fontSize: 12.5, lineHeight: 1.42, marginTop: 4 }}>
          <strong>{p.name}</strong> ({p.title}) from {p.flag} {p.city} started a trial of the AI Library
        </span>
        <span className="mt-auto block" style={{ color: MUTE, fontSize: 10.5 }}>{p.ago} ago</span>
      </span>
    </span>
  )
}

function ReviewCard({ r }: { r: MarqueeReview }) {
  const text = r.text.length > 150 ? `${r.text.slice(0, 150).trimEnd()}…` : r.text
  return (
    <span className="inline-flex flex-col" style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', width: 216, height: 316, overflow: 'hidden' }}>
      {r.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={r.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: 136, objectFit: 'cover', objectPosition: 'center 25%', borderBottom: `2px solid ${INK}`, display: 'block', backgroundColor: '#FEF7E7' }}
        />
      ) : (
        <span className="flex items-center justify-center" style={{ width: '100%', height: 136, backgroundColor: '#FEF7E7', borderBottom: `2px solid ${INK}`, fontSize: 44, fontWeight: 900, color: INK }} aria-hidden>
          {r.name[0]}
        </span>
      )}
      <span className="flex flex-col flex-1 min-h-0" style={{ padding: '10px 12px 11px' }}>
        {r.rated && (
          <span style={{ color: XANTHOUS, fontSize: 11, letterSpacing: '0.14em' }} aria-label="5 stars">★★★★★</span>
        )}
        <span
          className="whitespace-normal"
          style={{ color: RICH, fontSize: 12.5, lineHeight: 1.42, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          &ldquo;{text}&rdquo;
        </span>
        <span className="mt-auto block" style={{ paddingTop: 8 }}>
          <span className="block whitespace-normal" style={{ color: RICH, fontSize: 12, fontWeight: 700, lineHeight: 1.25 }}>{r.name}</span>
          <span className="block whitespace-normal" style={{ color: MUTE, fontSize: 10.5, lineHeight: 1.3 }}>{r.role}</span>
        </span>
      </span>
    </span>
  )
}

export function Marquee2({
  reviews,
  checkoutUrl,
  submissionId,
  mode = 'mixed',
}: {
  reviews: MarqueeReview[]
  checkoutUrl: string
  submissionId?: string
  /** 'purchases' = FOMO trial cards only · 'reviews' = testimonials only. */
  mode?: 'mixed' | 'purchases' | 'reviews'
}) {
  const cards: React.ReactNode[] = []
  const n = Math.max(mode === 'reviews' ? 0 : PURCHASES.length, mode === 'purchases' ? 0 : reviews.length)
  for (let i = 0; i < n; i++) {
    if (mode !== 'reviews' && PURCHASES[i]) cards.push(<PurchaseCard key={`p${i}`} p={PURCHASES[i]} />)
    if (mode !== 'purchases' && reviews[i]) cards.push(<ReviewCard key={`r${i}`} r={reviews[i]} />)
  }

  const half = (dup: string) => (
    <div className="flex items-center" aria-hidden={dup === 'b'}>
      {cards.map((c, i) => (
        <CheckoutLink
          key={`${dup}${i}`}
          href={checkoutUrl}
          placement="v2_social_marquee"
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
      <div className="ac-marquee2 flex" style={{ width: 'max-content', padding: '14px 0' }}>
        {half('a')}
        {half('b')}
      </div>
      <style>{`
        .ac-marquee2 { animation: ac-marquee2-scroll 90s linear infinite; will-change: transform }
        .ac-marquee2:hover { animation-play-state: paused }
        @keyframes ac-marquee2-scroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @media (prefers-reduced-motion: reduce) { .ac-marquee2 { animation: none } }
      `}</style>
    </section>
  )
}
