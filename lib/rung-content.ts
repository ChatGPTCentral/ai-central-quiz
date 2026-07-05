// Per-rung results-page copy — one RungConfig per AI Adoption Ladder stage.
// Source: the "Rung-personalized quiz results page" design handoff (turn-3
// cards 3a-3f), with three normalizations agreed with the user:
//   1. No em dashes anywhere; the handoff's " - - " pauses become commas.
//   2. Persona references are tokens ({persona}, {personaPlural}) resolved
//      at render time, so the copy works for every persona, not just the
//      "Decision Maker" constant used in the mocks.
//   3. Every in-copy percentage matches the stage's aheadPct
//      (lib/readiness-type) so the h1, member pass, and chart copy never
//      contradict each other on the same page.
// Copy rules (handoff): sentence case, no terminal period on display lines,
// no emoji, numerals not words, CTAs lowercase verb-first.

import type { StageKey } from './segmentation-v2'

export interface RungConfig {
  /** 1..6 position on the ladder (rendered as "RUNG X OF 6"). */
  rung: number
  /** Ladder class name, uppercase on the pass ("EXPERIMENTER"). */
  className: string
  /** Hero lead paragraph under the h1. */
  heroLead: string
  /** Member pass class line, e.g. "CLASS: EXPERIMENTER · RUNG 3 OF 6". */
  passClass: string
  /** Member pass percentile field. */
  passPct: string
  /** "The bigger picture" section h2. */
  chartTitle: string
  /** "The bigger picture" lead paragraph. */
  chartLead: string
  /** Radar section h2. */
  radarTitle: string
  /** Radar section lead. */
  radarLead: string
  /** Radar footnote (what the orange shape means). */
  radarNote: string
  /** "The prescription" section lead. */
  prescLead: string
  /** Sentence fragment inside the founder letter. */
  founderPath: string
  /** Closing CTA band headline. */
  finalTitle: string
}

const RUNGS: Record<Exclude<StageKey, 'unknown'>, RungConfig> = {
  S0_unaware: {
    rung: 1,
    className: 'UNAWARE',
    heroLead:
      "You haven't used AI yet, which means the fastest wins are still on the table. One 15-minute workflow a week puts you ahead of 84% of the planet by next month",
    passClass: 'CLASS: UNAWARE · RUNG 1 OF 6',
    passPct: 'Day 0, rising',
    chartTitle: '8.1 billion people. Most never start. You just did',
    chartLead:
      'Taking this quiz already separates you from the 84% who never look up. From rung 1, every rep is a rung, the crowd thins fast in your favor',
    radarTitle: 'Blank canvas. Highest ceiling on the ladder',
    radarLead:
      'Nothing to unlearn: no half-habits, no graveyard of abandoned tools. Members who start at rung 1 move fastest in month 1, because the sequence becomes their first habit.',
    radarNote:
      'The orange shape is the median rung-1 member after the first sequence, 1 month, 1 workflow a week',
    prescLead:
      'Every tutorial assumes zero experience and ends with something shipped. You get a sequenced path, not a search bar',
    founderPath: 'it starts at rung 1, built for a {persona}, with nothing assumed',
    finalTitle: 'Everyone above you started exactly here',
  },
  S1_curious: {
    rung: 2,
    className: 'CURIOUS',
    heroLead:
      "You've read the threads, now skip them. Hands-on is 15 minutes away, and one workflow a week puts you ahead of 84% of the planet within a month",
    passClass: 'CLASS: CURIOUS · RUNG 2 OF 6',
    passPct: '62nd, rising fast',
    chartTitle: "8.1 billion people. You're already ahead of 5 billion of them",
    chartLead:
      "You've done the reading, the only thing between you and rung 3 is a first rep, and it's a 15-minute one. From there the crowd thins to millions, not billions",
    radarTitle: 'Prepared mind. Untouched keyboard',
    radarLead:
      'You already know the landscape better than most people using AI daily. Converting that context into reps is the fastest climb on the whole ladder.',
    radarNote:
      'The orange shape is the median rung-2 member after the first sequence, 1 month, 1 workflow a week',
    prescLead:
      'Every tutorial turns reading into a rep: tested by editors, tied to a business outcome, sequenced for your role',
    founderPath: 'it starts at rung 2, built for a {persona}, with the research already done',
    finalTitle: 'Curiosity is 15 minutes from a shipped workflow',
  },
  S2_experimenter: {
    rung: 3,
    className: 'EXPERIMENTER',
    heroLead:
      "You're already hands-on, ahead of 76% of everyone on the planet. What's missing isn't effort. It's a sequence, and yours is below",
    passClass: 'CLASS: EXPERIMENTER · RUNG 3 OF 6',
    passPct: '76th of 8.1B',
    chartTitle: "8.1 billion people. You're ahead of 6.2 billion of them",
    chartLead:
      "That's the comfortable number, {firstName}. The better one: the rungs above you hold fewer people than a mid-size country, and you're already climbing",
    radarTitle: 'Strong instincts. Thin coverage',
    radarLead:
      'Scored from your answers: solid on prompting and tools, near-zero on agents, development, and governance, the 3 areas where {personaPlural} pull ahead this year.',
    radarNote:
      'The orange shape is the median member at your rung after the first sequence, 1 month, 1 workflow a week',
    prescLead:
      'Every tutorial is tested by editors and tied to a real business outcome. You get a sequenced path for {personaPlural}, not a search bar',
    founderPath: 'it starts at rung 3, built for a {persona}, with the noise already cut',
    finalTitle: "AI doesn't have to be complicated",
  },
  S3_practitioner: {
    rung: 4,
    className: 'PRACTITIONER',
    heroLead:
      "Weekly AI on real work already puts you ahead of 86% of the planet. The next rung isn't more effort. It's saved prompts, sharper tools, and workflows your team copies",
    passClass: 'CLASS: PRACTITIONER · RUNG 4 OF 6',
    passPct: '86th of 8.1B',
    chartTitle: "8.1 billion people. You're ahead of 7 billion of them",
    chartLead:
      "From rung 4 the game changes: it's no longer about using AI, it's about how much of your week it runs. Rungs 5 and 6 belong to the people compounding daily, that's one sequence away",
    radarTitle: 'The habit works. Multiply it',
    radarLead:
      'Your weekly rep covers prompting and tools. The next gains sit in agents and governance, the 2 skills that turn personal speed into systems your whole team runs on.',
    radarNote:
      'The orange shape is the median rung-4 member after the advanced sequence: agents, automations, rollout',
    prescLead:
      'Past the basics, the library goes deep: agents, automations, governance playbooks, all tested and tied to outcomes',
    founderPath: 'it starts at rung 4, built for a {persona}, aimed at team-wide leverage',
    finalTitle: 'The habit is built. Now make it compound',
  },
  S4_power_user: {
    rung: 5,
    className: 'POWER USER',
    heroLead:
      'Daily AI across multiple tools puts you ahead of 93% of the planet. What is left is turning personal velocity into systems your whole team ships with',
    passClass: 'CLASS: POWER USER · RUNG 5 OF 6',
    passPct: '93rd of 8.1B',
    chartTitle: '8.1 billion people. 6 million keep your pace',
    chartLead:
      "At rung 5 the ladder stops being about adoption and starts being about output. The last rung belongs to people who ship AI to others, and it's one sequence away",
    radarTitle: 'Deep almost everywhere. One rung left',
    radarLead:
      'Your profile is what rung-3 members aim for. The remaining gap is builder territory: shipping agents and governed workflows other people rely on.',
    radarNote: 'The orange shape is the median builder, where the last sequence lands you',
    prescLead:
      'The advanced shelf: agent architectures, custom GPT ops, governance, the patterns before they are public',
    founderPath: 'it starts at rung 5, built for a {persona}, pointed at builder territory',
    finalTitle: 'You built the speed. Now build the system',
  },
  S5_builder: {
    rung: 6,
    className: 'BUILDER',
    heroLead:
      "You ship AI to customers and team, the 0.04%. Up here the risk isn't falling behind, it's being caught. Weekly editorial drops are the unfair advantage that keeps the gap open",
    passClass: 'CLASS: BUILDER · RUNG 6 OF 6',
    passPct: 'Top 0.04%',
    chartTitle: '8.1 billion people. Roughly 3 million do what you do',
    chartLead:
      'The ladder below you fills up every month, 1.3 billion experimenters, all climbing. Staying rare is a practice: new models, new patterns, new tools, filtered weekly before they trend',
    radarTitle: 'Deep everywhere. The edge is upkeep',
    radarLead:
      "At your level the chart barely moves, until a model release moves it for everyone. The value isn't learning; it's hearing about the shift 6 weeks early.",
    radarNote:
      'The orange line is the frontier as it moves, weekly drops keep your shape pressed against it',
    prescLead:
      'For builders the library is a radar, not a school: 50+ papers and 14,000+ tools filtered weekly into what changes your stack',
    founderPath: 'it starts at rung 6, built for a {persona}, tuned to keep your edge compounding',
    finalTitle: "Stay the one they're all chasing",
  },
}

/** Resolve the rung config for a stage; unknown stages read as rung 2 (Curious). */
export function rungConfig(stage: string | undefined | null): RungConfig {
  return RUNGS[(stage as Exclude<StageKey, 'unknown'>)] ?? RUNGS.S1_curious
}

/**
 * Replace {persona} / {personaPlural} tokens with the persona's display label
 * ("Decision Maker" → plural "Decision Makers").
 */
export function withPersona(copy: string, personaLabel: string): string {
  return copy
    .replace(/\{personaPlural\}/g, `${personaLabel}s`)
    .replace(/\{persona\}/g, personaLabel)
}

/**
 * Replace {firstName} with the visitor's first name. When the name is
 * unknown, a leading ", {firstName}" vocative disappears cleanly
 * ("the comfortable number, {firstName}." → "the comfortable number.").
 */
export function withFirstName(copy: string, firstName: string): string {
  const n = firstName.trim()
  return n
    ? copy.replace(/\{firstName\}/g, n)
    : copy.replace(/,\s*\{firstName\}/g, '').replace(/\{firstName\}/g, 'there')
}
