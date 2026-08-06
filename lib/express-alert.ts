// First-express-payment alarm.
//
// The owner's condition for switching one-tap wallets on was: "if the express
// does not save the card I don't want it, I'd lose the money later". The client
// already refuses to confirm a payment whose intent is not set up for reuse, so
// the failure mode is closed at the door. This is the second pair of eyes: it
// watches the SETTLED payment and answers the question directly.
//
// It does not just say "a wallet payment happened". A notification that makes
// the owner go and check something is a notification that gets checked late.
// This runs the check server-side and puts the verdict in the subject line, so
// the answer arrives before the question does.
//
// The real test of reusability is not what the intent claims, it is whether the
// payment method is ATTACHED to the customer afterwards. A wallet token that
// only authorised a one-off charge will not be listed on the customer, and the
// day-28 renewal would then fail. So we list the customer's payment methods and
// look for this exact one.

import type Stripe from 'stripe'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface ExpressVerdict {
  reusable: boolean
  paymentIntentId: string
  customerId: string | null
  paymentMethodId: string | null
  walletType: string | null
  brand: string | null
  last4: string | null
  setupFutureUsage: string | null
  attachedToCustomer: boolean
  amount: number
  currency: string
  email: string | null
  reasons: string[]
}

/** Answers "will this card charge again on day 28?" from the settled payment. */
export async function verifyExpressPayment(
  s: Stripe,
  paymentIntentId: string,
): Promise<ExpressVerdict> {
  const pi = await s.paymentIntents.retrieve(paymentIntentId, {
    expand: ['payment_method', 'customer'],
  })

  const pm = (typeof pi.payment_method === 'object' ? pi.payment_method : null) as Stripe.PaymentMethod | null
  const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null
  const card = pm?.card ?? null
  const reasons: string[] = []

  if (!customerId) reasons.push('no Customer attached to the PaymentIntent')
  if (pi.setup_future_usage !== 'off_session') {
    reasons.push(`setup_future_usage is "${pi.setup_future_usage ?? 'null'}", not "off_session"`)
  }

  // The decisive check: is this payment method actually ON the customer?
  let attached = false
  if (customerId && pm?.id) {
    try {
      const list = await s.customers.listPaymentMethods(customerId, { type: 'card', limit: 100 })
      attached = list.data.some(m => m.id === pm.id)
      if (!attached) reasons.push('the payment method is NOT attached to the customer, so it cannot be charged off-session')
    } catch (err) {
      reasons.push(`could not list the customer's payment methods: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    reusable: reasons.length === 0,
    paymentIntentId: pi.id,
    customerId,
    paymentMethodId: pm?.id ?? null,
    walletType: card?.wallet?.type ?? null,
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    setupFutureUsage: pi.setup_future_usage ?? null,
    attachedToCustomer: attached,
    amount: pi.amount,
    currency: pi.currency,
    email: pi.receipt_email ?? (typeof pi.customer === 'object' ? pi.customer && 'email' in pi.customer ? pi.customer.email ?? null : null : null),
    reasons,
  }
}

export async function sendExpressAlert(v: ExpressVerdict, siteUrl?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ADMIN_NOTIFY_EMAIL || 'chatgptcentral@gmail.com'
  const from = process.env.ADMIN_NOTIFY_FROM || 'AI Central <onboarding@resend.dev>'

  const wallet = v.walletType ? v.walletType.replace(/_/g, ' ') : 'wallet'
  const money = `${(v.amount / 100).toFixed(2)} ${v.currency.toUpperCase()}`
  const subject = v.reusable
    ? `✅ Express payment ${money} — card IS reusable (${wallet})`
    : `🚨 Express payment ${money} — card is NOT reusable, renewal at risk`

  const dash = `https://dashboard.stripe.com/payments/${encodeURIComponent(v.paymentIntentId)}`
  const cust = v.customerId ? `https://dashboard.stripe.com/customers/${encodeURIComponent(v.customerId)}` : null

  const verdictLine = v.reusable
    ? 'The payment method is attached to the customer and the intent is off_session, so the day-28 renewal will be able to charge it. Nothing to do.'
    : 'This card will NOT be chargeable on day 28. Turn wallets off with NEXT_PUBLIC_EXPRESS_PAY=false in Vercel and redeploy, then tell Claude.'

  const rows: [string, string][] = [
    ['Verdict', v.reusable ? 'REUSABLE' : 'NOT REUSABLE'],
    ['Wallet', v.walletType ?? '(none reported)'],
    ['Card', v.brand && v.last4 ? `${v.brand} ····${v.last4}` : '(unknown)'],
    ['setup_future_usage', v.setupFutureUsage ?? 'null'],
    ['Attached to customer', v.attachedToCustomer ? 'yes' : 'NO'],
    ['Customer', v.customerId ?? '(none)'],
    ['Email', v.email ?? '(unknown)'],
  ]

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px">
      <h2 style="margin:0 0 4px;font-size:20px">${v.reusable ? '✅' : '🚨'} First express (one-tap wallet) payment</h2>
      <p style="margin:0 0 16px;color:#555;font-size:14px">${money} · ${new Date().toISOString()}</p>
      <p style="background:${v.reusable ? '#EAF6EC' : '#FDECEA'};border-left:4px solid ${v.reusable ? '#2E7D32' : '#C0392B'};padding:12px 14px;margin:0 0 16px;font-size:14px;line-height:1.5">${verdictLine}</p>
      ${v.reasons.length ? `<ul style="font-size:13px;color:#C0392B">${v.reasons.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}
      <table style="border-collapse:collapse;font-size:13px;width:100%">
        ${rows.map(([k, val]) => `<tr><td style="padding:5px 10px 5px 0;color:#888;white-space:nowrap">${k}</td><td style="padding:5px 0;font-family:ui-monospace,monospace">${val}</td></tr>`).join('')}
      </table>
      <p style="margin:18px 0 0;font-size:13px">
        <a href="${dash}">Open the payment in Stripe</a>${cust ? ` &nbsp;·&nbsp; <a href="${cust}">Open the customer</a>` : ''}
      </p>
      ${siteUrl ? `<p style="margin:8px 0 0;font-size:13px"><a href="${siteUrl.replace(/\/$/, '')}/api/admin/checkout-health">checkout-health</a></p>` : ''}
    </div>`

  const text = [
    `${v.reusable ? 'REUSABLE' : 'NOT REUSABLE'} — first express payment ${money}`,
    verdictLine,
    ...v.reasons.map(r => `- ${r}`),
    ...rows.map(([k, val]) => `${k}: ${val}`),
    dash,
  ].join('\n')

  if (!apiKey) {
    console.log(`[express-alert] RESEND_API_KEY not set; would send "${subject}" to ${to}`)
    return
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    })
    if (!res.ok) console.error('[express-alert] resend failed:', res.status, await res.text())
  } catch (err) {
    console.error('[express-alert] send threw:', err)
  }
}
