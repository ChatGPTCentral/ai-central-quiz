// Admin notification email — fires when a new quiz submission lands.
//
// Sends via Resend's REST API (no SDK dep). Configuration:
//   RESEND_API_KEY        — required for actual send; missing key → log-only
//   ADMIN_NOTIFY_EMAIL    — destination; defaults to chatgptcentral@gmail.com
//   ADMIN_NOTIFY_FROM     — sender; defaults to onboarding@resend.dev (Resend's
//                           free shared domain, deliverable to verified addrs)
//
// Failure to send NEVER throws — the submission API uses fire-and-forget.
// Errors are logged so they're visible in Vercel runtime logs.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface SubmitNotification {
  id: string
  name: string
  email: string
  score: number
  archetype: string
  persona?: string | null
  stage?: string | null
  intent?: string | null
  friction?: string | null
  jobLevel?: string | null
  company?: string | null
  /** Public site URL — used to link to the admin row from the email body. */
  siteUrl?: string
}

export async function sendSubmitNotification(n: SubmitNotification): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ADMIN_NOTIFY_EMAIL || 'chatgptcentral@gmail.com'
  const from = process.env.ADMIN_NOTIFY_FROM || 'AI Central <onboarding@resend.dev>'

  const subject = `New submission · ${n.name || '(no name)'} · ${n.archetype} · ${n.score}`
  const adminLink = n.siteUrl
    ? `${n.siteUrl.replace(/\/$/, '')}/admin/submissions?id=${encodeURIComponent(n.id)}`
    : null

  const lines = [
    `${n.name || '(no name)'} <${n.email || '(no email)'}>`,
    '',
    `Score:     ${n.score}`,
    `Archetype: ${n.archetype}`,
    n.persona ? `Persona:   ${n.persona}` : null,
    n.stage ? `Stage:     ${n.stage}` : null,
    n.jobLevel ? `Role:      ${n.jobLevel}` : null,
    n.company ? `Company:   ${n.company}` : null,
    n.intent ? `Intent:    ${n.intent}` : null,
    n.friction ? `Friction:  ${n.friction}` : null,
    '',
    `Submission id: ${n.id}`,
    adminLink ? `View in admin: ${adminLink}` : null,
  ].filter(Boolean).join('\n')

  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not set; would send "${subject}" to ${to}`)
    return
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: lines,
        reply_to: n.email || undefined,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[email] resend send failed (${res.status}): ${detail.slice(0, 240)}`)
      return
    }
  } catch (err) {
    console.error('[email] resend send threw:', err)
  }
}
