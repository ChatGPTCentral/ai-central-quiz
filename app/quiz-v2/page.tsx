// Server component: fetches the live published form config from Supabase
// and passes it to the client form. Falls back to the in-repo seed array
// if the DB is unavailable (cold-start, network, or pre-seed environment).

import { cookies, headers } from 'next/headers'
import { getLivePublishedConfig } from '@/lib/form-config'
import { QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import { resolveExperiments } from '@/lib/experiments'
import QuizV2Client from './QuizV2Client'

// Reads the anon cookie for the entry A/B assignment → renders per request.
export const dynamic = 'force-dynamic'

export default async function QuizV2Page({ searchParams }: { searchParams: { qentry?: string } }) {
  let questions = QUESTIONS_V2_MERGED
  let accent: string | undefined
  try {
    const cfg = await getLivePublishedConfig('quiz-v2')
    if (cfg && Array.isArray(cfg.questions) && cfg.questions.length > 0) {
      questions = cfg.questions
      accent = cfg.theme?.accent
    }
  } catch (err) {
    // Fail open to the seed array so the funnel never goes dark.
    console.error('[quiz-v2] live config fetch failed, falling back to seed:', err)
  }

  // ── Quiz-entry A/B (experiment `quiz_entry_v1`) ─────────────────────
  // The 'question_first' arm opens the quiz with an engaging one-tap
  // question and moves name+email to the END. The whole pipeline is
  // id-keyed (answersToDb, scoring, branching all resolve by question id),
  // so reordering is data-safe. Deterministic + sticky via the engine; any
  // error, or no running experiment, fails open to the current control order.
  const cookieStore = cookies()
  const anonId = cookieStore.get('ac_aid')?.value ?? headers().get('x-anon-id') ?? null
  let assignments: { experimentKey: string; variantKey: string }[] = []
  try {
    const res = await resolveExperiments({
      anonId,
      cookieVariant: k => cookieStore.get(`ac_exp_${k}`)?.value,
      page: 'quiz',
    })
    assignments = res.assignments
  } catch (err) {
    console.error('[quiz-v2] experiment resolve failed, serving control order:', err)
  }
  // ?qentry=question_first|control force-previews an arm for eyeballing,
  // without recording an exposure (real visitors never carry it).
  const preview = typeof searchParams.qentry === 'string' ? searchParams.qentry.trim() : ''
  const questionFirst =
    preview === 'question_first' ||
    (preview !== 'control' &&
      assignments.some(a => a.experimentKey === 'quiz_entry_v1' && a.variantKey === 'question_first'))
  if (questionFirst) {
    const pii = questions.filter(q => q.id === 'name' || q.id === 'email')
    const rest = questions.filter(q => q.id !== 'name' && q.id !== 'email')
    if (pii.length > 0 && rest.length > 0) questions = [...rest, ...pii]
  }

  return <QuizV2Client questions={questions} accent={accent} assignments={assignments} />
}
