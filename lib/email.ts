// Admin notification email — fires when a new quiz submission lands.
//
// Sends via Resend's REST API. Layout (per user spec):
//   1. Overview of the person, composed from the enriched sources
//      (Apollo/waterfall: title, company, industry, size, location).
//   2. LinkedIn profile + "Edit in admin" links.
//   3. The quiz answers in the exact order they were submitted
//      (name, email, frequency, tools, depth, momentum, friction,
//      work area, job level, 30-day intent), then the derived results.
//   4. Compact enrichment/engagement details + footer.
// No person photo. No em dashes in copy.
//
// Subject: "New Lead from {UTM}: {Name} - {Country} - {Title} at {Company} - {AI Type}"
// with missing segments omitted gracefully.
//
// Configuration:
//   RESEND_API_KEY        — required for actual send; missing key → log-only
//   ADMIN_NOTIFY_EMAIL    — destination; defaults to chatgptcentral@gmail.com
//   ADMIN_NOTIFY_FROM     — sender; must be from a domain verified on your
//                           Resend account (e.g. AI Central <noreply@app.thecentral.ai>)

import { stageDef } from './segmentation-v2'
import { personaDef } from './segmentation-v2'
import { answerDisplay, answerDisplayList, formatDisplay } from './answer-labels'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Raw row shape from public.submissions (snake_case). Optional everywhere
 *  because new submissions land before enrichment may have populated. */
export interface SubmissionRow {
  id: string
  name?: string | null
  email?: string | null
  score?: number | null
  persona?: string | null
  stage?: string | null
  intent_30d?: string | null
  friction?: string | null
  ai_tools?: string | null
  work_area?: string | null
  job_level?: string | null
  frequency_score?: number | null
  momentum?: number | null
  depth_score?: number | null
  breadth_score?: number | null
  // Apollo / waterfall enrichment
  linkedin_url?: string | null
  photo_url?: string | null
  job_title?: string | null
  seniority?: string | null
  job_function?: string | null
  department?: string | null
  company_name?: string | null
  company_domain?: string | null
  company_website?: string | null
  company_linkedin_url?: string | null
  company_size?: string | null
  company_industry?: string | null
  company_sub_industry?: string | null
  company_revenue?: string | null
  company_funding?: string | null
  company_founded_year?: number | null
  country?: string | null
  region?: string | null
  city?: string | null
  enrichment_status?: string | null
  enriched_at?: string | null
  // Beehiiv
  beehiiv_status?: string | null
  subscription_tier?: string | null
  // Stripe
  stripe_customer_id?: string | null
  lifetime_value_usd?: number | null
  stripe_first_charge_at?: string | null
  // Attribution
  utm_source?: string | null
  utm_ref?: string | null
}

/** "New Lead from {UTM}: {Name} - {Country} - {Title} at {Company} - {AI Type}",
 *  omitting whatever is missing. */
export function buildLeadSubject(r: SubmissionRow): string {
  const utm = (r.utm_source || '').trim()
  const prefix = utm ? `New Lead from ${utm}: ` : 'New Lead: '

  const parts: string[] = []
  parts.push(r.name?.trim() || r.email || '(no name)')
  if (r.country?.trim()) parts.push(r.country.trim())

  const title = r.job_title?.trim()
  const company = r.company_name?.trim()
  if (title && company) parts.push(`${title} at ${company}`)
  else if (title) parts.push(title)
  else if (company) parts.push(company)

  const sd = r.stage ? stageDef(r.stage) : null
  if (sd && sd.key !== 'unknown') parts.push(sd.label)

  return prefix + parts.join(' - ')
}

export async function sendSubmitNotification(row: SubmissionRow, siteUrl?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ADMIN_NOTIFY_EMAIL || 'chatgptcentral@gmail.com'
  const from = process.env.ADMIN_NOTIFY_FROM || 'AI Central <onboarding@resend.dev>'

  const subject = buildLeadSubject(row)
  const adminLink = siteUrl
    ? `${siteUrl.replace(/\/$/, '')}/admin/submissions/${encodeURIComponent(row.id)}`
    : null

  const html = renderHtml(row, adminLink)
  const text = renderText(row, adminLink)

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
        html,
        text,
        reply_to: row.email || undefined,
      }),
    })
    const body = await res.text().catch(() => '')
    if (!res.ok) {
      console.error(`[email] resend send failed status=${res.status}`)
      for (let i = 0, n = 0; i < body.length; i += 200, n++) {
        console.error(`[email] resend body chunk ${n}: ${body.slice(i, i + 200)}`)
      }
      return
    }
    console.log(`[email] sent "${subject}" to ${to} — resend response: ${body.slice(0, 120)}`)
  } catch (err) {
    console.error('[email] resend send threw:', err)
  }
}

// ── Render helpers ────────────────────────────────────────────────────

function escape(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function present(s: string | number | null | undefined): boolean {
  return s !== null && s !== undefined && String(s).trim() !== ''
}

function fmtMoney(n: number | null | undefined): string {
  if (!n) return ''
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

/**
 * Compose the person overview from the enriched sources, as readable prose.
 * Only claims what the enrichment actually returned; degrades to a short
 * "quiz answers only" line for personal emails.
 */
export function buildOverview(r: SubmissionRow): string {
  const name = r.name?.trim() || 'This lead'
  const location = [r.city, r.region, r.country].filter(present).join(', ')
  const sentences: string[] = []

  if (r.enrichment_status === 'enriched') {
    const roleBits: string[] = []
    if (present(r.job_title)) roleBits.push(`works as ${r.job_title!.trim()}`)
    if (present(r.company_name)) {
      const companyDesc: string[] = []
      if (present(r.company_industry)) companyDesc.push(r.company_industry!.trim().toLowerCase())
      if (present(r.company_size)) companyDesc.push(`${r.company_size!.trim()} people`)
      roleBits.push(`at ${r.company_name!.trim()}${companyDesc.length ? ` (${companyDesc.join(', ')})` : ''}`)
    }
    if (roleBits.length) sentences.push(`${name} ${roleBits.join(' ')}.`)
    else sentences.push(`${name} came through with a verified work email.`)

    const extra: string[] = []
    if (present(r.seniority)) extra.push(`${r.seniority!.trim()} seniority`)
    if (present(r.job_function)) extra.push(`${r.job_function!.trim()} function`)
    if (present(r.department)) extra.push(`${r.department!.trim()} department`)
    if (location) extra.push(`based in ${location}`)
    if (extra.length) sentences.push(`Profile: ${extra.join(', ')}.`)

    const companyFacts: string[] = []
    if (present(r.company_revenue)) companyFacts.push(`revenue ${r.company_revenue!.trim()}`)
    if (present(r.company_funding)) companyFacts.push(`funding ${r.company_funding!.trim()}`)
    if (present(r.company_founded_year)) companyFacts.push(`founded ${r.company_founded_year}`)
    if (companyFacts.length) sentences.push(`Company signals: ${companyFacts.join(', ')}.`)
  } else if (r.enrichment_status === 'not_attempted') {
    sentences.push(`${name} signed up with a personal email, so there is no company enrichment. The quiz answers below are the full picture.`)
  } else {
    sentences.push(`${name} could not be enriched from external sources. The quiz answers below are the full picture.`)
  }

  // One line tying the enrichment to the quiz result.
  const sd = r.stage ? stageDef(r.stage) : null
  const pd = r.persona ? personaDef(r.persona) : null
  const readiness: string[] = []
  if (sd && sd.key !== 'unknown') readiness.push(`lands on the ${sd.label} rung`)
  if (present(r.score)) readiness.push(`scores ${r.score}/100`)
  if (pd && pd.key !== 'unknown') readiness.push(`reads as a ${pd.label}`)
  if (readiness.length) sentences.push(`On the quiz, ${name.split(' ')[0]} ${readiness.join(', ')}.`)

  return sentences.join(' ')
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#9C9C9C;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;vertical-align:top;width:1%;">${escape(label)}</td>
    <td style="padding:6px 0;color:#333333;font-size:14px;line-height:1.5;">${value}</td>
  </tr>`
}

function link(href: string, text: string): string {
  return `<a href="${escape(href)}" style="color:#046BB1;text-decoration:none;border-bottom:1px solid #046BB1;">${escape(text)}</a>`
}

function sectionHeader(title: string): string {
  return `<tr><td colspan="2" style="padding:18px 0 8px;border-top:1px solid #E8E4DF;color:#9C9C9C;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;">${escape(title)}</td></tr>`
}

function renderHtml(r: SubmissionRow, adminLink: string | null): string {
  const fullName = r.name || '(no name)'
  const sd = r.stage ? stageDef(r.stage) : null
  const overview = buildOverview(r)

  // Small enrichment chip inside the overview block (replaces the old strip).
  const enrichChip = r.enrichment_status === 'enriched'
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#E8F5E9;color:#2E7D32;font-size:11px;font-weight:700;">Apollo enriched</span>`
    : r.enrichment_status === 'not_attempted'
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#FFF3E0;color:#E65100;font-size:11px;font-weight:700;">Personal email, not enriched</span>`
    : `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#F5F5F5;color:#9C9C9C;font-size:11px;font-weight:700;">Enrichment unavailable</span>`

  const stageChip = sd && sd.key !== 'unknown'
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${sd.color}22;color:${sd.color};font-size:11px;font-weight:800;">${escape(sd.label)}</span>`
    : ''

  // ── 2. Links: LinkedIn + admin edit + company site ──
  const ctas: string[] = []
  if (r.linkedin_url) ctas.push(`<a href="${escape(r.linkedin_url)}" style="display:inline-block;padding:10px 18px;background:#0A66C2;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;margin:0 8px 8px 0;">View LinkedIn profile</a>`)
  if (adminLink) ctas.push(`<a href="${escape(adminLink)}" style="display:inline-block;padding:10px 18px;background:#333333;color:#FFFDFA;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;margin:0 8px 8px 0;">Edit record in admin</a>`)
  if (r.company_website) ctas.push(`<a href="${escape(r.company_website)}" style="display:inline-block;padding:10px 18px;background:transparent;color:#333333;text-decoration:none;border:1px solid #E8E4DF;border-radius:8px;font-size:13px;font-weight:700;margin:0 8px 8px 0;">Company site</a>`)

  // ── 3. Quiz answers, in the order they were submitted ──
  const quizRows: string[] = []
  quizRows.push(row('Name', escape(fullName)))
  quizRows.push(row('Email', r.email ? link(`mailto:${r.email}`, r.email) : '-'))
  if (present(r.frequency_score)) quizRows.push(row('Frequency', escape(formatDisplay(answerDisplay('frequency', r.frequency_score!)))))
  if (present(r.ai_tools)) {
    const list = answerDisplayList('aiTools', r.ai_tools!).map(formatDisplay)
    quizRows.push(row('AI tools', escape(list.slice(0, 8).join(', ') + (list.length > 8 ? ` · +${list.length - 8}` : ''))))
  }
  if (present(r.depth_score)) quizRows.push(row('Depth', `${r.depth_score} of 6 actions`))
  if (present(r.momentum)) quizRows.push(row('Momentum', escape(formatDisplay(answerDisplay('momentum', r.momentum!)))))
  if (present(r.friction)) quizRows.push(row('Friction', escape(formatDisplay(answerDisplay('friction', r.friction!)))))
  if (present(r.work_area)) {
    const list = answerDisplayList('workArea', r.work_area!).map(formatDisplay)
    quizRows.push(row('Work area', escape(list.slice(0, 6).join(', ') + (list.length > 6 ? ` · +${list.length - 6}` : ''))))
  }
  if (present(r.job_level)) quizRows.push(row('Job level', escape(r.job_level!)))
  if (present(r.intent_30d)) quizRows.push(row('Intent (30d)', escape(formatDisplay(answerDisplay('intent_30d', r.intent_30d!)))))

  // Derived results
  const resultRows: string[] = []
  if (present(r.score)) resultRows.push(row('Score', `<strong style="color:#E48715;font-size:18px;">${r.score}</strong> <span style="color:#9C9C9C;font-size:12px;">/ 100</span>`))
  if (sd && sd.key !== 'unknown') resultRows.push(row('AI type', escape(sd.label)))
  const pd = r.persona ? personaDef(r.persona) : null
  if (pd && pd.key !== 'unknown') resultRows.push(row('Persona', escape(pd.label)))

  // ── 4. Enrichment details ──
  const personLocation = [r.city, r.region, r.country].filter(present).join(', ')
  const enrichRows: string[] = []
  if (present(r.job_title)) enrichRows.push(row('Title', escape(r.job_title!)))
  if (present(r.seniority)) enrichRows.push(row('Seniority', escape(r.seniority!)))
  if (present(r.job_function)) enrichRows.push(row('Function', escape(r.job_function!)))
  if (present(r.department)) enrichRows.push(row('Department', escape(r.department!)))
  if (personLocation) enrichRows.push(row('Location', escape(personLocation)))
  if (present(r.linkedin_url)) enrichRows.push(row('LinkedIn', link(r.linkedin_url!, r.linkedin_url!.replace(/^https?:\/\//, '').replace(/\/$/, ''))))
  if (present(r.company_name)) {
    const companyDisplay = r.company_website
      ? link(r.company_website, r.company_name!)
      : r.company_domain
      ? link(`https://${r.company_domain}`, r.company_name!)
      : escape(r.company_name!)
    enrichRows.push(row('Company', companyDisplay))
  }
  if (present(r.company_industry)) {
    const ind = [r.company_industry, r.company_sub_industry].filter(present).join(' · ')
    enrichRows.push(row('Industry', escape(ind)))
  }
  if (present(r.company_size)) enrichRows.push(row('Size', escape(r.company_size!)))
  if (present(r.company_revenue)) enrichRows.push(row('Revenue', escape(r.company_revenue!)))
  if (present(r.company_funding)) enrichRows.push(row('Funding', escape(r.company_funding!)))
  if (present(r.company_founded_year)) enrichRows.push(row('Founded', escape(String(r.company_founded_year))))
  if (present(r.company_linkedin_url)) enrichRows.push(row('Company LinkedIn', link(r.company_linkedin_url!, r.company_linkedin_url!.replace(/^https?:\/\//, '').replace(/\/$/, ''))))

  // Engagement / attribution
  const engagementRows: string[] = []
  if (present(r.utm_source) || present(r.utm_ref)) {
    const utm = [r.utm_source, r.utm_ref].filter(present).join(' · ')
    engagementRows.push(row('Attribution', escape(utm)))
  }
  if (present(r.beehiiv_status)) engagementRows.push(row('Beehiiv', escape(r.beehiiv_status!)))
  if (present(r.subscription_tier)) engagementRows.push(row('Tier', escape(r.subscription_tier!)))
  if (present(r.stripe_customer_id)) {
    const ltv = present(r.lifetime_value_usd) ? ` · LTV ${fmtMoney(r.lifetime_value_usd!)}` : ''
    engagementRows.push(row('Stripe', `<code style="font-family:ui-monospace,monospace;font-size:12px;color:#9C9C9C;">${escape(r.stripe_customer_id!)}</code>${ltv}`))
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escape(fullName)}</title>
</head>
<body style="margin:0;padding:0;background:#F5F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F5F1EA;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#FFFDFA;border:1px solid #E8E4DF;border-radius:14px;overflow:hidden;">
          <!-- HEADER -->
          <tr>
            <td style="padding:20px 24px 8px;border-bottom:1px solid #E48715;">
              <div style="font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#E48715;">AI Central · New lead</div>
            </td>
          </tr>

          <!-- 1 · OVERVIEW -->
          <tr>
            <td style="padding:24px 24px 8px;">
              <div style="font-size:22px;font-weight:800;color:#333333;line-height:1.2;">${escape(fullName)}</div>
              <div style="margin-top:10px;">${stageChip} ${enrichChip}</div>
              <p style="margin:14px 0 0;color:#333333;font-size:14px;line-height:1.6;">${escape(overview)}</p>
            </td>
          </tr>

          <!-- 2 · LINKS -->
          ${ctas.length > 0 ? `<tr><td style="padding:16px 24px 8px;">${ctas.join('')}</td></tr>` : ''}

          <!-- 3 · QUIZ ANSWERS (submission order) + RESULTS, 4 · ENRICHMENT -->
          <tr>
            <td style="padding:8px 24px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${sectionHeader('Quiz answers (in order)')}
                ${quizRows.join('')}
                ${resultRows.length > 0 ? sectionHeader('Quiz result') + resultRows.join('') : ''}
                ${enrichRows.length > 0 ? sectionHeader('Enriched details') + enrichRows.join('') : ''}
                ${engagementRows.length > 0 ? sectionHeader('Attribution and engagement') + engagementRows.join('') : ''}
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:14px 24px;background:#FAF7F1;color:#9C9C9C;font-size:11px;border-top:1px solid #E8E4DF;">
              Submission id <code style="font-family:ui-monospace,monospace;color:#9C9C9C;">${escape(r.id)}</code>
              ${adminLink ? `· <a href="${escape(adminLink)}" style="color:#9C9C9C;text-decoration:underline;">edit in admin</a>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderText(r: SubmissionRow, adminLink: string | null): string {
  const lines: string[] = []
  lines.push(`${r.name || '(no name)'} <${r.email || ''}>`)
  lines.push('')
  lines.push(buildOverview(r))
  lines.push('')
  if (r.linkedin_url) lines.push(`LinkedIn:   ${r.linkedin_url}`)
  if (adminLink) lines.push(`Admin edit: ${adminLink}`)
  if (r.company_website) lines.push(`Company:    ${r.company_website}`)
  lines.push('')
  lines.push('Quiz answers (in order):')
  lines.push(`  Name:       ${r.name || '-'}`)
  lines.push(`  Email:      ${r.email || '-'}`)
  if (present(r.frequency_score)) lines.push(`  Frequency:  ${formatDisplay(answerDisplay('frequency', r.frequency_score!))}`)
  if (r.ai_tools) lines.push(`  AI tools:   ${answerDisplayList('aiTools', r.ai_tools).map(formatDisplay).slice(0, 8).join(', ')}`)
  if (present(r.depth_score)) lines.push(`  Depth:      ${r.depth_score} of 6 actions`)
  if (present(r.momentum)) lines.push(`  Momentum:   ${formatDisplay(answerDisplay('momentum', r.momentum!))}`)
  if (r.friction) lines.push(`  Friction:   ${formatDisplay(answerDisplay('friction', r.friction))}`)
  if (r.work_area) lines.push(`  Work area:  ${answerDisplayList('workArea', r.work_area).map(formatDisplay).slice(0, 6).join(', ')}`)
  if (r.job_level) lines.push(`  Job level:  ${r.job_level}`)
  if (r.intent_30d) lines.push(`  Intent:     ${formatDisplay(answerDisplay('intent_30d', r.intent_30d))}`)
  lines.push('')
  if (present(r.score)) lines.push(`Score: ${r.score}/100`)
  if (r.stage) { const sd = stageDef(r.stage); if (sd && sd.key !== 'unknown') lines.push(`AI type: ${sd.label}`) }
  if (r.persona) { const pd = personaDef(r.persona); if (pd && pd.key !== 'unknown') lines.push(`Persona: ${pd.label}`) }
  if (r.beehiiv_status) lines.push(`Beehiiv: ${r.beehiiv_status}`)
  if (r.stripe_customer_id) lines.push(`Stripe: ${r.stripe_customer_id}${r.lifetime_value_usd ? ` (LTV ${fmtMoney(r.lifetime_value_usd)})` : ''}`)
  lines.push('')
  lines.push(`Submission id: ${r.id}`)
  return lines.join('\n')
}
