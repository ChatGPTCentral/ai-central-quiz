import CheckoutLink from '@/components/CheckoutLink.client'

// "Your recommended study plan" — a vertical stepper of five REAL library
// tutorials (titles/covers from the starter-kit's most-downloaded list),
// sequenced for the person's stage band. Step 1 is open as the taste;
// steps 2+ carry the 🔒 in-the-library treatment. Every row checks out
// (placement v2_study_plan).

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const FULVOUS = '#E48715'

interface PlanItem { qf: string; title: string; desc: string }

// Early band (S0-S2): foundations → daily practice.
const EARLY_PLAN: PlanItem[] = [
  { qf: 'w_aice27', title: 'Claude Setup Guide: Make Claude 10x Smarter in 5 Steps', desc: 'Set up your daily AI workspace the right way, 15 minutes' },
  { qf: 'w_chau136', title: 'How To Instantly Create Stunning Presentations With AI', desc: 'Your first visible win: decks that used to take a day, in minutes' },
  { qf: 'w_chau185', title: 'Copywriting Prompts with ChatGPT: Create Better Copy, Faster', desc: 'Write instructions AI can’t misread, emails, posts, briefs' },
  { qf: 'w_aice33', title: 'How to Learn 80 Percent of Any Skill in One Week Using NotebookLM', desc: 'Turn any topic into a personal crash course' },
  { qf: 'w_chau290', title: 'The Complete ChatGPT Mastery Guide for AI Productivity', desc: 'The consolidation week: from tips to a daily system' },
]

// Deep band (S3-S5): systematize → ship.
const DEEP_PLAN: PlanItem[] = [
  { qf: 'w_chau288', title: 'Official GPT-5.2 Prompting Guide From OpenAI', desc: 'The reference the top 2% actually prompt from' },
  { qf: 'w_aice24', title: 'How to Set Up Claude Cowork in 8 Steps: From Chaos to Mastery', desc: 'Agents doing real work while you handle the human parts' },
  { qf: 'w_aice25', title: '13 Free Courses from Anthropic: Complete Claude & AI Fluency Training', desc: 'Formalize what you know, fill the gaps you don’t see' },
  { qf: 'w_chau287', title: '10 ChatGPT Prompts for Consultants Using AI', desc: 'Client-grade outputs: analysis, reporting, strategy' },
  { qf: 'w_defa10445', title: 'The Complete Free AI Learning Library: Master ChatGPT, Claude, Gemini & More', desc: 'The full map: every tool, ranked by what it’s for' },
]

const cover = (qf: string) => `https://img.tradepub.com/free/${qf}/images/${qf}c4.gif`

export function StudyPlan({
  stageKey,
  checkoutUrl,
  submissionId,
}: {
  stageKey?: string | null
  checkoutUrl: string
  submissionId?: string
}) {
  const deep = stageKey === 'S3_practitioner' || stageKey === 'S4_power_user' || stageKey === 'S5_builder'
  const plan = deep ? DEEP_PLAN : EARLY_PLAN
  const weeks = ['Week 1', 'Week 1', 'Week 2', 'Week 3', 'Week 4']

  return (
    <div className="mt-8">
      {plan.map((t, i) => {
        const locked = i > 0
        return (
          <CheckoutLink
            key={t.qf}
            href={checkoutUrl}
            placement="v2_study_plan"
            submissionId={submissionId}
            className="group flex gap-4 sm:gap-5 relative"
            style={{ textDecoration: 'none', paddingBottom: i === plan.length - 1 ? 0 : 26 }}
          >
            {/* rail + step dot */}
            <span className="flex flex-col items-center shrink-0" style={{ width: 40 }}>
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  backgroundColor: locked ? '#FFFFFF' : FULVOUS,
                  border: `3px solid ${INK}`,
                  color: locked ? INK : '#FFFFFF', fontWeight: 800, fontSize: 15,
                }}
                aria-hidden
              >
                {locked ? '🔒' : '1'}
              </span>
              {i < plan.length - 1 && <span className="flex-1 mt-1" style={{ width: 3, backgroundColor: '#E3DED4' }} aria-hidden />}
            </span>

            {/* card */}
            <span
              className="flex flex-1 gap-4 items-center transition-transform group-hover:-translate-y-px"
              style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', padding: '12px 14px', minWidth: 0 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover(t.qf)}
                alt=""
                referrerPolicy="no-referrer"
                style={{ width: 58, height: 76, objectFit: 'cover', border: `2px solid ${INK}`, display: 'block', backgroundColor: '#FEF7E7', flexShrink: 0 }}
              />
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: locked ? MUTE : FULVOUS }}>
                  {weeks[i].toUpperCase()}{locked ? ' · IN THE LIBRARY' : ' · START HERE'}
                </span>
                <span className="block mt-1" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, color: RICH }}>{t.title}</span>
                <span className="block mt-1" style={{ fontSize: 12.5, lineHeight: 1.45, color: BODY, fontWeight: 300 }}>{t.desc}</span>
              </span>
            </span>
          </CheckoutLink>
        )
      })}
    </div>
  )
}
