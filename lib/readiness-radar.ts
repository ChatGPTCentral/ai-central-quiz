// AI-competency radar axes for the result page, computed from the v2 quiz
// signals. Five axes: Prompting · Tools · Develop · Governance · Agents.
//
// Constraint: the quiz stores `depth_score` as a COUNT (not which items), so
// Develop/Agents/Governance lean on `ai_tools` (parseable), intent, seniority
// and the depth count. Governance is a PROXY — the quiz never asks it directly
// (decision approved). Heuristics below are intentionally simple + tunable.

export interface RadarInput {
  frequency_score?: number | null
  depth_score?: number | null
  breadth_score?: number | null
  momentum?: number | null
  ai_tools?: string | null
  job_level?: string | null
  friction?: string | null
  intent_30d?: string | null
}

export interface RadarAxis {
  label: string
  value: number
}

const DEV_TOOLS = ['cursor', 'copilot', 'lovable', 'replit']
const AGENT_TOOLS = ['n8n', 'zapier']

function clamp(v: number): number {
  return Math.max(8, Math.min(100, Math.round(v)))
}

function seniorityWeight(jobLevel?: string | null): number {
  const j = (jobLevel || '').toLowerCase()
  if (j.includes('founder') || j.includes('c-suite') || j.includes('chief')) return 1
  if (j.includes('vp') || j.includes('director') || j.includes('head')) return 0.8
  if (j.includes('manager')) return 0.55
  if (j.includes('individual') || j.includes('ic')) return 0.3
  if (j.includes('student') || j.includes('intern')) return 0.1
  return 0.35
}

/** Compute the 5 AI-competency axes (0–100 each, floored at 8) in fixed order. */
export function computeRadarAxes(f: RadarInput): RadarAxis[] {
  const freq = f.frequency_score ?? 0        // 0..3
  const depth = f.depth_score ?? 0           // 0..6 (count)
  const breadth = f.breadth_score ?? 0       // tool count
  const intent = f.intent_30d ?? ''
  const buildIntent = intent === 'first_automation' || intent === 'ship_to_customers'

  const tools = (f.ai_tools || '').toLowerCase()
  const devToolCount = DEV_TOOLS.filter((t) => tools.includes(t)).length
  const agentToolCount = AGENT_TOOLS.filter((t) => tools.includes(t)).length

  const prompting = 60 * (Math.min(freq, 3) / 3) + 40 * (Math.min(depth, 3) / 3)
  const toolsAxis = 100 * (Math.min(breadth, 6) / 6)
  const develop =
    50 * (Math.min(devToolCount, 2) / 2) + 30 * (Math.min(depth, 6) / 6) + (buildIntent ? 20 : 0)
  const governance =
    55 * seniorityWeight(f.job_level) +
    25 * (intent === 'teach_team' ? 1 : 0) +
    20 * (Math.min(depth, 6) / 6) -
    (f.friction === 'no_trust' ? 15 : 0)
  const agents =
    55 * (Math.min(agentToolCount, 2) / 2) + 25 * (Math.min(depth, 6) / 6) + (buildIntent ? 20 : 0)

  return [
    { label: 'Prompting', value: clamp(prompting) },
    { label: 'Tools', value: clamp(toolsAxis) },
    { label: 'Develop', value: clamp(develop) },
    { label: 'Governance', value: clamp(governance) },
    { label: 'Agents', value: clamp(agents) },
  ]
}
