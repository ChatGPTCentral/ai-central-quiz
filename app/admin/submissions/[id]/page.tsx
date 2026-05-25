import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSubmission } from '@/lib/kv'
import { ARCHETYPES, type ArchetypeKey } from '@/lib/archetypes'
import { continentOf, showState } from '@/lib/geo'
import DeleteButton from './DeleteButton.client'
import InlineField from './InlineField.client'
import EnrichHeaderButton from './EnrichHeaderButton.client'

export const dynamic = 'force-dynamic'

export default async function SubmissionDetailPage({ params }: { params: { id: string } }) {
  let item: Awaited<ReturnType<typeof getSubmission>> = null
  try { item = await getSubmission(params.id) } catch { item = null }
  if (!item) notFound()

  const archetype = item.archetype ? ARCHETYPES[item.archetype as ArchetypeKey] : null
  const continent = continentOf(item.country)
  const hasState = showState(item.country)

  // Company LinkedIn URL — prefer the dedicated column, fall back to enrichment jsonb
  const companyLinkedinUrl =
    item.companyLinkedinUrl ||
    (item.enrichment as Record<string, unknown> | undefined)?.companyLinkedinUrl as string | undefined ||
    (item.enrichmentRaw as Record<string, Record<string, unknown> | undefined> | undefined)?.apollo_legacy?.['Company Linkedin Url'] as string | undefined

  // Quiz fields in their original ask order (matches lib/questions.ts)
  const surveyFields: { label: string; value?: string }[] = [
    { label: 'AI familiarity',      value: item.aiLevel },
    { label: 'Work area',           value: item.workArea },
    { label: 'Learning style',      value: item.learningStyle },
    { label: 'Time commitment',     value: item.timeCommitment },
    { label: 'Main goal',           value: item.mainGoal },
    { label: 'AI tools used',       value: item.aiTools },
    { label: 'Job level',           value: item.jobLevel },
  ]

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <Link href="/admin/submissions" className="text-sm text-[#9C9C9C] hover:text-[#333333]">← All submissions</Link>
        <EnrichHeaderButton id={item.id} />
      </div>

      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="mt-3 mb-8 flex items-start gap-5">
        {/* Photo */}
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photoUrl}
            alt={item.name || item.email}
            referrerPolicy="no-referrer"
            className="w-24 h-24 rounded-2xl object-cover bg-[#F5F5F5] border border-[#E8E4DF] shrink-0"
          />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-[#F5F5F5] border border-[#E8E4DF] flex items-center justify-center text-3xl font-black text-[#9C9C9C] shrink-0">
            {(item.name || item.email).slice(0, 1).toUpperCase()}
          </div>
        )}

        {/* Name + subtitle + linkedin + archetype */}
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-black text-[#333333] leading-tight">
            <InlineField rowId={item.id} field="name" value={item.name || ''} placeholder="full name" />
          </div>
          <p className="text-sm text-[#9C9C9C] mt-1">{item.email}</p>

          <div className="text-[15px] text-[#9C9C9C] mt-2">
            <InlineField rowId={item.id} field="jobTitle" value={item.jobTitle || ''} placeholder="job title" />
            {(item.jobTitle || item.companyName) && <span className="text-[#E8E4DF] mx-1">@</span>}
            <InlineField rowId={item.id} field="companyName" value={item.companyName || ''} placeholder="company" />
          </div>

          <div className="mt-2">
            <InlineField rowId={item.id} field="linkedinUrl" value={item.linkedinUrl || ''} asLink placeholder="LinkedIn URL" />
          </div>

          <div className="mt-3 flex items-center gap-2">
            {archetype && (
              <span
                className="inline-block px-3 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: `${archetype.accentColor}18`, color: archetype.accentColor }}
              >
                {archetype.label}
              </span>
            )}
            {!archetype && (
              <span className="inline-block px-3 py-0.5 rounded-full text-xs font-medium bg-[#F5F5F5] text-[#9C9C9C]">
                No archetype
              </span>
            )}
            {item.score !== undefined && (
              <span className="inline-block px-3 py-0.5 rounded-full text-xs font-bold bg-[#333333] text-[#FFFDFA]">
                Score {item.score}
              </span>
            )}
            {item.source && (
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: item.source === 'survey' ? '#333333' : '#E8E4DF',
                  color: item.source === 'survey' ? '#FFFDFA' : '#333333',
                }}
              >{item.source}</span>
            )}
          </div>
        </div>
      </section>

      {/* ── SOCIO-DEMOGRAPHIC ───────────────────────────── */}
      <ProfileSection title="Socio-demographic">
        <FieldRow label="Age">
          {item.ageBracket ? (
            <InlineField rowId={item.id} field="ageBracket" value={item.ageBracket} placeholder="age bracket" />
          ) : item.ageAiEstimate ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-[#333333]">
              {item.ageAiEstimate}
              <span title={`AI-estimated · confidence ${item.aiEstimateConfidence || 'unknown'}`}
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FEF7E7] text-[#E48715]">✨ AI</span>
            </span>
          ) : (
            <InlineField rowId={item.id} field="ageBracket" value="" placeholder="age bracket" />
          )}
        </FieldRow>
        <FieldRow label="Sex">
          {item.sexAiEstimate ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-[#333333]">
              {item.sexAiEstimate}
              <span title={`AI-estimated · confidence ${item.aiEstimateConfidence || 'unknown'}`}
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FEF7E7] text-[#E48715]">✨ AI</span>
            </span>
          ) : (
            <span className="text-sm text-[#E8E4DF]">— (run ✨ Enrich to estimate from photo)</span>
          )}
        </FieldRow>
        <FieldRow label="City">
          <InlineField rowId={item.id} field="city" value={item.city || ''} placeholder="city" />
        </FieldRow>
        <FieldRow label="Country">
          <InlineField rowId={item.id} field="country" value={item.country || ''} placeholder="country" />
        </FieldRow>
        {hasState && (
          <FieldRow label="State / Province">
            <InlineField rowId={item.id} field="region" value={item.region || ''} placeholder="state" />
          </FieldRow>
        )}
        <FieldRow label="Continent">
          <span className="text-sm text-[#333333]">{continent}</span>
        </FieldRow>
      </ProfileSection>

      {/* ── WORKOGRAPHIC ─────────────────────────────────── */}
      <ProfileSection title="Workographic">
        <FieldRow label="Headline">
          <InlineField rowId={item.id} field="jobTitle" value={item.jobTitle || ''} placeholder="LinkedIn headline / raw job title" />
        </FieldRow>
        <FieldRow label="Standardized job title">
          {item.jobTitleStandardized ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-[#333333]">
              {item.jobTitleStandardized}
              <span title="Classified against gpriday/job-titles (ESCO + O*NET + OSCA)"
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-[#FEF7E7] text-[#E48715]">✨ AI</span>
            </span>
          ) : (
            <span className="text-sm text-[#E8E4DF]">— (auto-fills on next Enrich)</span>
          )}
        </FieldRow>
        <FieldRow label="Seniority">
          <InlineField rowId={item.id} field="seniority" value={item.seniority || ''} placeholder="seniority" />
        </FieldRow>
        <FieldRow label="Company">
          <InlineField rowId={item.id} field="companyName" value={item.companyName || ''} placeholder="company" />
        </FieldRow>
        <FieldRow label="Company LinkedIn">
          {companyLinkedinUrl ? (
            <a href={companyLinkedinUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm text-[#046BB1] hover:underline break-all">{companyLinkedinUrl}</a>
          ) : (
            <span className="text-sm text-[#E8E4DF]">—</span>
          )}
        </FieldRow>
        <FieldRow label="Company website">
          {(() => {
            // Prefer the full-website column, fall back to a constructed https://<domain>
            const site = item.companyWebsite
              || (item.companyDomain ? `https://${item.companyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : undefined)
            return site ? (
              <a href={site} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[#046BB1] hover:underline break-all">{site}</a>
            ) : (
              <span className="text-sm text-[#E8E4DF]">—</span>
            )
          })()}
        </FieldRow>
        <FieldRow label="Industry">
          <InlineField rowId={item.id} field="companyIndustry" value={item.companyIndustry || ''} placeholder="industry" />
        </FieldRow>
        {item.companySize && (
          <FieldRow label="Company size">
            <span className="text-sm text-[#333333]">{item.companySize}</span>
          </FieldRow>
        )}
      </ProfileSection>

      {/* ── SURVEY RESPONSE ─────────────────────────────── */}
      <ProfileSection title="Survey response">
        {surveyFields.map(f => (
          <FieldRow key={f.label} label={f.label}>
            <span className={`text-sm ${f.value ? 'text-[#333333]' : 'text-[#E8E4DF]'}`}>
              {f.value || '—'}
            </span>
          </FieldRow>
        ))}
        {item.buyingIntent && (
          <FieldRow label="Buying intent">
            <span className="text-sm text-[#333333]">{item.buyingIntent}</span>
          </FieldRow>
        )}
      </ProfileSection>

      {/* ── METADATA + RAW ENRICHMENT ─────────────────────── */}
      <details className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden mb-4">
        <summary className="cursor-pointer px-5 py-3 text-xs font-bold uppercase tracking-widest text-[#9C9C9C] hover:bg-[#FFFDFA]">
          Raw enrichment data
        </summary>
        <pre className="text-[11px] bg-[#FFFDFA] border-t border-[#E8E4DF] p-4 overflow-auto max-h-96">
          {JSON.stringify(item.enrichmentRaw, null, 2)}
        </pre>
      </details>

      <details className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden mb-6">
        <summary className="cursor-pointer px-5 py-3 text-xs font-bold uppercase tracking-widest text-[#9C9C9C] hover:bg-[#FFFDFA]">
          Metadata
        </summary>
        <div className="px-5 py-4 text-xs space-y-1 text-[#9C9C9C]">
          <div><span className="text-[#E8E4DF]">ID:</span> {item.id}</div>
          <div><span className="text-[#E8E4DF]">Submitted:</span> {new Date(item.ts).toLocaleString()}</div>
          {item.ip && <div><span className="text-[#E8E4DF]">IP:</span> {item.ip}</div>}
          {item.userAgent && <div className="break-all"><span className="text-[#E8E4DF]">UA:</span> {item.userAgent}</div>}
        </div>
      </details>

      <DeleteButton id={item.id} />
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
