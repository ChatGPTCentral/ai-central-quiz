import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSubmission } from '@/lib/kv'
import { personResultPath } from '@/lib/result-url'
import { findReferrers } from '@/lib/referrer'
import { lastResultView } from '@/lib/result-view'
import { continentOf, showState } from '@/lib/geo'
import { countryFlag, isoToFlag } from '@/lib/country-flags'
import { stageDef, personaDef, STAGES } from '@/lib/segmentation-v2'
import DeleteButton from './DeleteButton.client'
import InlineField from './InlineField.client'
import EnrichHeaderButton from './EnrichHeaderButton.client'
import LinkedInReplacer from './LinkedInReplacer.client'
import PhotoEditor from './PhotoEditor.client'
import RawDataSection from './RawDataSection'
import DossierTabs from './DossierTabs.client'

export const dynamic = 'force-dynamic'

// ── Person record · dossier/passport (owner feedback round 2) ────────
// Left rail = identity zone: big stamp-frame portrait, acquisition chips,
// name + contact, verification status, and exactly three controls under the
// face (Clarity · Results · Score). Main pane = REAL tabs (DossierTabs
// client shell) — this server page composes each pane's JSX and passes it
// in, so every editable field keeps its InlineField / PhotoEditor /
// LinkedInReplacer / RawDataSection / DeleteButton component.

export default async function SubmissionDetailPage({ params }: { params: { id: string } }) {
  let item: Awaited<ReturnType<typeof getSubmission>> = null
  try { item = await getSubmission(params.id) } catch { item = null }
  if (!item) notFound()

  const continent = continentOf(item.country)
  const hasState = showState(item.country)

  // Viral loop: for a pass_share lead, resolve who shared the pass that
  // brought them in (utm_ref = the sharer's ref).
  const referrers = item.utmSource === 'pass_share' ? await findReferrers(item.utmRef) : []
  // Which result page this person actually saw (+ a way to find their recording).
  const pageSeen = await lastResultView(item.id)

  const companyLinkedinUrl =
    item.companyLinkedinUrl ||
    (item.enrichment as Record<string, unknown> | undefined)?.companyLinkedinUrl as string | undefined ||
    (item.enrichmentRaw as Record<string, Record<string, unknown> | undefined> | undefined)?.apollo_legacy?.['Company Linkedin Url'] as string | undefined

  // v2 quiz fields always show; the fillout-era v1 fields (AI familiarity,
  // Learning style, Time commitment, Main goal) only render when a legacy
  // record actually carries a value — the current quiz never writes them.
  const surveyFields: { label: string; value?: string; legacy?: boolean }[] = [
    { label: 'AI familiarity', value: item.aiLevel, legacy: true },
    { label: 'Work area', value: item.workArea },
    { label: 'Learning style', value: item.learningStyle, legacy: true },
    { label: 'Time commitment', value: item.timeCommitment, legacy: true },
    { label: 'Main goal', value: item.mainGoal, legacy: true },
    { label: 'AI tools used', value: item.aiTools },
    { label: 'Job level', value: item.jobLevel },
  ].filter(f => !f.legacy || (f.value && f.value.trim() !== ''))

  // Where the person actually was when they took the quiz (Vercel edge geo),
  // distinct from the enriched company/role location.
  const submittedFrom = [item.ipCity, item.ipRegion, item.ipCountry].filter(Boolean).join(', ')
  // Identity-zone location line: prefer the IP capture, fall back to enrichment.
  const enrichedLoc = [item.city, item.country].filter(Boolean).join(', ')
  const locText = submittedFrom || enrichedLoc
  const locFlag = submittedFrom ? isoToFlag(item.ipCountry) : countryFlag(item.country)

  const stage = stageDef(item.stage)
  const persona = personaDef(item.persona)
  const paid = typeof item.lifetimeValueUsd === 'number' && item.lifetimeValueUsd > 0
  const stripeIds = item.stripeCustomerIds?.length ? item.stripeCustomerIds : (item.stripeCustomerId ? [item.stripeCustomerId] : [])
  const missing = ([
    ['photo', item.photoUrl], ['linkedin', item.linkedinUrl], ['company', item.companyName],
    ['country', item.country], ['title', item.jobTitle], ['region', item.region],
  ] as [string, unknown][]).filter(([, v]) => !v).map(([k]) => k)
  const filled = 6 - missing.length

  const hasV2Signals = item.frequencyScore != null || item.depthScore != null || item.breadthScore != null || item.momentum != null || !!item.friction || !!item.intent30d

  const chip = (def: { key: string; label: string; emoji: string; color: string } | undefined, reason?: string) =>
    def && def.key !== 'unknown' ? (
      <span className="inline-flex items-center" style={{ gap: 7, border: `1px solid ${def.color}`, color: def.color, padding: '3px 9px', fontSize: 11.5, fontWeight: 700 }} title={reason || def.label}>
        <span style={{ width: 8, height: 8, background: def.color }} />
        {def.emoji} {def.label}
      </span>
    ) : null

  const dent = (label: string, value: React.ReactNode, color: string, last = false) => (
    <div style={{ padding: '6px 14px', borderRight: last ? 'none' : '1px solid #E8E2D4' }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9C9C9C' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )

  const shortId = item.id.slice(0, 4).toUpperCase()
  const fmtDate = (d: string | number) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // ── Tab panes (server-rendered, handed to the client tab shell) ─────

  const overviewPane = (
    <>
      <ProfileSection title="Socio-demographic">
        <FieldRow label="Age">
          {item.ageBracket ? (
            <InlineField rowId={item.id} field="ageBracket" value={item.ageBracket} placeholder="age bracket" />
          ) : item.ageAiEstimate ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-[#333333]">{item.ageAiEstimate}
              <span title={`AI-estimated · confidence ${item.aiEstimateConfidence || 'unknown'}`} className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FEF7E7] text-[#E48715]">✨ AI</span>
            </span>
          ) : (
            <InlineField rowId={item.id} field="ageBracket" value="" placeholder="age bracket" />
          )}
        </FieldRow>
        <FieldRow label="Sex">
          {item.sexAiEstimate ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-[#333333]">{item.sexAiEstimate.charAt(0).toUpperCase() + item.sexAiEstimate.slice(1).toLowerCase()}
              <span title={`AI-estimated · confidence ${item.aiEstimateConfidence || 'unknown'}`} className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FEF7E7] text-[#E48715]">✨ AI</span>
            </span>
          ) : <span className="text-sm text-[#E8E4DF]">— (run ✨ Enrich to estimate from photo)</span>}
        </FieldRow>
        <FieldRow label="City"><InlineField rowId={item.id} field="city" value={item.city || ''} placeholder="city" /></FieldRow>
        <FieldRow label="Country">
          <span className="flex items-center gap-2">
            {item.country && <span className="text-base leading-none">{countryFlag(item.country)}</span>}
            <InlineField rowId={item.id} field="country" value={item.country || ''} placeholder="country" />
          </span>
        </FieldRow>
        {hasState && <FieldRow label="State / Province"><InlineField rowId={item.id} field="region" value={item.region || ''} placeholder="state" /></FieldRow>}
        <FieldRow label="Continent"><span className="text-sm text-[#333333]">{continent}</span></FieldRow>
        {submittedFrom && (
          <FieldRow label="Submitted from">
            <span className="inline-flex items-center gap-1.5 text-sm text-[#333333]">
              {item.ipCountry && <span className="text-base leading-none">{isoToFlag(item.ipCountry)}</span>}
              {submittedFrom}
              <span title="Visitor's actual location at submit time (IP geolocation), unlike the fields above which enrichment fills with company / role location" className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-[#EAF3FA] text-[#046BB1]">IP</span>
            </span>
          </FieldRow>
        )}
      </ProfileSection>

      <ProfileSection title="Workographic">
        <FieldRow label="Headline"><InlineField rowId={item.id} field="jobTitle" value={item.jobTitle || ''} placeholder="LinkedIn headline / raw job title" /></FieldRow>
        <FieldRow label="Standardized job title">
          {item.jobTitleStandardized ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-[#333333]">{item.jobTitleStandardized}
              <span title="Classified against gpriday/job-titles (ESCO + O*NET + OSCA)" className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-[#FEF7E7] text-[#E48715]">✨ AI</span>
            </span>
          ) : <span className="text-sm text-[#E8E4DF]">— (auto-fills on next Enrich)</span>}
        </FieldRow>
        <FieldRow label="Seniority"><InlineField rowId={item.id} field="seniority" value={item.seniority || ''} placeholder="seniority" /></FieldRow>
        <FieldRow label="Company"><InlineField rowId={item.id} field="companyName" value={item.companyName || ''} placeholder="company" /></FieldRow>
        <FieldRow label="Company LinkedIn">
          {companyLinkedinUrl ? <a href={companyLinkedinUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#046BB1] hover:underline break-all">{companyLinkedinUrl}</a> : <span className="text-sm text-[#E8E4DF]">—</span>}
        </FieldRow>
        <FieldRow label="Company website">
          {(() => {
            const site = item.companyWebsite || (item.companyDomain ? `https://${item.companyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : undefined)
            return site ? <a href={site} target="_blank" rel="noopener noreferrer" className="text-sm text-[#046BB1] hover:underline break-all">{site}</a> : <span className="text-sm text-[#E8E4DF]">—</span>
          })()}
        </FieldRow>
        <FieldRow label="Industry"><InlineField rowId={item.id} field="companyIndustry" value={item.companyIndustry || ''} placeholder="industry" /></FieldRow>
        {item.companySize && <FieldRow label="Company size"><span className="text-sm text-[#333333]">{item.companySize}</span></FieldRow>}
      </ProfileSection>
    </>
  )

  const surveyPane = (
    <>
      <ProfileSection title="Survey response">
        {surveyFields.map(f => (
          <FieldRow key={f.label} label={f.label}>
            <span className={`text-sm ${f.value ? 'text-[#333333]' : 'text-[#E8E4DF]'}`}>{f.value || '—'}</span>
          </FieldRow>
        ))}
        {item.buyingIntent && <FieldRow label="Buying intent"><span className="text-sm text-[#333333]">{item.buyingIntent}</span></FieldRow>}
      </ProfileSection>

      {hasV2Signals && (
        <ProfileSection title="Survey v2 signals">
          <div className="flex flex-wrap" style={{ gap: 6, padding: '12px 0' }}>
            {item.frequencyScore != null && <span style={{ border: '1px solid #D9D2C4', background: '#FFFFFF', padding: '2px 8px', fontSize: 10.5, color: '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>freq {item.frequencyScore}/3</span>}
            {item.depthScore != null && <span style={{ border: '1px solid #D9D2C4', background: '#FFFFFF', padding: '2px 8px', fontSize: 10.5, color: '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>depth {item.depthScore}/6</span>}
            {item.breadthScore != null && <span style={{ border: '1px solid #D9D2C4', background: '#FFFFFF', padding: '2px 8px', fontSize: 10.5, color: '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>breadth {item.breadthScore}</span>}
            {item.momentum != null && <span style={{ border: '1px solid #D9D2C4', background: '#FFFFFF', padding: '2px 8px', fontSize: 10.5, color: '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>momentum {item.momentum > 0 ? '+' : ''}{item.momentum}</span>}
            {item.friction && <span style={{ border: '1px solid #BE593B', background: '#FEF7E7', padding: '2px 8px', fontSize: 10.5, color: '#BE593B' }}>🛑 {item.friction.replace(/_/g, ' ')}</span>}
            {item.intent30d && <span style={{ border: '1px solid #62A758', background: '#FFFFFF', padding: '2px 8px', fontSize: 10.5, color: '#2D6A26' }}>🎯 {item.intent30d.replace(/_/g, ' ')}</span>}
          </div>
        </ProfileSection>
      )}
    </>
  )

  const revenuePane = (
    <div className="grid items-start" style={{ gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', maxWidth: 880 }}>
      {/* Revenue plate */}
      <div style={{ border: '2px solid #333333', background: '#FFFFFF' }}>
        <div className="flex items-center justify-between" style={{ padding: '9px 14px', background: '#333333' }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#FFFDFA' }}>Revenue</span>
          {stripeIds[0] && (
            <a href={`https://dashboard.stripe.com/customers/${stripeIds[0]}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: '#E7B02F' }} className="hover:underline">Stripe ↗</a>
          )}
        </div>
        <div style={{ padding: '14px 16px' }}>
          {paid ? (
            <>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: '#2D6A26', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>${item.lifetimeValueUsd!.toFixed(2)}</div>
              {item.stripeFirstChargeAt && <div style={{ fontSize: 10.5, color: '#9C9C9C', marginTop: 6 }}>first charge {fmtDate(item.stripeFirstChargeAt)}</div>}
              {item.stripeProducts && item.stripeProducts.length > 0 && (
                <div className="flex flex-col" style={{ marginTop: 12, borderTop: '1px solid #E8E2D4', paddingTop: 10, gap: 7 }}>
                  {item.stripeProducts.map((p, i) => (
                    <div key={i} className="flex items-baseline justify-between" style={{ gap: 10, fontSize: 11.5 }}>
                      <span className="truncate" style={{ color: '#1A1A1A' }} title={p.name}>{p.name || 'Unknown product'}</span>
                      <span className="shrink-0" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: '#1A1A1A' }}>${p.totalAmount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : <p style={{ fontSize: 13, color: '#9C9C9C' }}>No Stripe customer</p>}
        </div>
      </div>

      {/* Newsletter */}
      <div style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
        <div style={{ padding: '9px 14px', background: '#FEF7E7', borderBottom: '1px solid #333333' }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1A1A1A' }}>Newsletter</span>
        </div>
        <div style={{ padding: '10px 16px' }}>
          <Row k="Status" v={item.beehiivStatus
            ? <span style={{ color: item.beehiivStatus === 'active' ? '#2D6A26' : '#9C9C9C', fontWeight: item.beehiivStatus === 'active' ? 700 : 400 }}>{item.beehiivStatus === 'active' ? '● ' : ''}{item.beehiivStatus}{item.subscriptionTier ? ` · ${item.subscriptionTier}` : ''}</span>
            : <span style={{ color: '#C4BDB2' }}>not in Beehiiv</span>} />
          <Row k="Signup source" v={item.utmSourceBeehiiv || <span style={{ color: '#C4BDB2' }}>—</span>} />
          {pageSeen && <Row k="Saw variant" v={`${pageSeen.variant} · ${pageSeen.views} view${pageSeen.views === 1 ? '' : 's'}`} />}
        </div>
      </div>
    </div>
  )

  const enrichmentPane = (
    <div className="grid items-start" style={{ gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', maxWidth: 880 }}>
      {/* Data health */}
      <div style={{ border: '1px solid #333333', background: '#FFFFFF', padding: '14px 16px' }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C' }}>Data health</span>
          <span style={{ fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{filled} / 6</span>
        </div>
        <div className="flex" style={{ gap: 3 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} style={{ flex: 1, height: 8, background: i < filled ? '#62A758' : '#F1ECE0' }} />
          ))}
        </div>
        {missing.length === 0 ? (
          <div style={{ fontSize: 10.5, color: '#2D6A26', marginTop: 8 }}>All key fields present</div>
        ) : (
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
            {missing.map(m => (
              <span key={m} style={{ fontSize: 10.5, padding: '1px 7px', background: '#FEF7E7', color: '#B26A00', border: '1px solid #E48715' }}>{m}</span>
            ))}
          </div>
        )}
      </div>

      {/* AI adoption ladder rung map (+ segmentation chips) */}
      <div style={{ border: '1px solid #333333', background: '#FFFFFF', padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 10 }}>AI adoption ladder</div>
        {(chip(stage, item.stageReason) || chip(persona, item.personaReason)) && (
          <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 10 }}>
            {chip(stage, item.stageReason)}
            {chip(persona, item.personaReason)}
          </div>
        )}
        <div className="flex flex-col" style={{ gap: 2 }}>
          {[...STAGES.filter(s => s.key !== 'unknown')].reverse().map(def => {
            const isCurrent = stage?.key === def.key
            return (
              <div key={def.key} className="flex items-center" style={{ gap: 9, padding: '3px 6px', fontSize: 11, background: isCurrent ? '#FEF7E7' : 'transparent', borderLeft: `2px solid ${isCurrent ? '#E7B02F' : 'transparent'}` }}>
                <span style={{ width: 8, height: 8, background: def.color, flexShrink: 0 }} />
                <span style={{ color: '#1A1A1A', fontWeight: isCurrent ? 800 : 400 }}>{def.emoji} {def.label}</span>
                <span className="ml-auto" style={{ fontVariantNumeric: 'tabular-nums', color: '#9C9C9C', fontSize: 10 }}>S{def.key.charAt(1)}</span>
              </div>
            )
          })}
        </div>
        {(item.frequencyScore != null || item.depthScore != null || item.breadthScore != null) && (
          <div style={{ fontSize: 10.5, color: '#6B6B6B', marginTop: 10, borderTop: '1px solid #E8E2D4', paddingTop: 8 }}>
            {[item.frequencyScore != null && `freq ${item.frequencyScore}/3`, item.depthScore != null && `depth ${item.depthScore}/6`, item.breadthScore != null && `breadth ${item.breadthScore}`].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* Next best action */}
      {persona && persona.key !== 'unknown' && (
        <div style={{ border: '1px solid #E48715', background: '#FEF7E7', padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#B26A00', marginBottom: 6 }}>Next best action</div>
          <div style={{ fontSize: 12, color: '#333333', lineHeight: 1.5 }}>{persona.description}</div>
          <a href="https://app.beehiiv.com/automations" target="_blank" rel="noopener noreferrer" className="inline-flex" style={{ marginTop: 10 }}>
            <span style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, background: '#333333', color: '#FFFDFA' }}>Queue nurture email</span>
            <span className="inline-flex items-center justify-center" style={{ width: 26, background: '#333333', borderLeft: '1px solid rgba(255,253,250,0.25)', color: '#E7B02F', fontSize: 12 }}>↗</span>
          </a>
        </div>
      )}
    </div>
  )

  const rawDataPane = (
    <div style={{ maxWidth: 880 }}>
      <div style={{ marginTop: -20 }}>
        <RawDataSection rowId={item.id} enrichmentRaw={item.enrichmentRaw} />
      </div>

      <details className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden mb-6">
        <summary className="cursor-pointer px-5 py-3 text-xs font-bold uppercase tracking-widest text-[#9C9C9C] hover:bg-[#FFFDFA]">Metadata</summary>
        <div className="px-5 py-4 text-xs space-y-1 text-[#9C9C9C]">
          <div><span className="text-[#E8E4DF]">ID:</span> {item.id}</div>
          <div><span className="text-[#E8E4DF]">Submitted:</span> {new Date(item.ts).toLocaleString()}</div>
          {item.ip && <div><span className="text-[#E8E4DF]">IP:</span> {item.ip}</div>}
          {item.userAgent && <div className="break-all"><span className="text-[#E8E4DF]">UA:</span> {item.userAgent}</div>}
        </div>
      </details>

      <DeleteButton id={item.id} archivedAt={item.archivedAt} />
    </div>
  )

  // ── Page shell ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#FFFDFA' }}>
      {/* ── Top bar: breadcrumb + KPI dents + Re-enrich ───────── */}
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 12, padding: '14px 32px', borderBottom: '1px solid #333333' }}>
        <div className="flex items-center min-w-0" style={{ gap: 8, fontSize: 13 }}>
          <Link href="/admin/submissions" className="text-[#6B6B6B] hover:text-[#1A1A1A]">People</Link>
          <span className="text-[#C4BDB2]">›</span>
          <span className="truncate" style={{ fontWeight: 800, color: '#1A1A1A' }}>{item.name || item.email}</span>
        </div>
        <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
          <div className="flex" style={{ border: '1px solid #333333' }}>
            {dent('LTV', paid ? `$${item.lifetimeValueUsd!.toFixed(2)}` : '—', paid ? '#2D6A26' : '#C4BDB2')}
            {dent('Stage', stage && stage.key !== 'unknown' ? `${stage.emoji} S${stage.key.charAt(1)}` : '—', stage && stage.key !== 'unknown' ? '#046BB1' : '#C4BDB2')}
            {dent('Score', item.score ?? '—', '#1A1A1A')}
            {dent('Health', `${filled}/6`, filled === 6 ? '#62A758' : filled >= 4 ? '#E48715' : '#BE3B3B', true)}
          </div>
          <EnrichHeaderButton id={item.id} status={item.enrichmentStatus} enrichedAt={item.enrichedAt} />
        </div>
      </div>

      {/* ── Two-pane body: identity rail | tabbed dossier ─────── */}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 340px) minmax(0, 1fr)' }}>
        {/* LEFT · identity zone (dossier/passport) */}
        <aside style={{ padding: '24px 26px 36px', borderRight: '1px solid #333333' }}>
          {/* Acquisition chips */}
          {(item.utmSource || item.utmRef || referrers.length > 0 || pageSeen) && (
            <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 14 }}>
              {(item.utmSource || item.utmRef) && (
                <span style={{ border: '1px solid #C9C2B4', background: '#FFFDFA', color: '#6B6B6B', padding: '4px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                  title={[item.utmSource && `utm_source: ${item.utmSource}`, item.utmRef && `utm_ref: ${item.utmRef}`].filter(Boolean).join(' · ')}>
                  ↗ {item.utmSource || 'direct'}{item.utmRef ? ` / ${item.utmRef}` : ''}
                </span>
              )}
              {referrers.length > 0 && (
                <Link href={`/admin/submissions/${referrers[0].id}`}
                  style={{ border: '1px solid #0F8A6D', color: '#0F8A6D', padding: '4px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                  title={`Shared their pass → this lead. ${referrers.length > 1 ? referrers.length + ' possible referrers (4-char ref collision)' : ''}`}>
                  🔗 Referred by {referrers[0].name || referrers[0].email}{referrers.length > 1 ? ` +${referrers.length - 1}` : ''}
                </Link>
              )}
              {pageSeen && (
                <span
                  title={`Saw the ${pageSeen.variantLabel} result page · ${pageSeen.views} view${pageSeen.views === 1 ? '' : 's'}, last ${new Date(pageSeen.lastSeen).toLocaleString()}`}
                  style={{ border: '1px solid #C9C2B4', color: '#6B6B6B', padding: '4px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                >📄 Saw {pageSeen.variant}</span>
              )}
            </div>
          )}

          {/* Stamp-frame portrait (hover-edit preserved inside) */}
          <div style={{ border: '4px solid #333333', background: '#FFFDFA', padding: 5, width: '100%', maxWidth: 272 }}>
            <div style={{ filter: 'grayscale(1)' }}>
              <PhotoEditor id={item.id} currentPhotoUrl={item.photoUrl} name={item.name} email={item.email} fill />
            </div>
          </div>

          {/* Exactly three controls, right under the face */}
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', border: '1px solid #333333', marginTop: 12, width: '100%', maxWidth: 272 }}>
            {pageSeen?.clarityUrl ? (
              <a
                href={pageSeen.clarityUrl} target="_blank" rel="noopener noreferrer"
                title={`Find this session recording in Clarity: open recordings, then filter Custom tags → submissionId = ${item.id}`}
                className="hover:bg-[#FEF7E7]"
                style={{ display: 'block', textAlign: 'center', padding: '8px 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1A1A1A', borderRight: '1px solid #333333' }}
              >🎬 Clarity</a>
            ) : (
              <span
                title="No Clarity session captured for this person yet"
                style={{ display: 'block', textAlign: 'center', padding: '8px 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#C4BDB2', borderRight: '1px solid #333333' }}
              >🎬 Clarity</span>
            )}
            <a
              href={personResultPath({ id: item.id, name: item.name, score: item.score, persona: item.persona, stage: item.stage })}
              target="_blank" rel="noopener noreferrer"
              title="Open the result page this person received"
              className="hover:bg-[#FEF7E7]"
              style={{ display: 'block', textAlign: 'center', padding: '8px 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1A1A1A', borderRight: '1px solid #333333' }}
            >🎯 Results</a>
            <span
              title="Quiz score"
              style={{ display: 'block', textAlign: 'center', padding: '8px 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#333333', color: '#FFFDFA', fontVariantNumeric: 'tabular-nums' }}
            >Score {item.score ?? '—'}</span>
          </div>

          {/* Name + contact */}
          <div className="min-w-0" style={{ marginTop: 18, maxWidth: 272 }}>
            <div style={{ lineHeight: 1.15 }}>
              <InlineField
                rowId={item.id} field="name" value={item.name || ''} placeholder="full name"
                textClassName="text-[23px] leading-[1.15] font-extrabold tracking-[-0.02em] text-[#1A1A1A]"
              />
            </div>
            <p className="break-all" style={{ fontSize: 12.5, color: '#6B6B6B', marginTop: 5 }}>{item.email}</p>
            {locText && (
              <div className="flex items-center" style={{ gap: 7, marginTop: 8, fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>
                {locFlag && <span className="leading-none" style={{ fontSize: 16 }}>{locFlag}</span>}
                <span title={submittedFrom ? 'Location at submit time (IP geolocation)' : 'Enriched location'}>{locText}</span>
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9C9C9C' }}>LinkedIn</div>
              <LinkedInReplacer id={item.id} value={item.linkedinUrl} />
            </div>
          </div>

          {/* Verification status (enrichment game) */}
          <div style={{ marginTop: 18, maxWidth: 272 }}>
            {item.enrichmentVerifiedAt ? (
              <div
                title={`Profile confirmed in the enrichment game on ${new Date(item.enrichmentVerifiedAt).toLocaleString()}`}
                style={{ border: '2px solid #62A758', background: '#FFFFFF', color: '#2D6A26', padding: '9px 12px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}
              >✓ Verified by you {fmtDate(item.enrichmentVerifiedAt)}</div>
            ) : (
              <Link
                href="/admin/enrich-game"
                title="Not verified yet — open the enrichment game to confirm this profile"
                className="block hover:opacity-80"
                style={{ border: '2px solid #E48715', background: '#FEF7E7', color: '#B26A00', padding: '9px 12px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}
              >⏳ Pending verification →</Link>
            )}
          </div>
        </aside>

        {/* RIGHT · tabbed dossier */}
        <div className="min-w-0" style={{ padding: '18px 32px 48px' }}>
          <DossierTabs
            overview={overviewPane}
            survey={surveyPane}
            revenue={revenuePane}
            enrichment={enrichmentPane}
            rawdata={rawDataPane}
            meta={`submitted ${fmtDate(item.ts)} · id AC-${shortId}`}
          />
        </div>
      </div>
    </div>
  )
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: '1px solid #333333', background: '#FFFFFF', marginBottom: 18, maxWidth: 880 }}>
      <div style={{ padding: '10px 18px', background: '#FEF7E7', borderBottom: '1px solid #333333' }}>
        <h2 style={{ margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#1A1A1A' }}>{title}</h2>
      </div>
      <div style={{ padding: '6px 18px' }}>{children}</div>
    </section>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline last:border-b-0" style={{ gap: 16, padding: '9px 0', borderBottom: '1px solid #F1ECE2' }}>
      <span className="shrink-0" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9C9C9C', width: 150 }}>{label}</span>
      <div className="flex-1 min-w-0" style={{ fontSize: 13.5, color: '#1A1A1A' }}>{children}</div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[12.5px]">
      <span className="text-[#9C9C9C]">{k}</span>
      <span className="text-[#333] text-right truncate">{v}</span>
    </div>
  )
}
