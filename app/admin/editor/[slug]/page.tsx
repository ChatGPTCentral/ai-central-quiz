import { notFound } from 'next/navigation'
import { getLatestDraft, getLivePublishedConfig } from '@/lib/form-config'
import { QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import EditorClient from './EditorClient'

export const dynamic = 'force-dynamic'

const VALID_SLUGS = new Set(['quiz-v2'])

export default async function FormEditorPage({ params }: { params: { slug: string } }) {
  if (!VALID_SLUGS.has(params.slug)) notFound()

  const [live, draft] = await Promise.all([
    getLivePublishedConfig(params.slug),
    getLatestDraft(params.slug),
  ])

  // Editor opens to the latest draft if newer than live; else clones live.
  const editingQuestions = (draft && draft.version > (live?.version ?? 0))
    ? draft.questions
    : (live?.questions ?? QUESTIONS_V2_MERGED)

  return (
    <EditorClient
      slug={params.slug}
      initialQuestions={editingQuestions}
      liveVersion={live?.version ?? null}
      draftVersion={(draft && draft.version > (live?.version ?? 0)) ? draft.version : null}
      draftVersionId={(draft && draft.version > (live?.version ?? 0)) ? draft.id : null}
    />
  )
}
