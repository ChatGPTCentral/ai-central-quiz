import Stripe from 'stripe'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

// return_url after the embedded checkout. Confirms the session actually paid,
// then hands off to the SAME beehiiv thank-you page the payment link used, so
// the post-purchase experience (and any automation on it) is preserved.
const THANK_YOU = 'https://gptcentral.beehiiv.com/thank-you-premium'
const INK = '#1A1A1A', CREAM = '#FFFDF7', BODY = '#4A4A4A'

export default async function CheckoutSuccess({ searchParams }: { searchParams: { session_id?: string } }) {
  const id = searchParams.session_id
  let paid = false
  if (id && process.env.STRIPE_SECRET_KEY) {
    try {
      const s = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2 })
      const session = await s.checkout.sessions.retrieve(id)
      paid = session.status === 'complete' || session.payment_status === 'paid'
    } catch { /* fall through to pending state */ }
  }
  if (paid) redirect(THANK_YOU)

  return (
    <main style={{ minHeight: '100vh', background: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: INK }}>Finishing up…</h1>
        <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: BODY, fontWeight: 300 }}>
          If you completed payment, your access email is on its way. If this page persists, your payment did not go through —
          <a href="/checkout" style={{ color: '#046BB1', fontWeight: 700 }}> try again</a>.
        </p>
      </div>
    </main>
  )
}
