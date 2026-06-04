import Link from 'next/link'
import { getLivePublishedConfig, getLatestDraft } from '@/lib/form-config'

export const dynamic = 'force-dynamic'

const FORMS = [
  { slug: 'quiz-v2', label: 'Survey v2 — main funnel', path: '/quiz-v2' },
]

export default async function EditorIndexPage() {
  const rows = await Promise.all(
    FORMS.map(async f => {
      const [live, draft] = await Promise.all([
        getLivePublishedConfig(f.slug),
        getLatestDraft(f.slug),
      ])
      return { ...f, live, draft }
    }),
  )

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[#333333]">Form editor</h1>
        <p className="text-sm text-[#9C9C9C] mt-1">Edit, draft, and publish the live survey without a code push.</p>
      </header>

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
                {f.live ? `Live v${f.live.version} · ${f.live.questions.length} questions` : 'No live version'}
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
  )
}
