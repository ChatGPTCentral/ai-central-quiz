import type { ArchetypeKey } from './archetypes'

export interface AffiliateTool {
  name: string
  tier: 'hero' | 'standard'
  category: string
  link: string
  domain: string
  offer?: string
}

// Returns favicon URL via Google's S2 service
export function toolIcon(domain: string): string {
  const clean = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  return `https://www.google.com/s2/favicons?domain=${clean}&sz=128`
}

export const AFFILIATE_TOOLS: AffiliateTool[] = [
  // Hero tools
  { name: 'Notion', tier: 'hero', category: 'AI Assistants & Productivity', link: 'https://affiliate.notion.so/293ma66go6e9', domain: 'notion.so', offer: '30 Days Free on Plus' },
  { name: 'Gamma', tier: 'hero', category: 'Presentations & Visual Storytelling', link: 'https://try.gamma.app/m6drjiom306j', domain: 'gamma.app', offer: '400 Free Credits' },
  { name: 'Anything', tier: 'hero', category: 'App & Website Building', link: 'https://anything.link/ai-central', domain: 'anything.com', offer: '3000 Credits' },
  { name: 'Beehiiv', tier: 'hero', category: 'Marketing & Growth', link: 'https://www.beehiiv.com/?via=chatgptcentral', domain: 'beehiiv.com', offer: '20% OFF for 3 Months' },
  { name: 'WISE', tier: 'hero', category: 'Finance & Payments', link: 'https://wise.com/invite/dic/alessiof316', domain: 'wise.com' },
  { name: 'ElevenLabs', tier: 'hero', category: 'Video Audio & Voice', link: 'https://try.elevenlabs.io/ai-central', domain: 'elevenlabs.io', offer: '10,000 Free Credits' },
  { name: 'Cozora', tier: 'hero', category: 'Learning & Career Development', link: 'https://cozora.substack.com/subscribe?coupon=9e8aaf12', domain: 'cozora.substack.com', offer: '50% OFF' },
  // Standard
  { name: 'AdCreative.ai', tier: 'standard', category: 'Marketing & Growth', link: 'https://free-trial.adcreative.ai/45jgeqy13m73', domain: 'adcreative.ai' },
  { name: 'Apollo.io', tier: 'standard', category: 'Sales CRM & Outreach', link: 'https://get.apollo.io/wg6yny3s23ut', domain: 'apollo.io', offer: '900 Free Credits' },
  { name: 'AuthoredUp', tier: 'standard', category: 'Writing & Content Creation', link: 'https://authoredup.com/?red=chatgp', domain: 'authoredup.com' },
  { name: 'Chatbase', tier: 'standard', category: 'App & Website Building', link: 'https://link.chatbase.co/ai-central', domain: 'chatbase.co' },
  { name: 'Chronicle', tier: 'standard', category: 'Presentations & Visual Storytelling', link: 'https://chr.so/ai-central', domain: 'chroniclehq.com' },
  { name: 'Conduit AI', tier: 'standard', category: 'Sales CRM & Outreach', link: 'https://getconduit.app/?gr_pk=b2KN', domain: 'getconduit.app' },
  { name: 'Durable', tier: 'standard', category: 'App & Website Building', link: 'https://durableai.link/ai-central', domain: 'durable.com' },
  { name: 'Fillout', tier: 'standard', category: 'AI Assistants & Productivity', link: 'https://try.fillout.com/ai-central-qd0u', domain: 'fillout.com' },
  { name: 'Folk CRM', tier: 'standard', category: 'Sales CRM & Outreach', link: 'https://try.folk.app/gntcyw4hucj8-s83uu', domain: 'folk.app' },
  { name: 'Galaxy.ai', tier: 'standard', category: 'AI Assistants & Productivity', link: 'https://try.galaxy.ai/ai-central', domain: 'galaxy.ai' },
  { name: 'Granola', tier: 'standard', category: 'AI Assistants & Productivity', link: 'https://go.granola.ai/alex-fiore', domain: 'granola.ai', offer: '1 Month Free' },
  { name: 'Lusha', tier: 'standard', category: 'Sales CRM & Outreach', link: 'https://partnerstack.lusha.com/gfnmz07skoif-omvn4r', domain: 'lusha.com' },
  { name: 'Mangools', tier: 'standard', category: 'Marketing & Growth', link: 'https://mangools.com/?gr_pk=xw3y', domain: 'mangools.com' },
  { name: 'Marblism', tier: 'standard', category: 'App & Website Building', link: 'https://marblism.com?via=ai-central', domain: 'marblism.com' },
  { name: 'Miro', tier: 'standard', category: 'Presentations & Visual Storytelling', link: 'https://miro.com/?red=chatgp', domain: 'miro.com' },
  { name: 'Murf.ai', tier: 'standard', category: 'Video Audio & Voice', link: 'https://get.murf.ai/1dhpyescqmub', domain: 'murf.ai' },
  { name: 'PDF.ai', tier: 'standard', category: 'AI Assistants & Productivity', link: 'https://refer.pdf.ai/ai-central', domain: 'pdf.ai' },
  { name: 'Reclaim.ai', tier: 'standard', category: 'AI Assistants & Productivity', link: 'https://go.reclaim.ai/hd3gazbokd7y', domain: 'reclaim.ai' },
  { name: 'Replit', tier: 'standard', category: 'App & Website Building', link: 'https://replit.com/signup?referral=alex3100', domain: 'replit.com', offer: '$10 Credits' },
  { name: 'Reply.io', tier: 'standard', category: 'Sales CRM & Outreach', link: 'https://get.reply.io/qxp3t0wcsxxd-p7peoq', domain: 'reply.io' },
  { name: 'SaneBox', tier: 'standard', category: 'AI Assistants & Productivity', link: 'https://try.sanebox.com/geuq5adylv01', domain: 'sanebox.com' },
  { name: 'SitesGPT', tier: 'standard', category: 'App & Website Building', link: 'https://affiliate.sitesgpt.com/ztcpgnvppbas', domain: 'sitesgpt.com' },
  { name: 'Streak', tier: 'standard', category: 'Sales CRM & Outreach', link: 'https://get.streak.com/c9igipckd1y7', domain: 'streak.com' },
  { name: 'Superlist', tier: 'standard', category: 'AI Assistants & Productivity', link: 'https://superli.st/ai-central', domain: 'superlist.com' },
  { name: 'Testimonial', tier: 'standard', category: 'Marketing & Growth', link: 'https://refer.testimonial.to/ai-central', domain: 'testimonial.to', offer: '15% OFF Year 1' },
  { name: 'Todoist', tier: 'standard', category: 'AI Assistants & Productivity', link: 'https://get.todoist.io/yspy3gfx3u7b', domain: 'todoist.com' },
  { name: 'Tykr', tier: 'standard', category: 'Learning & Career Development', link: 'https://tykr.com/?red=chatgp', domain: 'tykr.com' },
  { name: 'VisualCV', tier: 'standard', category: 'Learning & Career Development', link: 'https://visualcv.partnerlinks.io/465lvhyrplex', domain: 'visualcv.com' },
  { name: 'WisprFlow', tier: 'standard', category: 'AI Assistants & Productivity', link: 'https://ref.wisprflow.ai/ai-central', domain: 'wisprflow.ai' },
  { name: 'Writecream', tier: 'standard', category: 'Writing & Content Creation', link: 'https://www.writecream.com/?gr_pk=NjYQ', domain: 'writecream.com' },
]

// Curated archetype → tools mapping (10 per archetype, hero-prioritized).
// Names must match AFFILIATE_TOOLS entries above.
const ARCHETYPE_TOOL_NAMES: Record<ArchetypeKey, string[]> = {
  technical_pioneer: [
    'Anything', 'Notion', 'Gamma', 'ElevenLabs',
    'Replit', 'Chatbase', 'Marblism', 'SitesGPT', 'Galaxy.ai', 'PDF.ai',
  ],
  executive_strategist: [
    'Notion', 'Gamma', 'WISE', 'Beehiiv',
    'Granola', 'Reclaim.ai', 'Miro', 'Chronicle', 'Apollo.io', 'Tykr',
  ],
  growth_operator: [
    'Beehiiv', 'ElevenLabs', 'Gamma', 'Notion',
    'AdCreative.ai', 'Apollo.io', 'Reply.io', 'Lusha', 'AuthoredUp', 'Mangools',
  ],
  practical_learner: [
    'Cozora', 'Notion', 'Gamma', 'ElevenLabs',
    'Todoist', 'Granola', 'Reclaim.ai', 'Galaxy.ai', 'VisualCV', 'WisprFlow',
  ],
}

export function toolsForArchetype(key: ArchetypeKey, limit = 6): AffiliateTool[] {
  const names = ARCHETYPE_TOOL_NAMES[key] || []
  const byName = new Map(AFFILIATE_TOOLS.map(t => [t.name, t]))
  return names
    .map(n => byName.get(n))
    .filter((t): t is AffiliateTool => !!t)
    .slice(0, limit)
}
