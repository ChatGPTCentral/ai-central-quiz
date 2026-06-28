import { findSubmissionByEmail, type StoredSubmission } from './kv'
import { lookupBeehiivSubscriber, type BeehiivLookupResult } from './beehiiv-lookup'
import { enrichWithApollo, type ApolloEnrichmentResult } from './apollo'
import { mapApolloToQuizFields } from './apollo-map'

export type PrefillSource = 'history' | 'beehiiv' | 'apollo'

export interface PrefillField<T = string | string[]> {
  value: T
  source: PrefillSource
}

export interface PrefillResult {
  email: string
  blocked?: boolean
  fields: {
    name?: PrefillField<string>
    aiLevel?: PrefillField<string>
    workArea?: PrefillField<string[]>
    learningStyle?: PrefillField<string[]>
    timeCommitment?: PrefillField<string>
    mainGoal?: PrefillField<string>
    aiTools?: PrefillField<string[]>
    jobLevel?: PrefillField<string>
  }
  history: {
    found: boolean
    submissionId?: string
    completedAt?: number
    // v2 segmentation snapshot — included so the admin Debug page and the
    // public quiz can both surface where the row sits today
    stage?: string
    stageReason?: string
    persona?: string
    personaReason?: string
    // Raw Survey v2 inputs when present
    frequencyScore?: number
    depthScore?: number
    breadthScore?: number
    momentum?: number
    friction?: string
    intent30d?: string
  }
  beehiiv: BeehiivLookupResult
  apollo: ApolloEnrichmentResult
}

function asArray(v?: string): string[] | undefined {
  if (!v) return undefined
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

// Set only if not already present (lower-priority cannot overwrite).
// Loosely typed to accommodate mixed string / string[] field types.
function set(
  target: Record<string, PrefillField<string | string[]> | undefined>,
  key: string,
  value: string | string[] | undefined,
  source: PrefillSource,
) {
  if (target[key]) return
  if (value === undefined || value === null) return
  if (Array.isArray(value) && value.length === 0) return
  if (typeof value === 'string' && value.trim() === '') return
  target[key] = { value, source }
}

export async function getPrefillData(emailRaw: string): Promise<PrefillResult> {
  const email = emailRaw.trim().toLowerCase()

  // Run all three lookups in parallel — works for any valid email.
  // Apollo will return success:false for personal-domain addresses; that's fine.
  const [history, beehiiv, apollo] = await Promise.all([
    findSubmissionByEmail(email).catch(() => null as StoredSubmission | null),
    lookupBeehiivSubscriber(email),
    enrichWithApollo(email),
  ])

  const fields: Record<string, PrefillField<string | string[]> | undefined> = {}

  // Priority 1: KV history
  if (history) {
    set(fields, 'name', history.name, 'history')
    set(fields, 'aiLevel', history.aiLevel, 'history')
    set(fields, 'workArea', asArray(history.workArea), 'history')
    set(fields, 'learningStyle', asArray(history.learningStyle), 'history')
    set(fields, 'timeCommitment', history.timeCommitment, 'history')
    set(fields, 'mainGoal', history.mainGoal, 'history')
    set(fields, 'aiTools', asArray(history.aiTools), 'history')
    set(fields, 'jobLevel', history.jobLevel, 'history')
  }

  // Priority 2: Beehiiv custom fields
  if (beehiiv.found && beehiiv.customFields) {
    const cf = beehiiv.customFields
    set(fields, 'name', cf.name, 'beehiiv')
    set(fields, 'aiLevel', cf.aiLevel, 'beehiiv')
    set(fields, 'workArea', asArray(cf.workArea), 'beehiiv')
    set(fields, 'learningStyle', asArray(cf.learningStyle), 'beehiiv')
    set(fields, 'timeCommitment', cf.timeCommitment, 'beehiiv')
    set(fields, 'mainGoal', cf.mainGoal, 'beehiiv')
    set(fields, 'aiTools', asArray(cf.aiTools), 'beehiiv')
    set(fields, 'jobLevel', cf.jobLevel, 'beehiiv')
  }

  // Priority 3: Apollo derived fields
  if (apollo.success) {
    const guess = mapApolloToQuizFields(apollo)
    set(fields, 'jobLevel', guess.jobLevel, 'apollo')
    set(fields, 'workArea', guess.workArea, 'apollo')
  }

  return {
    email,
    fields: fields as PrefillResult['fields'],
    history: history
      ? {
          found: true,
          submissionId: history.id,
          completedAt: history.ts,
          stage: history.stage,
          stageReason: history.stageReason,
          persona: history.persona,
          personaReason: history.personaReason,
          frequencyScore: history.frequencyScore,
          depthScore: history.depthScore,
          breadthScore: history.breadthScore,
          momentum: history.momentum,
          friction: history.friction,
          intent30d: history.intent30d,
        }
      : { found: false },
    beehiiv,
    apollo,
  }
}
