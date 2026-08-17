// The study plan's DATA, in a plain module with no 'use client' directive.
//
// WHY THIS FILE EXISTS (the 2026-08-17 result-page outage, ~5 minutes, 2
// visitors): planForStage used to live inside StudyPlan.tsx, which is a
// client component. Importing a FUNCTION from a 'use client' module into
// server code does not import the function — it imports a client-reference
// proxy, and calling it on the server throws "_ is not a function" at
// runtime. `next build` cannot catch it on a force-dynamic page, so the
// crash shipped green and 500'd the one page every sale happens on.
//
// The rule this file encodes: data and pure helpers that BOTH worlds need
// live in a plain module; 'use client' files export only components.
//
// These five-per-band tutorials are the ones the study plan renders AND the
// ones the answer-echo pitch names — one source, so the pitch can never
// promise a tutorial the page does not deliver.

export interface PlanItem { qf: string; title: string; desc: string; link: string }

export const TP = (qf: string, sr: 'oc' | 'pp' = 'pp') =>
  sr === 'oc'
    ? `https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=oc&_t=oc:&qf=${qf}`
    : `https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=pp&_t=pp:&qf=${qf}&ch=`

// Early band (S0-S2): foundations → daily practice.
export const EARLY_PLAN: PlanItem[] = [
  { qf: 'w_aice27', title: 'Claude Setup Guide: Make Claude 10x Smarter in 5 Steps', desc: 'Set up your daily AI workspace the right way, 15 minutes', link: TP('w_aice27') },
  { qf: 'w_chau136', title: 'How To Instantly Create Stunning Presentations With AI', desc: 'Your first visible win: decks that used to take a day, in minutes', link: TP('w_chau136', 'oc') },
  { qf: 'w_chau185', title: 'Copywriting Prompts with ChatGPT: Create Better Copy, Faster', desc: 'Write instructions AI can’t misread, emails, posts, briefs', link: TP('w_chau185', 'oc') },
  { qf: 'w_aice33', title: 'How to Learn 80 Percent of Any Skill in One Week Using NotebookLM', desc: 'Turn any topic into a personal crash course', link: TP('w_aice33') },
  { qf: 'w_chau290', title: 'The Complete ChatGPT Mastery Guide for AI Productivity', desc: 'The consolidation week: from tips to a daily system', link: TP('w_chau290') },
]

// Deep band (S3-S5): systematize → ship.
export const DEEP_PLAN: PlanItem[] = [
  { qf: 'w_chau288', title: 'Official GPT-5.2 Prompting Guide From OpenAI', desc: 'The reference the top 2% actually prompt from', link: TP('w_chau288') },
  { qf: 'w_aice24', title: 'How to Set Up Claude Cowork in 8 Steps: From Chaos to Mastery', desc: 'Agents doing real work while you handle the human parts', link: TP('w_aice24') },
  { qf: 'w_aice25', title: '13 Free Courses from Anthropic: Complete Claude & AI Fluency Training', desc: 'Formalize what you know, fill the gaps you don’t see', link: TP('w_aice25') },
  { qf: 'w_chau287', title: '10 ChatGPT Prompts for Consultants Using AI', desc: 'Client-grade outputs: analysis, reporting, strategy', link: TP('w_chau287') },
  { qf: 'w_defa10445', title: 'The Complete Free AI Learning Library: Master ChatGPT, Claude, Gemini & More', desc: 'The full map: every tool, ranked by what it’s for', link: TP('w_defa10445') },
]

/** The band split, in one place: S3+ gets the deep plan. */
export function planForStage(stageKey?: string | null): PlanItem[] {
  const deep = stageKey === 'S3_practitioner' || stageKey === 'S4_power_user' || stageKey === 'S5_builder'
  return deep ? DEEP_PLAN : EARLY_PLAN
}
