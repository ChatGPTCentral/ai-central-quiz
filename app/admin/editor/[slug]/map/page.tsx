import { notFound } from 'next/navigation'
import { getLatestDraft, getLivePublishedConfig } from '@/lib/form-config'
import { QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import LogicMapClient from './LogicMapClient'

export const dynamic = 'force-dynamic'

const VALID_SLUGS = new Set(['quiz-v2'])

export default async function LogicMapPage({ params }: { params: { slug: string } }) {
  if (!VALID_SLUGS.has(params.slug)) notFound()

  const [live, draft] = await Promise.all([
    getLivePublishedConfig(params.slug),
    getLatestDraft(params.slug),
  ])
  const questions = (draft && draft.version > (live?.version ?? 0))
    ? draft.questions
    : (live?.questions ?? QUESTIONS_V2_MERGED)

  return (
    <LogicMapClient
      slug={params.slug}
      questions={questions}
      liveVersion={live?.version ?? null}
      draftVersion={(draft && draft.version > (live?.version ?? 0)) ? draft.version : null}
    />
  )
}
