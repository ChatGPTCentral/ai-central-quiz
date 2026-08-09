'use client'

// "You do not have to pay for this yourself."
//
// THE THEORY, stated so it can be killed. Some people do not buy because
// $59.75 is THEIR money and has to be justified to themselves. For anyone with
// a learning and development budget it is not their money at all, and the
// decision stops being a decision. The blocker is not the price, it is who
// pays. If that is right, handing them a ready-to-send email removes the
// justification work entirely.
//
// THE FALSIFIABLE PART. If the theory holds, opens and copies should skew hard
// toward senior, employed job levels and barely register with students and
// freelancers. Every event carries the submission id, so job_level joins
// straight on. If clicks are spread evenly across everyone, the theory is
// wrong and this is just a novelty button, and it should be removed rather
// than "iterated on".
//
// KILL NUMBER: under 2% open rate after 300 impressions.
//
// The email argues with THEIR number, not ours. The hours figure is the one
// they typed into question 2, which is the same reason the cost line above the
// offer works: nobody argues with their own answer.

import { useState, useEffect, useRef } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'

const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const FULVOUS = '#E48715'
const PAPER = '#FBF6EC'
const HAIRLINE = '#E0E0E0'

const PLACEMENT = 'v2_expense_email'

/** Same arithmetic as costLine() on the result page: 48 working weeks a year. */
function weeksAYear(hours: number): number {
  return Math.round((hours * 48) / 40)
}

/** The band wording, matched to costLine so the page never contradicts itself. */
function hoursBand(hours: number): string {
  if (hours >= 15) return 'over 15 hours'
  if (hours >= 8) return '8 to 15 hours'
  if (hours >= 4) return '4 to 7 hours'
  if (hours >= 1) return '1 to 3 hours'
  return 'under an hour'
}

function buildEmail(stageLabel: string | null, hoursLost: number | null): string {
  // Every personalised line degrades to a sentence that still reads naturally,
  // because hours_lost is NULL on every row from before the cost question
  // shipped, and those people still see this block.
  const assessment = stageLabel
    ? `I took their assessment this week and it put me at ${stageLabel}.`
    : 'I took their assessment this week.'

  const costPart = hoursLost && hoursLost > 0
    ? ` The part that stood out is that I lose about ${hoursBand(hoursLost)} a week to work AI could already be doing, which is roughly ${weeksAYear(hoursLost)} working weeks a year.`
    : ''

  return `Hi [Manager],

I would like to expense a subscription to AI Central. It is a library of step-by-step AI tutorials written in plain language, for people who are not engineers.

${assessment}${costPart}

It is $59.75 a year, about $4.98 a month. That includes 1,200+ tutorials and 50+ templates, with new ones added every week, and I can share what I learn with the team.

If it saves even one hour a month it pays for itself several times over. There is a 30-day money-back guarantee, so there is no real downside.

Happy to write up anything useful and pass it round.

Thanks,
[Your name]`
}

export default function ExpenseEmail({
  stageLabel,
  hoursLost,
  submissionId,
}: {
  stageLabel?: string | null
  hoursLost?: number | null
  submissionId?: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const subject = 'Expensing an AI Central subscription'
  const body = buildEmail(stageLabel ?? null, hoursLost ?? null)

  // Impression on 40% visible, deduped per session, matching every other
  // placement so the CTR table compares like with like.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            firePlacementView(PLACEMENT, submissionId)
            io.disconnect()
          }
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [submissionId])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) sendEvent('expense_email_open', { props: { placement: PLACEMENT }, submissionId })
  }

  async function copy() {
    const text = `Subject: ${subject}\n\n${body}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard API needs a secure context and a permission that some
      // in-app browsers refuse. Fall back rather than fail silently, because a
      // copy button that does nothing is worse than no copy button.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* nothing more to try */ }
      document.body.removeChild(ta)
    }
    setCopied(true)
    sendEvent('expense_email_copy', { props: { placement: PLACEMENT }, submissionId })
    setTimeout(() => setCopied(false), 2500)
  }

  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div ref={wrapRef} className="mt-4" style={{ border: `2px solid ${RICH}`, backgroundColor: PAPER }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full text-left"
        style={{ padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: RICH, lineHeight: 1.35 }}>
              Most people expense this
            </p>
            <p style={{ fontSize: 13.5, color: BODY, marginTop: 4, lineHeight: 1.45 }}>
              $59.75 a year sits inside almost every learning budget. Here is the email to send your manager, already written.
            </p>
          </div>
          <span
            aria-hidden
            style={{
              flexShrink: 0, fontSize: 20, fontWeight: 700, color: FULVOUS,
              transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 160ms',
            }}
          >
            +
          </span>
        </div>
      </button>

      {open && (
        <div style={{ padding: '0 18px 18px' }}>
          <div
            style={{
              border: `1px solid ${HAIRLINE}`, backgroundColor: '#FFFFFF',
              padding: '14px 16px', fontSize: 13.5, lineHeight: 1.55, color: BODY,
              whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto',
            }}
          >
            <div style={{ fontWeight: 700, color: RICH, marginBottom: 10 }}>Subject: {subject}</div>
            {body}
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={copy}
              style={{
                backgroundColor: RICH, color: '#FEF7E7', border: 'none',
                fontWeight: 600, fontSize: 14, padding: '11px 18px', cursor: 'pointer',
              }}
            >
              {copied ? 'Copied' : 'Copy the email'}
            </button>
            <a
              href={mailto}
              onClick={() => sendEvent('expense_email_copy', { props: { placement: PLACEMENT, via: 'mailto' }, submissionId })}
              style={{
                backgroundColor: '#FFFFFF', color: RICH, border: `2px solid ${RICH}`,
                fontWeight: 600, fontSize: 14, padding: '9px 18px', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              Open in my mail app
            </a>
          </div>

          <p style={{ fontSize: 12, color: MUTE, marginTop: 10, lineHeight: 1.45 }}>
            Start the trial first if you like. It is $4.99 for four weeks and the yearly charge only lands after that, so the approval has time to come back.
          </p>
        </div>
      )}
    </div>
  )
}
