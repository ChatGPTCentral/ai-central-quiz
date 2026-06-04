// Server component: fetches the live published form config from Supabase
// and passes it to the client form. Falls back to the in-repo seed array
// if the DB is unavailable (cold-start, network, or pre-seed environment).

import { getLivePublishedConfig } from '@/lib/form-config'
import { QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import QuizV2Client from './QuizV2Client'

export const revalidate = 60

export default async function QuizV2Page() {
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
  return <QuizV2Client questions={questions} accent={accent} />
}
