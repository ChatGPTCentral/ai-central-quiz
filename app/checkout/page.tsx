import { cookies } from 'next/headers'
import EmbeddedCheckout from './EmbeddedCheckout.client'
import { offerByKey, TRIAL_OFFER } from '@/lib/offers'
import { resolveLifetimePriceId } from '@/lib/offers-server'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

const INK = '#1A1A1A', CREAM = '#FFFDF7', FULVOUS = '#E48715', BODY = '#4A4A4A'

// Branded, on-domain checkout: the buy happens here (embedded Stripe form),
// no jarring redirect to checkout.stripe.com. The terms are stated up front so
// the $59.75/year renewal is never a surprise at the till.
export default async function CheckoutPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const anonId = cookies().get('ac_aid')?.value
  // Same gate as the result page: an offer is only real if its price exists.
  // This page is where a visitor lands when the modal fails, so it has to reach
  // the same answer, not a hopeful one.
  const asked = offerByKey(searchParams.offer)
  const offer = asked.key === 'lifetime' && (await resolveLifetimePriceId()) ? asked : TRIAL_OFFER
  return (
    <main style={{ minHeight: '100vh', background: CREAM }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 64px' }}>
        <div style={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: 18, color: INK, marginBottom: 24 }}>AI Central</div>

        <div style={{ border: `3px solid ${INK}`, background: '#FFFFFF', padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: FULVOUS }}>The Ultimate AI Library</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>
            {offer.oneTime ? 'Get the library for ' : 'Start your trial for '}
            <span style={{ color: FULVOUS }}>{offer.price}</span>
          </h1>
          <p style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.5, color: BODY, fontWeight: 300 }}>
            {offer.oneTime
              ? `1,200+ tutorials and 50+ templates, yours for one payment of ${offer.price}. No renewal, no card kept on file, nothing to cancel. Every update we add lands in your library. 30-day guarantee.`
              : '1,200+ tutorials and 50+ templates. The first 4 weeks are $4.99. After that it is $59.75/year on the card you save today, cancel anytime in your trial month and pay nothing more. 30-day guarantee.'}
          </p>
        </div>

        <EmbeddedCheckout submissionId={searchParams.id} anonId={anonId} utmSource={searchParams.utm_source} utmRef={searchParams.utm_ref} offer={offer.key} />

        <p style={{ marginTop: 16, fontSize: 11.5, color: '#9C9C9C', textAlign: 'center' }}>
          {offer.oneTime
            ? 'Secure payment by Stripe · one payment, no card kept on file, nothing to cancel.'
            : 'Secure payment by Stripe · your card is saved for the renewal, which you can cancel anytime.'}
        </p>
      </div>
    </main>
  )
}
