// Admin notification email — fires when a new quiz submission lands.
//
// Sends via Resend's REST API. Renders both an HTML "intelligence
// briefing" (person, company, engagement, quiz) and a plaintext fallback.
//
// Configuration:
//   RESEND_API_KEY        — required for actual send; missing key → log-only
//   ADMIN_NOTIFY_EMAIL    — destination; defaults to chatgptcentral@gmail.com
//   ADMIN_NOTIFY_FROM     — sender; must be from a domain verified on your
//                           Resend account (e.g. AI Central <noreply@app.thecentral.ai>)

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Raw row shape from public.submissions (snake_case). Optional everywhere
 *  because new submissions land before enrichment may have populated. */
export interface SubmissionRow {
  id: string
  name?: string | null
  email?: string | null
  score?: number | null
  archetype?: string | null
  persona?: string | null
  stage?: string | null
  intent_30d?: string | null
  friction?: string | null
  ai_tools?: string | null
  work_area?: string | null
  job_level?: string | null
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

export async function sendSubmitNotification(row: SubmissionRow, siteUrl?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ADMIN_NOTIFY_EMAIL || 'chatgptcentral@gmail.com'
  const from = process.env.ADMIN_NOTIFY_FROM || 'AI Central <onboarding@resend.dev>'

  const subjectName = row.name || '(no name)'
  const company = row.company_name ? ` · ${row.company_name}` : ''
  const subject = `New submission · ${subjectName}${company} · score ${row.score ?? '?'} · ${row.persona ?? 'no persona'}`
  const adminLink = siteUrl
    ? `${siteUrl.replace(/\/$/, '')}/admin/submissions?id=${encodeURIComponent(row.id)}`
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

function fmtList(s: string | null | undefined, max = 5): string {
  if (!s) return ''
  const parts = s.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length <= max) return parts.join(', ')
  return parts.slice(0, max).join(', ') + ` · +${parts.length - max} more`
}

function fmtMoney(n: number | null | undefined): string {
  if (!n) return ''
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.map(p => p[0]?.toUpperCase() || '').join('').slice(0, 2) || '?'
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
  const subjectName = fullName
  const personLocation = [r.city, r.region, r.country].filter(present).join(', ')
  const enrichmentBadge = r.enrichment_status === 'enriched'
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#E8F5E9;color:#2E7D32;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-left:8px;">enriched</span>`
    : r.enrichment_status === 'not_attempted'
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#FFF3E0;color:#E65100;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-left:8px;">personal email · not enriched</span>`
    : ''

  // Hero — score gauge + persona/stage chips
  const heroChips: string[] = []
  if (r.persona) heroChips.push(`<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#F3E5F5;color:#6A1B9A;font-size:11px;font-weight:700;">${escape(r.persona)}</span>`)
  if (r.stage) heroChips.push(`<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#E3F2FD;color:#1565C0;font-size:11px;font-weight:700;">${escape(r.stage)}</span>`)
  if (r.archetype) heroChips.push(`<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#FFF8E1;color:#F57F17;font-size:11px;font-weight:700;">${escape(r.archetype)}</span>`)

  const personPhoto = r.photo_url
    ? `<img src="${escape(r.photo_url)}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%;object-fit:cover;border:1px solid #E8E4DF;">`
    : `<div style="width:56px;height:56px;border-radius:50%;background:#E48715;color:white;font-size:22px;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;line-height:56px;">${escape(initials(fullName))}</div>`

  // Person rows
  const personRows: string[] = []
  personRows.push(row('Email', r.email ? link(`mailto:${r.email}`, r.email) : '—'))
  if (present(r.job_title)) personRows.push(row('Title', escape(r.job_title!)))
  if (present(r.seniority)) personRows.push(row('Seniority', escape(r.seniority!)))
  if (present(r.job_function)) personRows.push(row('Function', escape(r.job_function!)))
  if (present(r.department)) personRows.push(row('Department', escape(r.department!)))
  if (present(r.job_level)) personRows.push(row('Job level (self)', escape(r.job_level!)))
  if (personLocation) personRows.push(row('Location', escape(personLocation)))
  if (present(r.linkedin_url)) personRows.push(row('LinkedIn', link(r.linkedin_url!, r.linkedin_url!.replace(/^https?:\/\//, '').replace(/\/$/, ''))))

  // Company rows
  const companyRows: string[] = []
  if (present(r.company_name)) {
    const companyDisplay = r.company_website
      ? link(r.company_website, r.company_name!)
      : r.company_domain
      ? link(`https://${r.company_domain}`, r.company_name!)
      : escape(r.company_name!)
    companyRows.push(row('Name', companyDisplay))
  }
  if (present(r.company_industry)) {
    const ind = [r.company_industry, r.company_sub_industry].filter(present).join(' · ')
    companyRows.push(row('Industry', escape(ind)))
  }
  if (present(r.company_size)) companyRows.push(row('Size', escape(r.company_size!)))
  if (present(r.company_revenue)) companyRows.push(row('Revenue', escape(r.company_revenue!)))
  if (present(r.company_funding)) companyRows.push(row('Funding', escape(r.company_funding!)))
  if (present(r.company_founded_year)) companyRows.push(row('Founded', escape(String(r.company_founded_year))))
  if (present(r.company_linkedin_url)) companyRows.push(row('LinkedIn', link(r.company_linkedin_url!, r.company_linkedin_url!.replace(/^https?:\/\//, '').replace(/\/$/, ''))))

  // Engagement rows
  const engagementRows: string[] = []
  if (present(r.beehiiv_status)) engagementRows.push(row('Beehiiv', escape(r.beehiiv_status!)))
  if (present(r.subscription_tier)) engagementRows.push(row('Tier', escape(r.subscription_tier!)))
  if (present(r.stripe_customer_id)) {
    const ltv = present(r.lifetime_value_usd) ? ` · LTV ${fmtMoney(r.lifetime_value_usd!)}` : ''
    engagementRows.push(row('Stripe', `<code style="font-family:ui-monospace,monospace;font-size:12px;color:#9C9C9C;">${escape(r.stripe_customer_id!)}</code>${ltv}`))
  }
  if (present(r.utm_source) || present(r.utm_ref)) {
    const utm = [r.utm_source, r.utm_ref].filter(present).join(' · ')
    engagementRows.push(row('Attribution', escape(utm)))
  }

  // Quiz signals
  const quizRows: string[] = []
  if (present(r.score)) {
    quizRows.push(row('Score', `<strong style="color:#E48715;font-size:18px;">${r.score}</strong> <span style="color:#9C9C9C;font-size:12px;">/ 100</span>`))
  }
  if (present(r.intent_30d)) quizRows.push(row('Intent (30d)', escape(r.intent_30d!)))
  if (present(r.friction)) quizRows.push(row('Friction', escape(r.friction!)))
  if (present(r.work_area)) quizRows.push(row('Work area', escape(fmtList(r.work_area!))))
  if (present(r.ai_tools)) quizRows.push(row('Tools in rotation', escape(fmtList(r.ai_tools!, 8))))

  // CTAs
  const ctas: string[] = []
  if (adminLink) ctas.push(`<a href="${escape(adminLink)}" style="display:inline-block;padding:10px 18px;background:#333333;color:#FFFDFA;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;margin-right:8px;">View in admin →</a>`)
  if (r.linkedin_url) ctas.push(`<a href="${escape(r.linkedin_url)}" style="display:inline-block;padding:10px 18px;background:#0A66C2;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;margin-right:8px;">Open LinkedIn →</a>`)
  if (r.company_website) ctas.push(`<a href="${escape(r.company_website)}" style="display:inline-block;padding:10px 18px;background:transparent;color:#333333;text-decoration:none;border:1px solid #E8E4DF;border-radius:8px;font-size:13px;font-weight:700;">Open company site →</a>`)

  // Headline under hero photo
  const headlineParts: string[] = []
  if (r.job_title) headlineParts.push(escape(r.job_title))
  if (r.company_name) headlineParts.push(escape(r.company_name))
  const headline = headlineParts.join(' — ')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escape(subjectName)}</title>
</head>
<body style="margin:0;padding:0;background:#F5F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F5F1EA;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#FFFDFA;border:1px solid #E8E4DF;border-radius:14px;overflow:hidden;">
          <!-- HEADER -->
          <tr>
            <td style="padding:20px 24px 8px;border-bottom:1px solid #E48715;">
              <div style="font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#E48715;">AI Central · New submission</div>
            </td>
          </tr>

          <!-- HERO -->
          <tr>
            <td style="padding:24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align:top;width:64px;padding-right:16px;">${personPhoto}</td>
                  <td style="vertical-align:top;">
                    <div style="font-size:22px;font-weight:800;color:#333333;line-height:1.2;">${escape(fullName)}${enrichmentBadge}</div>
                    ${headline ? `<div style="margin-top:4px;color:#333333;font-size:14px;">${headline}</div>` : ''}
                    ${personLocation ? `<div style="margin-top:2px;color:#9C9C9C;font-size:13px;">${escape(personLocation)}</div>` : ''}
                  </td>
                </tr>
              </table>
              ${heroChips.length > 0 ? `<div style="margin-top:14px;">${heroChips.join(' ')}</div>` : ''}
            </td>
          </tr>

          <!-- BODY TABLE -->
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${sectionHeader('Person')}
                ${personRows.join('')}

                ${companyRows.length > 0 ? sectionHeader('Company') + companyRows.join('') : ''}
                ${engagementRows.length > 0 ? sectionHeader('Engagement') + engagementRows.join('') : ''}
                ${quizRows.length > 0 ? sectionHeader('Quiz signals') + quizRows.join('') : ''}
              </table>

              ${ctas.length > 0 ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid #E8E4DF;">${ctas.join('')}</div>` : ''}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:14px 24px;background:#FAF7F1;color:#9C9C9C;font-size:11px;border-top:1px solid #E8E4DF;">
              Submission id <code style="font-family:ui-monospace,monospace;color:#9C9C9C;">${escape(r.id)}</code>
              · <a href="${escape(adminLink || '#')}" style="color:#9C9C9C;text-decoration:underline;">open in admin</a>
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
  if (r.job_title || r.company_name) lines.push([r.job_title, r.company_name].filter(present).join(' — '))
  const loc = [r.city, r.region, r.country].filter(present).join(', ')
  if (loc) lines.push(loc)
  lines.push('')
  if (present(r.score)) lines.push(`Score:      ${r.score}/100`)
  if (r.archetype) lines.push(`Archetype:  ${r.archetype}`)
  if (r.persona) lines.push(`Persona:    ${r.persona}`)
  if (r.stage) lines.push(`Stage:      ${r.stage}`)
  if (r.intent_30d) lines.push(`Intent:     ${r.intent_30d}`)
  if (r.friction) lines.push(`Friction:   ${r.friction}`)
  if (r.ai_tools) lines.push(`Tools:      ${fmtList(r.ai_tools, 8)}`)
  if (r.linkedin_url) { lines.push(''); lines.push(`LinkedIn:   ${r.linkedin_url}`) }
  if (r.company_website) lines.push(`Company:    ${r.company_website}`)
  if (r.beehiiv_status) lines.push(`Beehiiv:    ${r.beehiiv_status}`)
  if (r.stripe_customer_id) lines.push(`Stripe:     ${r.stripe_customer_id}${r.lifetime_value_usd ? ` (LTV ${fmtMoney(r.lifetime_value_usd)})` : ''}`)
  lines.push('')
  lines.push(`Submission id: ${r.id}`)
  if (adminLink) lines.push(`Admin: ${adminLink}`)
  return lines.join('\n')
}
