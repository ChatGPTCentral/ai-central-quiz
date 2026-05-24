export type ArchetypeKey = 'executive_strategist' | 'growth_operator' | 'technical_pioneer' | 'practical_learner'

export interface ArchetypeConfig {
  key: ArchetypeKey
  label: string
  tags: string[]
  headline: (name: string) => string
  subheadline: string
  description: string
  tutorialKeywords: string[]
  valueProp: string[]
  cta: string
  accentColor: string
}

export const ARCHETYPES: Record<ArchetypeKey, ArchetypeConfig> = {
  executive_strategist: {
    key: 'executive_strategist',
    label: 'Executive Strategist',
    tags: ['archetype_executive_strategist', 'seniority_executive'],
    headline: (name) => `Welcome, ${name} -- Your executive AI intelligence starts here`,
    subheadline: 'Join 12,000+ executives who get AI insights that matter for competitive strategy',
    description: 'You think in systems and outcomes. You don\'t need another tutorial — you need leverage. AI that helps you make sharper decisions, ship faster, and lead a team that runs circles around the competition.',
    tutorialKeywords: ['leader', 'executive', 'strategy', 'ceo', 'cfo', 'founder', 'decision', 'report', 'presentation', 'deck', 'board', 'meeting', 'plan', 'team', 'manage', 'business', 'finance'],
    valueProp: [
      'Strategic AI updates built for decision-makers',
      'Executive case studies from real companies',
      'Competitive intelligence you won\'t find elsewhere',
    ],
    cta: 'Get executive AI briefings',
    accentColor: '#3B4C99',
  },
  growth_operator: {
    key: 'growth_operator',
    label: 'Growth Operator',
    tags: ['archetype_growth_operator', 'seniority_mid_level'],
    headline: (name) => `Hey ${name} -- Let's turn AI into your growth engine`,
    subheadline: 'Join 8,000+ growth-focused professionals automating their way to better margins',
    description: 'You hit numbers. Your job is to make pipeline, content, and campaigns move — and AI is the unfair advantage that lets a small team do the work of ten. You need playbooks that ship, not theory.',
    tutorialKeywords: ['marketing', 'sales', 'lead', 'campaign', 'content', 'email', 'linkedin', 'ad', 'seo', 'growth', 'carousel', 'newsletter', 'outreach', 'cold', 'crm', 'funnel', 'copy', 'brand'],
    valueProp: [
      'Automation playbooks you can deploy this week',
      'ROI-focused AI tools with real benchmarks',
      'Time-saving workflows for lean teams',
    ],
    cta: 'Start automating smarter',
    accentColor: '#E48715',
  },
  technical_pioneer: {
    key: 'technical_pioneer',
    label: 'Technical Pioneer',
    tags: ['archetype_technical_pioneer', 'usage_power_user'],
    headline: (name) => `Welcome to the lab, ${name}`,
    subheadline: 'Join 5,000+ builders and power users pushing AI to its limits',
    description: 'You ship. You build. You break things and rewire them better. You\'re past the prompt-engineering phase — now you want agents, automations, and architectures that compound.',
    tutorialKeywords: ['code', 'build', 'agent', 'automation', 'workflow', 'n8n', 'zapier', 'api', 'mcp', 'claude code', 'cursor', 'replit', 'github', 'data', 'analytics', 'developer', 'app', 'website'],
    valueProp: [
      'Advanced tutorials and API guides',
      'Early access to emerging AI tools',
      'Technical deep dives written for builders',
    ],
    cta: 'Get technical AI updates',
    accentColor: '#2D8879',
  },
  practical_learner: {
    key: 'practical_learner',
    label: 'Practical Learner',
    tags: ['archetype_practical_learner', 'usage_beginner'],
    headline: (name) => `Great choice, ${name} -- AI doesn't have to be complicated`,
    subheadline: 'Join 20,000+ professionals learning AI one practical step at a time',
    description: 'You don\'t want to fall behind, but you also don\'t want to drown in jargon. You want to use AI to save real hours every week — starting with the boring stuff first.',
    tutorialKeywords: ['save time', 'beginner', 'start', 'first', 'easy', 'simple', 'productivity', 'everyday', 'guide', 'basics', 'how to', 'free', 'tools', 'learn', 'tutorial'],
    valueProp: [
      'Beginner-friendly guides that actually work',
      'Quick wins you can apply immediately',
      'AI fundamentals without the jargon',
    ],
    cta: 'Start learning AI',
    accentColor: '#62A758',
  },
}

export interface QuizAnswers {
  name: string
  email: string
  aiLevel: string
  workArea: string
  learningStyle: string
  timeCommitment: string
  mainGoal: string
  aiTools: string
  jobLevel: string
}

export function determineArchetype(answers: QuizAnswers): ArchetypeKey {
  const { aiLevel, workArea, jobLevel, mainGoal, timeCommitment } = answers

  const techAreas = ['Coding', 'Data analytics']
  const execRoles = ['Founder', 'C-Suite', 'VP/Director']
  const growthAreas = ['Marketing', 'Sales', 'Business operations']

  const workAreaList = workArea.split(', ')
  const isTechWorker = workAreaList.some(a => techAreas.includes(a))
  const isExec = execRoles.includes(jobLevel)
  const isGrowthWorker = workAreaList.some(a => growthAreas.includes(a))
  const isHighCommitment = timeCommitment === '3+ hours' || timeCommitment === '1-2 hours'

  if (aiLevel === 'Advanced' || (isTechWorker && isHighCommitment)) {
    return 'technical_pioneer'
  }

  if (isExec && (mainGoal === 'Grow my business' || mainGoal === 'Professional growth')) {
    return 'executive_strategist'
  }

  if (isGrowthWorker && (mainGoal === 'Professional growth' || mainGoal === 'Grow my business')) {
    return 'growth_operator'
  }

  return 'practical_learner'
}
