import type { ApolloEnrichmentResult } from './apollo'

export interface QuizFieldGuess {
  name?: string
  aiLevel?: string
  workArea?: string[]
  jobLevel?: string
  mainGoal?: string
  timeCommitment?: string
  learningStyle?: string[]
  aiTools?: string[]
}

// Apollo's seniority string → our jobLevel option value
function mapSeniority(seniority?: string): string | undefined {
  if (!seniority) return undefined
  const s = seniority.toLowerCase()
  if (s.includes('founder') || s.includes('owner')) return 'Founder'
  if (s.includes('c_suite') || s.includes('cxo') || /\bc(eo|fo|oo|to|mo|po|ro|so|io)\b/.test(s)) return 'C-Suite'
  if (s.includes('vp') || s.includes('head') || s.includes('director')) return 'VP/Director'
  if (s.includes('manager')) return 'Manager'
  if (s.includes('intern') || s.includes('student')) return 'Student or intern'
  return 'Individual contributor'
}

// Apollo job title → most-likely workArea(s)
function mapTitle(title?: string): string[] | undefined {
  if (!title) return undefined
  const t = title.toLowerCase()
  const out: string[] = []
  if (/\b(market|brand|growth marketing|seo|content market|community)\b/.test(t)) out.push('Marketing')
  if (/\b(sales|account executive|ae\b|bdr|sdr|business development)\b/.test(t)) out.push('Sales')
  if (/\b(engineer|developer|swe|programmer|coder|software)\b/.test(t)) out.push('Coding')
  if (/\b(data|analyst|analytics|bi |business intelligence|scientist)\b/.test(t)) out.push('Data analytics')
  if (/\b(finance|cfo|accountant|controller|treasur)\b/.test(t)) out.push('Finance')
  if (/\b(legal|counsel|lawyer|paralegal|attorney)\b/.test(t)) out.push('Legal')
  if (/\b(operation|ops|business operations|coo)\b/.test(t)) out.push('Business operations')
  if (/\b(consult|advisor|strategist)\b/.test(t)) out.push('Consulting')
  if (/\b(project manager|program manager|pmo|scrum)\b/.test(t)) out.push('Project management')
  if (/\b(writer|copywriter|editor|journal)\b/.test(t)) out.push('Writing')
  if (/\b(research|scientist|phd)\b/.test(t)) out.push('Research')
  if (/\b(government|policy|public sector|agency)\b/.test(t)) out.push('Government')
  if (/\b(ux|product designer|designer)\b/.test(t)) out.push('Reading/UX')
  if (/\b(student|intern)\b/.test(t)) out.push('Student')
  return out.length ? Array.from(new Set(out)) : undefined
}

export function mapApolloToQuizFields(result: ApolloEnrichmentResult): QuizFieldGuess {
  if (!result.success) return {}
  return {
    jobLevel: mapSeniority(result.seniorityLevel),
    workArea: mapTitle(result.jobTitle),
  }
}
