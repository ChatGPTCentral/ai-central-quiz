import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSubmission } from '@/lib/kv'
import { personResultPath } from '@/lib/result-url'
import { findReferrers } from '@/lib/referrer'
import { lastResultView } from '@/lib/result-view'
import { continentOf, showState } from '@/lib/geo'
import { countryFlag, isoToFlag } from '@/lib/country-flags'
import { stageDef, personaDef } from '@/lib/segmentation-v2'
import DeleteButton from './DeleteButton.client'
import InlineField from './InlineField.client'
import EnrichHeaderButton from './EnrichHeaderButton.client'
import LinkedInReplacer from './LinkedInReplacer.client'
import PhotoEditor from './PhotoEditor.client'
import RawDataSection from './RawDataSection'

export const dynamic = 'force-dynamic'

// ── Person record · three-pane (design "Admin section redesign" 1b) ──
// Left profile rail · center editable dossier · right insight rail. Every
// editable field keeps its InlineField/PhotoEditor component — the layout
// changed, the functionality did not. Read-only Stripe/Beehiiv fields moved
// to the right insight rail.

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
  // distinct from the enriched company/role location above.
  const submittedFrom = [item.ipCity, item.ipRegion, item.ipCountry].filter(Boolean).join(', ')

  const stage = stageDef(item.stage)
  const persona = personaDef(item.persona)
  const paid = typeof item.lifetimeValueUsd === 'number' && item.lifetimeValueUsd > 0
  const stripeIds = item.stripeCustomerIds?.length ? item.stripeCustomerIds : (item.stripeCustomerId ? [item.stripeCustomerId] : [])
  const missing = ([
    ['photo', item.photoUrl], ['linkedin', item.linkedinUrl], ['company', item.companyName],
    ['country', item.country], ['title', item.jobTitle], ['region', item.region],
  ] as [string, unknown][]).filter(([, v]) => !v).map(([k]) => k)
  const filled = 6 - missing.length

  const chip = (def: { key: string; label: string; emoji: string; color: string } | undefined, reason?: string) =>
    def && def.key !== 'unknown' ? (
      <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold"
        style={{ backgroundColor: def.color + '22', color: def.color, border: `1px solid ${def.color}40` }} title={reason || def.label}>
        {def.emoji} {def.label}
      </span>
    ) : null

  return (
    <div className="min-h-screen" style={{ background: '#FFFDFA' }}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-8 py-4" style={{ borderBottom: '1px solid #E8E4DF' }}>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Link href="/admin/submissions" className="text-[#9C9C9C] hover:text-[#333333]">People</Link>
          <span className="text-[#C4BDB2]">›</span>
          <span className="font-bold text-[#1A1A1A] truncate">{item.name || item.email}</span>
        </div>
        <div className="flex items-center gap-2">
          {(item.utmSource || item.utmRef) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#FEF7E7] text-[#E48715] border border-[#E48715]/30"
              title={[item.utmSource && `utm_source: ${item.utmSource}`, item.utmRef && `utm_ref: ${item.utmRef}`].filter(Boolean).join(' · ')}>
              ↗ {item.utmSource || 'direct'}{item.utmRef ? ` / ${item.utmRef}` : ''}
            </span>
          )}
          {referrers.length > 0 && (
            <Link href={`/admin/submissions/${referrers[0].id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#EAF6F1] text-[#0F8A6D] border border-[#0F8A6D]/30"
              title={`Shared their pass → this lead. ${referrers.length > 1 ? referrers.length + ' possible referrers (4-char ref collision)' : ''}`}>
              🔗 Referred by {referrers[0].name || referrers[0].email}{referrers.length > 1 ? ` +${referrers.length - 1}` : ''}
            </Link>
          )}
          {pageSeen && (
            <span
              title={`Saw the ${pageSeen.variantLabel} result page · ${pageSeen.views} view${pageSeen.views === 1 ? '' : 's'}, last ${new Date(pageSeen.lastSeen).toLocaleString()}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#F1EDE4] text-[#6B6B6B] border border-[#E8E4DF]"
            >📄 Saw {pageSeen.variant}</span>
          )}
          {pageSeen?.clarityUrl && (
            <a
              href={pageSeen.clarityUrl} target="_blank" rel="noopener noreferrer"
              title={`Find this session recording in Clarity: open recordings, then filter Custom tags → submissionId = ${item.id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#F3EEFA] text-[#8E5BD1] border border-[#8E5BD1]/30"
            >🎬 Clarity ↗</a>
          )}
          <a
            href={personResultPath({ id: item.id, name: item.name, score: item.score, persona: item.persona, stage: item.stage })}
            target="_blank" rel="noopener noreferrer"
            title="Open the result page this person received"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#E8E4DF] text-[12px] font-bold text-[#E48715] hover:bg-[#FAF7F1]"
          >🎯 Result page ↗</a>
          {item.linkedinUrl && (
            <a href={item.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#E8E4DF] text-[12px] font-bold text-[#0A66C2] hover:bg-[#FAF7F1]">in ↗</a>
          )}
          <EnrichHeaderButton id={item.id} status={item.enrichmentStatus} enrichedAt={item.enrichedAt} />
        </div>
      </div>

      {/* ── Three-pane body ─────────────────────────────────── */}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(260px,300px) minmax(0,1fr) minmax(280px,320px)' }}>
        {/* LEFT · profile rail */}
        <aside className="p-6" style={{ borderRight: '1px solid #E8E4DF' }}>
          <PhotoEditor id={item.id} currentPhotoUrl={item.photoUrl} name={item.name} email={item.email} />
          <div className="mt-4 min-w-0">
            <div className="text-xl font-black text-[#333333] leading-tight">
              <InlineField rowId={item.id} field="name" value={item.name || ''} placeholder="full name" />
            </div>
            <p className="text-[13px] text-[#9C9C9C] mt-0.5 break-all">{item.email}</p>
            <div className="text-[13.5px] text-[#666] mt-1.5">
              <InlineField rowId={item.id} field="jobTitle" value={item.jobTitle || ''} placeholder="job title" />
              {(item.jobTitle || item.companyName) && <span className="text-[#C4BDB2] mx-1">·</span>}
              <InlineField rowId={item.id} field="companyName" value={item.companyName || ''} placeholder="company" />
            </div>
            <LinkedInReplacer id={item.id} value={item.linkedinUrl} />
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {chip(stage, item.stageReason)}
              {chip(persona, item.personaReason)}
              {item.score !== undefined && (
                <span className="inline-block px-3 py-0.5 rounded-full text-xs font-bold bg-[#333333] text-[#FFFDFA]">Score {item.score}</span>
              )}
            </div>

            {/* Survey v2 pills */}
            {(item.frequencyScore != null || item.depthScore != null || item.breadthScore != null || item.momentum != null || item.friction || item.intent30d) && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="w-full font-bold uppercase tracking-widest text-[#9C9C9C] mb-0.5">Survey v2</span>
                {item.frequencyScore != null && <span className="px-1.5 py-0.5 rounded bg-[#F5F5F5] text-[#333333]">freq {item.frequencyScore}/3</span>}
                {item.depthScore != null && <span className="px-1.5 py-0.5 rounded bg-[#F5F5F5] text-[#333333]">depth {item.depthScore}/6</span>}
                {item.breadthScore != null && <span className="px-1.5 py-0.5 rounded bg-[#F5F5F5] text-[#333333]">breadth {item.breadthScore}</span>}
                {item.momentum != null && <span className="px-1.5 py-0.5 rounded bg-[#F5F5F5] text-[#333333]">momentum {item.momentum > 0 ? '+' : ''}{item.momentum}</span>}
                {item.friction && <span className="px-1.5 py-0.5 rounded bg-[#FEF7E7] text-[#BE593B]">🛑 {item.friction.replace(/_/g, ' ')}</span>}
                {item.intent30d && <span className="px-1.5 py-0.5 rounded bg-[#62A758]/15 text-[#2D6A26]">🎯 {item.intent30d.replace(/_/g, ' ')}</span>}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER · editable dossier */}
        <div className="p-6 min-w-0">
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

          <ProfileSection title="Survey response">
            {surveyFields.map(f => (
              <FieldRow key={f.label} label={f.label}>
                <span className={`text-sm ${f.value ? 'text-[#333333]' : 'text-[#E8E4DF]'}`}>{f.value || '—'}</span>
              </FieldRow>
            ))}
            {item.buyingIntent && <FieldRow label="Buying intent"><span className="text-sm text-[#333333]">{item.buyingIntent}</span></FieldRow>}
          </ProfileSection>

          <RawDataSection rowId={item.id} enrichmentRaw={item.enrichmentRaw} />

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

        {/* RIGHT · insight rail */}
        <aside className="p-6 flex flex-col gap-4" style={{ borderLeft: '1px solid #E8E4DF' }}>
          {/* Revenue */}
          <InsightPanel title="Revenue" action={stripeIds[0] ? { label: 'Stripe ↗', href: `https://dashboard.stripe.com/customers/${stripeIds[0]}` } : undefined}>
            {paid ? (
              <>
                <div className="text-[26px] font-black text-[#2E7D32] leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>${item.lifetimeValueUsd!.toFixed(2)}</div>
                {item.stripeFirstChargeAt && <p className="text-[11.5px] text-[#9C9C9C] mt-1.5">first {new Date(item.stripeFirstChargeAt).toLocaleDateString()}</p>}
                {item.stripeProducts && item.stripeProducts.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {item.stripeProducts.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="truncate text-[#333]" title={p.name}>{p.name || 'Unknown product'}</span>
                        <span className="tabular-nums font-bold text-[#1A1A1A] shrink-0">${p.totalAmount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : <p className="text-[13px] text-[#9C9C9C]">No Stripe customer</p>}
          </InsightPanel>

          {/* AI adoption ladder */}
          {stage && stage.key !== 'unknown' && (
            <InsightPanel title="AI adoption ladder">
              <div className="flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: stage.color }} />
                <span className="text-[15px] font-bold" style={{ color: stage.color }}>{stage.label}</span>
              </div>
              <p className="text-[11.5px] text-[#9C9C9C] mt-1.5">
                {[item.frequencyScore != null && `freq ${item.frequencyScore}/3`, item.depthScore != null && `depth ${item.depthScore}/6`, item.breadthScore != null && `breadth ${item.breadthScore}`].filter(Boolean).join(' · ')}
              </p>
              {persona && persona.key !== 'unknown' && (
                <div className="mt-3 rounded-md p-3" style={{ background: '#FEF7E7', border: '1px solid #F0E4C8' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#E48715] mb-1">Next best action</p>
                  <p className="text-[12px] text-[#333] leading-snug">{persona.description}</p>
                </div>
              )}
            </InsightPanel>
          )}

          {/* Newsletter */}
          <InsightPanel title="Newsletter">
            <Row k="Status" v={item.beehiivStatus
              ? <span className={item.beehiivStatus === 'active' ? 'text-[#2E7D32] font-semibold' : 'text-[#9C9C9C]'}>{item.beehiivStatus === 'active' ? '● ' : ''}{item.beehiivStatus}</span>
              : <span className="text-[#C4BDB2]">not in Beehiiv</span>} />
            <Row k="Tier" v={item.subscriptionTier || <span className="text-[#C4BDB2]">—</span>} />
            <Row k="Signup source" v={item.utmSourceBeehiiv || <span className="text-[#C4BDB2]">—</span>} />
          </InsightPanel>

          {/* Data health */}
          <InsightPanel title="Data health" action={undefined} rightNote={`${filled} of 6`}>
            <div className="h-1.5 rounded-full overflow-hidden mb-2.5" style={{ background: '#F0ECE5' }}>
              <div className="h-full rounded-full" style={{ width: `${(filled / 6) * 100}%`, background: '#62A758' }} />
            </div>
            {missing.length === 0 ? (
              <p className="text-[12px] text-[#2E7D32]">All key fields present</p>
            ) : (
              <>
                <p className="text-[11px] text-[#9C9C9C] mb-1.5">Missing</p>
                <div className="flex flex-wrap gap-1.5">
                  {missing.map(m => (
                    <span key={m} className="text-[11px] px-2 py-0.5 rounded" style={{ background: '#FEF7E7', color: '#B26A00', border: '1px solid #F0E4C8' }}>{m}</span>
                  ))}
                </div>
              </>
            )}
          </InsightPanel>
        </aside>
      </div>
    </div>
  )
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden mb-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#9C9C9C] px-5 pt-4 pb-1">{title}</h2>
      <div className="px-5 py-2">{children}</div>
    </section>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-[#F5F5F5] last:border-b-0">
      <span className="text-xs font-medium text-[#9C9C9C] w-32 shrink-0 pt-0.5 uppercase tracking-wider">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function InsightPanel({ title, action, rightNote, children }: { title: string; action?: { label: string; href: string }; rightNote?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E8E4DF] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">{title}</span>
        {action && <a href={action.href} target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-bold text-[#046BB1] hover:underline">{action.label}</a>}
        {rightNote && <span className="text-[11.5px] font-bold text-[#333]">{rightNote}</span>}
      </div>
      {children}
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
