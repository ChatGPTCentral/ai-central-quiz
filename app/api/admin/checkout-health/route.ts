// Checkout health — what will the embedded form ACTUALLY offer a buyer?
//
// "Enabled in the Stripe dashboard" and "renders on our embedded checkout" are
// two different things, and the gap costs money:
//   - Apple Pay / Google Pay are card WALLETS, so they never appear in
//     payment_method_types. On embedded Checkout (our own domain) they only
//     render if the domain is registered under payment_method_domains.
//   - PayPal DOES appear as its own payment_method_type — and it is the one to
//     be careful with, because our day-28 renewal depends on
//     setup_future_usage: off_session saving a reusable payment method.
//
// Admin-gated (middleware covers /admin, this route checks the cookie itself).

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_1TSKc4BLsgHOvWxyhu5SWwDr'

export async function GET(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })
  const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2 })

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai'
  const host = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const out: Record<string, unknown> = { host, checkedAt: new Date().toISOString() }

  // 1. Create a throwaway session exactly like the live one and read back what
  //    Stripe says it will accept. Sessions expire unused; nothing is charged.
  try {
    const s = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer_creation: 'always',
      payment_intent_data: { setup_future_usage: 'off_session' },
      // Must mirror app/api/checkout/session exactly, or this diagnostic
      // reports on a form buyers never see.
      billing_address_collection: 'auto',
      automatic_tax: { enabled: false },
      return_url: `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    })
    const types = s.payment_method_types || []
    out.paymentMethodTypes = types
    out.paypalEnabled = types.includes('paypal')
    out.cardEnabled = types.includes('card')
  } catch (e) {
    out.sessionError = e instanceof Error ? e.message : String(e)
  }

  // 2. Apple Pay / Google Pay on OUR domain: is the domain registered, and does
  //    Stripe consider each wallet active on it?
  try {
    const domains = await stripe.paymentMethodDomains.list({ limit: 100 })
    const mine = domains.data.find(d => d.domain_name === host)
    out.domainRegistered = !!mine
    if (mine) {
      out.domainEnabled = mine.enabled
      out.applePay = mine.apple_pay?.status ?? 'unknown'
      out.googlePay = mine.google_pay?.status ?? 'unknown'
      out.link = mine.link?.status ?? 'unknown'
    } else {
      out.registeredDomains = domains.data.map(d => d.domain_name)
    }
  } catch (e) {
    out.domainError = e instanceof Error ? e.message : String(e)
  }

  // 3. Does a PayPal buyer actually leave a reusable payment method? Answered
  //    from real charges, not theory: for each recent successful charge, note
  //    how it was paid, then ask whether that customer has a saved, reusable
  //    payment method. If PayPal buyers systematically have none while card
  //    buyers do, PayPal is silently breaking the day-28 renewal.
  try {
    const charges = await stripe.charges.list({ limit: 100 })
    const seen = new Map<string, { method: string; customer: string }>()
    for (const ch of charges.data) {
      if (ch.status !== 'succeeded') continue
      const cust = typeof ch.customer === 'string' ? ch.customer : ch.customer?.id
      if (!cust || seen.has(cust)) continue
      seen.set(cust, { method: ch.payment_method_details?.type || 'unknown', customer: cust })
    }
    const byMethod: Record<string, { buyers: number; withReusablePm: number }> = {}
    // Cap the lookups so the route stays fast.
    const sample = Array.from(seen.values()).slice(0, 40)
    for (const s of sample) {
      const bucket = (byMethod[s.method] ||= { buyers: 0, withReusablePm: 0 })
      bucket.buyers++
      try {
        const pms = await stripe.paymentMethods.list({ customer: s.customer, limit: 10 })
        if (pms.data.length > 0) bucket.withReusablePm++
      } catch { /* customer may be deleted — counts as no saved method */ }
    }
    out.savedMethodByPayType = byMethod

    // WALLET-LEVEL PROOF, for the express checkout decision.
    //
    // "Do instant wallets stay chargeable on day 28?" cannot be answered from
    // payment_method_details.type alone: Apple Pay and Google Pay both report
    // as type 'card'. The wallet only shows up one level down, in
    // card.wallet.type — so a 10/10 'card' result could be ten typed cards and
    // zero wallets, and we would have proven nothing about express.
    //
    // This re-walks the same charges keyed on the WALLET, then asks whether
    // each of those buyers has a reusable saved payment method today. Real
    // evidence from real money, not the config echo.
    const byWallet: Record<string, { buyers: number; withReusablePm: number; customers: string[] }> = {}
    for (const ch of charges.data) {
      if (ch.status !== 'succeeded') continue
      const cust = typeof ch.customer === 'string' ? ch.customer : ch.customer?.id
      if (!cust) continue
      const card = ch.payment_method_details?.card
      const wallet = card?.wallet?.type || (card ? 'card_no_wallet' : ch.payment_method_details?.type || 'unknown')
      const b = (byWallet[wallet] ||= { buyers: 0, withReusablePm: 0, customers: [] })
      if (b.customers.includes(cust)) continue
      b.customers.push(cust)
      b.buyers++
    }
    for (const [wallet, b] of Object.entries(byWallet)) {
      for (const cust of b.customers.slice(0, 15)) {
        try {
          const pms = await stripe.paymentMethods.list({ customer: cust, limit: 5 })
          if (pms.data.length > 0) b.withReusablePm++
        } catch { /* deleted customer counts as no saved method */ }
      }
      // Customer ids are internal plumbing, not something to hand back.
      ;(b as { customers?: string[] }).customers = undefined
    }
    out.savedMethodByWallet = byWallet
    const pp = byMethod['paypal']
    if (pp) {
      out.paypalBuyersSampled = pp.buyers
      out.paypalBuyersWithSavedMethod = pp.withReusablePm
      out.paypalSavesForRenewal = pp.buyers > 0 ? pp.withReusablePm / pp.buyers : null
    } else {
      out.paypalBuyersSampled = 0
    }
  } catch (e) {
    out.renewalAuditError = e instanceof Error ? e.message : String(e)
  }

  // 4. WHERE DO NON-US PAYMENTS DIE?
  //
  // Every cohort clicks the CTA at the same rate (32-36%), but click→paid is
  // 16-20% in the US and 4-9% everywhere else. The UK has had ~26 clicks and
  // zero sales, Canada ~13 and zero. That is not price sensitivity, something
  // is failing — and it has been invisible to us because a failed payment never
  // reaches our database. Only Stripe knows.
  //
  // Prime suspect: 3D Secure. The UK and EU mandate strong customer
  // authentication and the US does not, and we ask for setup_future_usage:
  // off_session (needed for the day-28 renewal), which is exactly the shape
  // that triggers a challenge. `requires_action` piling up on non-US cards
  // would confirm it.
  //
  // Card COUNTRY is the issuing country from the charge, which is what we want:
  // it is the buyer's bank, not their IP or billing form.
  try {
    const sinceDays = 30
    const since = Math.floor(Date.now() / 1000) - sinceDays * 86400
    type Row = { total: number; succeeded: number; requiresAction: number; failed: number; canceled: number; declineCodes: Record<string, number> }
    const byCountry: Record<string, Row> = {}
    const statusTotals: Record<string, number> = {}
    const declineTotals: Record<string, number> = {}
    let scanned = 0
    let noCountry = 0

    let startingAfter: string | undefined
    for (let page = 0; page < 5; page++) {
      const pis = await stripe.paymentIntents.list({
        limit: 100,
        created: { gte: since },
        expand: ['data.latest_charge'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      for (const pi of pis.data) {
        scanned++
        statusTotals[pi.status] = (statusTotals[pi.status] || 0) + 1
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const charge = pi.latest_charge as any
        const country: string | undefined =
          charge?.payment_method_details?.card?.country ||
          charge?.billing_details?.address?.country ||
          undefined
        const code = pi.last_payment_error?.decline_code || pi.last_payment_error?.code
        if (code) declineTotals[code] = (declineTotals[code] || 0) + 1
        if (!country) { noCountry++; continue }
        const r = (byCountry[country] ||= { total: 0, succeeded: 0, requiresAction: 0, failed: 0, canceled: 0, declineCodes: {} })
        r.total++
        if (pi.status === 'succeeded') r.succeeded++
        else if (pi.status === 'requires_action' || pi.status === 'requires_confirmation') r.requiresAction++
        else if (pi.status === 'canceled') r.canceled++
        else r.failed++
        if (code) r.declineCodes[code] = (r.declineCodes[code] || 0) + 1
      }
      if (!pis.has_more) break
      startingAfter = pis.data[pis.data.length - 1]?.id
      if (!startingAfter) break
    }

    // Sorted worst-first by completion rate, so the problem countries lead.
    const rows = Object.entries(byCountry)
      .map(([country, r]) => ({
        country, ...r,
        completionPct: r.total > 0 ? Math.round((r.succeeded / r.total) * 100) : null,
      }))
      .sort((a, b) => b.total - a.total)

    out.payments = {
      windowDays: sinceDays,
      intentsScanned: scanned,
      intentsWithoutCountry: noCountry,
      byStatus: statusTotals,
      declineCodes: declineTotals,
      byCountry: rows,
    }

    // Call out the specific pattern we are hunting.
    const us = rows.find(r => r.country === 'US')
    const nonUs = rows.filter(r => r.country !== 'US')
    const nonUsTotal = nonUs.reduce((a, r) => a + r.total, 0)
    const nonUsOk = nonUs.reduce((a, r) => a + r.succeeded, 0)
    const nonUsAction = nonUs.reduce((a, r) => a + r.requiresAction, 0)
    out.paymentsSummary = {
      usCompletionPct: us?.completionPct ?? null,
      nonUsCompletionPct: nonUsTotal > 0 ? Math.round((nonUsOk / nonUsTotal) * 100) : null,
      nonUsStuckOnAuthentication: nonUsAction,
      nonUsIntents: nonUsTotal,
    }
  } catch (e) {
    out.paymentsError = e instanceof Error ? e.message : String(e)
  }

  // 5. The verdict that matters for revenue.
  const notes: string[] = []
  if (out.domainRegistered !== true) {
    notes.push(`Apple Pay / Google Pay will NOT render on the embedded form: ${host} is not registered under Stripe payment method domains. Fix: Stripe → Settings → Payment methods → Apple Pay → Add domain.`)
  } else if (out.applePay !== 'active') {
    notes.push(`Domain is registered but Apple Pay status is "${out.applePay}" — it will not render until active.`)
  } else {
    notes.push('Apple Pay / Google Pay are live on the embedded form.')
  }
  if (out.paypalEnabled) {
    const sampled = Number(out.paypalBuyersSampled || 0)
    const rate = out.paypalSavesForRenewal as number | null | undefined
    if (sampled === 0) {
      notes.push('PayPal IS enabled on the embedded checkout, but no PayPal buyer has come through yet, so we cannot prove it saves a reusable payment method. Until proven, every PayPal sale risks being a $4.99 customer instead of a $4.99 + $59.75/yr one. Safest move is to exclude PayPal from the session until verified.')
    } else if (rate != null && rate < 0.9) {
      notes.push(`PayPal is BREAKING the renewal: only ${out.paypalBuyersWithSavedMethod}/${sampled} PayPal buyers have a reusable saved payment method. Exclude PayPal from the embedded session.`)
    } else {
      notes.push(`PayPal saves a reusable payment method for ${out.paypalBuyersWithSavedMethod}/${sampled} sampled buyers, so the day-28 renewal should fire. Safe to keep.`)
    }
  }

  // The geography verdict. Written as a sentence rather than left as numbers,
  // because the whole point is to answer one question: is non-US money being
  // lost at the payment step, and if so is authentication the reason?
  const ps = out.paymentsSummary as
    | { usCompletionPct: number | null; nonUsCompletionPct: number | null; nonUsStuckOnAuthentication: number; nonUsIntents: number }
    | undefined
  if (ps && ps.nonUsIntents > 0 && ps.usCompletionPct != null && ps.nonUsCompletionPct != null) {
    const gap = ps.usCompletionPct - ps.nonUsCompletionPct
    if (gap >= 15) {
      notes.push(
        `Non-US payments complete at ${ps.nonUsCompletionPct}% against ${ps.usCompletionPct}% in the US, a ${gap}-point gap over ${ps.nonUsIntents} intents. ` +
        (ps.nonUsStuckOnAuthentication > 0
          ? `${ps.nonUsStuckOnAuthentication} non-US intents are stuck awaiting authentication, which points at 3D Secure. Check the declineCodes map and Stripe → Payments → filter Incomplete.`
          : 'Nothing is stuck on authentication, so look at the declineCodes map instead: issuer declines and do_not_honor point at card acceptance, not 3DS.'),
      )
    } else {
      notes.push(`Non-US payments complete at ${ps.nonUsCompletionPct}% vs ${ps.usCompletionPct}% in the US, so the checkout itself is not where the geography gap comes from.`)
    }
  } else if (ps && ps.nonUsIntents === 0) {
    notes.push('No non-US payment intents in the window at all. If non-US visitors are clicking the CTA, they are dropping out BEFORE a payment intent exists, which points at the form itself rather than the card.')
  }

  // The express-checkout verdict, stated plainly. This is the one question
  // that decides whether one-tap wallets can go live: a wallet sale that does
  // not leave a chargeable card is $4.99 instead of $4.99 + $59.75/yr, and we
  // would not discover it for 28 days.
  const wal = out.savedMethodByWallet as Record<string, { buyers: number; withReusablePm: number }> | undefined
  if (wal) {
    const ap = wal['apple_pay']
    const gp = wal['google_pay']
    const seen = [ap, gp].filter(Boolean) as { buyers: number; withReusablePm: number }[]
    const totalBuyers = seen.reduce((a, b) => a + b.buyers, 0)
    const totalSaved = seen.reduce((a, b) => a + b.withReusablePm, 0)
    if (totalBuyers === 0) {
      const plain = wal['card_no_wallet']
      notes.push(
        'NO Apple Pay or Google Pay sale has come through yet, so wallet reuse is not proven from our own data. ' +
        (plain ? `Typed cards do save: ${plain.withReusablePm}/${plain.buyers} of those buyers have a reusable payment method. ` : '') +
        'Apple Pay and Google Pay are card wallets — Stripe stores the resulting card the same way — so the mechanism is the same, but one real wallet purchase would turn that from reasoning into evidence.',
      )
    } else if (totalSaved === totalBuyers) {
      notes.push(`Wallet reuse CONFIRMED from real charges: ${totalSaved}/${totalBuyers} Apple Pay / Google Pay buyers have a reusable saved payment method, so the day-28 renewal will fire. Express checkout is safe to enable.`)
    } else {
      notes.push(`WARNING: only ${totalSaved}/${totalBuyers} Apple Pay / Google Pay buyers have a reusable saved payment method. Do NOT enable express checkout until this is 100%.`)
    }
  }

  out.notes = notes

  return NextResponse.json(out)
}
