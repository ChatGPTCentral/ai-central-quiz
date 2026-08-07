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
  // Question-first is now the default for everyone: quiz_entry_v1 called it at
  // 77.3% vs 68.7% completion and 32.0% vs 25.2% checkout-click over 212 people,
  // both moving the same way for days. Asking for name and email up front was
  // costing roughly one in eight completions.
  // ?qentry=control still renders the old PII-first order for comparison.
  const preview = typeof searchParams.qentry === 'string' ? searchParams.qentry.trim() : ''
  const questionFirst = preview !== 'control'
  if (questionFirst) {
    // EMAIL BEFORE NAME, deliberately. These are the last two steps and the
    // only typed ones, and they are where the quiz actually leaks: name 89.1%,
    // email 93.9%, so 16.3% of people who answered every content question
    // never reach the end. Email is the field that is worth something on its
    // own - - it is the whole reason we run the quiz - - so it goes first, and
    // the partial-lead save fires on a valid email ALONE (see QuizV2Client).
    // Anyone who quits on the name step is now still a captured lead instead
    // of ten answered questions we throw away.
    const email = questions.find(q => q.id === 'email')
    const name = questions.find(q => q.id === 'name')
    const rest = questions.filter(q => q.id !== 'name' && q.id !== 'email')
    const pii = [email, name].filter(Boolean) as typeof questions
    if (pii.length > 0 && rest.length > 0) questions = [...rest, ...pii]
  }

  return <QuizV2Client questions={questions} accent={accent} assignments={assignments} />
}
