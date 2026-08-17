import { planForStage } from '@/components/result2/StudyPlan'

// The answer-echo pitch — result_page_v3's `research` arm, research play #2.
//
// THE MECHANISM (Noar et al. 2007, 57-study meta-analysis): a message
// tailored on several personal factors reliably beats a generic one, and the
// strongest form restates the person's OWN words before making the ask. So
// this block opens the offer section by quoting their answers back, and maps
// each answer to a NAMED tutorial — imported from the study plan's own
// arrays, so the pitch can never name a tutorial the plan does not deliver.
//
// HONESTY RULES. Every line renders ONLY when its answer exists; an echo of
// an answer nobody gave is exactly the fake personalization a professional
// audience smells. Fewer than two real echoes and the caller falls back to
// the generic heading — a one-line echo reads as mail merge, not diagnosis.
// The named tutorials come from the person's own band (early or deep), so a
// Builder is never promised the beginner setup guide.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const FULVOUS = '#E48715'

export type EchoFields = {
  workArea?: string | null
  hoursLost?: number | null
  hoursWouldUseFor?: string | null
  aiTools?: string | null
  stageClassName: string
}

type EchoLine = { said: string; then: string }

/** Build the echo lines from what this person actually answered. */
export function buildEchoLines(f: EchoFields, stageKey?: string | null): EchoLine[] {
  const plan = planForStage(stageKey)
  const lines: EchoLine[] = []

  const area = (f.workArea || '').split(',')[0]?.trim()
  if (area) {
    // The work-focused pick per band: presentations for the early band, the
    // consultant-grade prompting pack for the deep one.
    const t = plan[1]
    lines.push({ said: `You work in ${area}`, then: `start with “${t.title}” — ${t.desc.toLowerCase()}` })
  }

  if (typeof f.hoursLost === 'number' && f.hoursLost > 0) {
    const t = plan[0]
    lines.push({
      said: `You said AI could hand you back about ${f.hoursLost} hour${f.hoursLost === 1 ? '' : 's'} a week`,
      then: `“${t.title}” is step one tonight — ${t.desc.toLowerCase()}`,
    })
  }

  const tools = (f.aiTools || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 2)
  if (tools.length) {
    const t = plan[plan.length - 1]
    lines.push({
      said: `You already use ${tools.join(' and ')}`,
      then: `“${t.title}” takes you past the default settings`,
    })
  }

  if (f.hoursWouldUseFor) {
    lines.push({ said: `You'd spend the reclaimed time on ${f.hoursWouldUseFor.toLowerCase()}`, then: 'the plan is sequenced so the winning-back starts in week 1' })
  }

  return lines
}

export function AnswerEcho({ lines, stageClassName }: { lines: EchoLine[]; stageClassName: string }) {
  return (
    <div className="mt-6" style={{ maxWidth: 660 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {lines.map(l => (
          <li key={l.said} style={{ borderLeft: `4px solid ${FULVOUS}`, backgroundColor: '#FFFFFF', padding: '12px 16px', marginBottom: 10 }}>
            <span className="block" style={{ fontSize: 15, fontWeight: 600, color: RICH, lineHeight: 1.4 }}>{l.said}.</span>
            <span className="block mt-0.5" style={{ fontSize: 13.5, fontWeight: 300, color: BODY, lineHeight: 1.5 }}>So {l.then}.</span>
          </li>
        ))}
      </ul>
      <p className="mt-4" style={{ fontSize: 15.5, lineHeight: 1.55, color: INK, fontWeight: 500, maxWidth: 640 }}>
        {stageClassName}s close this gap the same way every time: structured practice on real work, one tutorial at a
        time. That is exactly what the library is.
      </p>
    </div>
  )
}
