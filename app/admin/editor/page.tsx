import Link from 'next/link'
import { getLivePublishedConfig, getLatestDraft } from '@/lib/form-config'
import type { FormConfig } from '@/lib/form-config'

export const dynamic = 'force-dynamic'

const FORMS = [
  { slug: 'quiz-v2', label: 'Survey v2 — main funnel', path: '/quiz-v2' },
]

interface Row {
  slug: string
  label: string
  path: string
  live: FormConfig | null
  draft: FormConfig | null
  error: string | null
}

export default async function EditorIndexPage() {
  const rows: Row[] = await Promise.all(
    FORMS.map(async (f): Promise<Row> => {
      try {
        const [live, draft] = await Promise.all([
          getLivePublishedConfig(f.slug),
          getLatestDraft(f.slug),
        ])
        return { ...f, live, draft, error: null }
      } catch (err) {
        console.error(`[admin/editor] fetch failed for ${f.slug}:`, err)
        return { ...f, live: null, draft: null, error: err instanceof Error ? err.message : String(err) }
      }
    }),
  )

  const anyError = rows.find(r => r.error)?.error ?? null

  return (
    <div>
      <header style={{ padding: '26px 36px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Tools · draft and publish the survey</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Form editor</h1>
        <p className="text-sm text-[#9C9C9C] mt-1">Edit, draft, and publish the live survey without a code push.</p>
      </header>

      <div className="max-w-3xl mx-auto px-8 pb-10 pt-1">
      {anyError && (
        <div className="mb-6 px-4 py-3 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-900">
          <div className="font-semibold mb-1">DB not migrated yet — read-only preview mode.</div>
          <div className="font-mono text-[10px] text-amber-700 break-all">{anyError}</div>
          <div className="mt-2 text-amber-800">The editor renders from the in-code seed config; Save Draft / Publish will fail until the <code>form_configs</code> + <code>form_publish_pointer</code> migration is applied.</div>
        </div>
      )}

      <div className="bg-white border border-[#E8E4DF] rounded-xl divide-y divide-[#E8E4DF]">
        {rows.map(f => (
          <Link
            key={f.slug}
            href={`/admin/editor/${f.slug}`}
            className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[#F5F5F5] transition-colors"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#333333]">{f.label}</div>
              <div className="text-xs text-[#9C9C9C] mt-0.5">
                {f.live ? `Live v${f.live.version} · ${f.live.questions.length} questions` : (f.error ? 'DB unavailable — opens with seed' : 'No live version')}
                {f.draft && f.draft.version > (f.live?.version ?? 0) && (
                  <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-[#E48715]/15 text-[#E48715] text-[10px] font-bold uppercase tracking-wider">draft v{f.draft.version}</span>
                )}
              </div>
            </div>
            <span className="text-xs text-[#9C9C9C] shrink-0">{f.path}</span>
          </Link>
        ))}
      </div>
      </div>
    </div>
  )
}
