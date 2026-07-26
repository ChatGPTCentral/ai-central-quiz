// The free win: a genuinely useful, ready-to-paste AI prompt built from what
// the person ALREADY told us in the quiz (their blocker, their 30-day goal,
// the tools they use, their seniority). No new questions, no migration — every
// input is a column we've collected since launch.
//
// Why a prompt and not a PDF: it's uniquely theirs, it works in 10 seconds, and
// it proves the library's actual promise ("AI made practical for YOUR job")
// better than any testimonial. The close writes itself: this is 1 of 1,200.
//
// Quality bar: this has to be something a professional would actually keep. A
// weak freebie converts worse than no freebie.

export interface FreeWinInput {
  firstName?: string | null
  friction?: string | null      // no_starting_point | no_time | too_noisy | no_trust | cant_build | no_friction
  intent?: string | null        // learn_basics | use_more | first_automation | ship_to_customers | teach_team
  aiTools?: string | null       // CSV: "ChatGPT, Claude, ..."
  jobLevel?: string | null      // Founder | C-Suite | VP/Director | Manager | Individual contributor | ...
}

export interface FreeWin {
  /** Short label for the card eyebrow, e.g. "Your unblock prompt". */
  kind: string
  /** Headline naming what this does for them. */
  title: string
  /** One line on why this one, in their words. */
  why: string
  /** The paste-ready prompt. */
  prompt: string
  /** Which tool to paste it into (their own, when we know it). */
  tool: string
  /** What to expect back, so the win is unmistakable. */
  payoff: string
}

/** Their primary tool, else a sensible default. */
function pickTool(aiTools?: string | null): string {
  const list = (aiTools || '')
    .split(/[,;|]/)
    .map(s => s.trim())
    .filter(s => s && s.toLowerCase() !== 'none')
  const preferred = ['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Perplexity']
  for (const p of preferred) {
    const hit = list.find(t => t.toLowerCase() === p.toLowerCase())
    if (hit) return hit
  }
  return list[0] || 'ChatGPT'
}

/** Role-flavoured noun so the prompt reads like it was written for them. */
function roleContext(jobLevel?: string | null): { role: string; scope: string } {
  const j = (jobLevel || '').toLowerCase()
  if (/founder|c-suite|ceo|owner/.test(j)) return { role: 'founder', scope: 'the business' }
  if (/vp|director|head/.test(j)) return { role: 'director', scope: 'your department' }
  if (/manager/.test(j)) return { role: 'manager', scope: 'your team' }
  if (/student|intern/.test(j)) return { role: 'student', scope: 'your studies' }
  return { role: 'professional', scope: 'your role' }
}

const INTENT_GOAL: Record<string, string> = {
  learn_basics: 'get genuinely fluent with AI',
  use_more: 'use AI properly in your day job',
  first_automation: 'build your first real automation',
  ship_to_customers: 'ship something AI-powered to customers',
  teach_team: 'get your team using AI well',
}

export function buildFreeWin(input: FreeWinInput): FreeWin {
  const tool = pickTool(input.aiTools)
  const { role, scope } = roleContext(input.jobLevel)
  const goal = INTENT_GOAL[input.intent || ''] || 'get more out of AI'
  const friction = input.friction || ''

  // The blocker drives WHICH prompt they get. Each one is a real, working
  // prompt — the kind that belongs in the library, not filler.
  if (friction === 'no_time') {
    return {
      kind: 'Your time-back prompt',
      title: 'Find the 5 hours AI should be taking off your plate',
      why: `You said time is the thing stopping you, so this one starts by finding it.`,
      tool,
      payoff: 'A ranked list of your own tasks with the highest-leverage one written up as a ready-to-run workflow.',
      prompt: `You are an operations analyst who specialises in finding automatable work for a ${role}.

Here is my situation: I am a ${role} responsible for ${scope}. My goal over the next 30 days is to ${goal}. My constraint is time - - I do not have hours to spare learning new tools.

Step 1. Ask me exactly 5 questions, one at a time, about how I actually spend my working week. Keep them short and concrete. Wait for each answer before asking the next.

Step 2. From my answers, list every task that AI could realistically do or halve. For each one give me:
- the task
- hours per week it currently costs me
- how much of it AI can take (none / half / almost all)
- how hard it is to set up (10 minutes / an hour / a project)

Step 3. Rank them by hours saved divided by setup effort, and show the table sorted best-first.

Step 4. Take the single best one and write me the exact prompt or step-by-step workflow to do it, so I can run it today. Be specific - - no generic advice.`,
    }
  }

  if (friction === 'too_noisy') {
    return {
      kind: 'Your signal filter',
      title: 'Cut the AI noise down to the 3 things that matter for you',
      why: `You said there are too many tools and too much noise, so this one filters ruthlessly.`,
      tool,
      payoff: 'A short list of what to actually use, what to ignore, and why - - specific to your job, not generic hype.',
      prompt: `You are a pragmatic AI advisor. Your job is to REMOVE options, not add them. You are allergic to hype.

My context: I am a ${role} responsible for ${scope}. I currently use ${tool}. My goal in the next 30 days is to ${goal}. My problem is that there are too many AI tools and too much noise, and I cannot tell what is actually worth my attention.

Do this:
1. Ask me 3 short questions about what my week actually looks like. One at a time.
2. Then tell me the 3 - - and ONLY 3 - - AI capabilities that would matter most for someone in my position. Not tools, capabilities.
3. For each one, name the single best tool to do it with and say plainly why the alternatives are not worth switching to.
4. Give me an explicit IGNORE list: the popular AI things I should consciously skip for the next 90 days, with one line each on why they are a distraction for me specifically.
5. Finish with the first 20-minute action for capability number 1.

Be opinionated. If something is overhyped, say so.`,
    }
  }

  if (friction === 'no_trust') {
    return {
      kind: 'Your verification prompt',
      title: 'Make AI output you can actually stake your name on',
      why: `You said you do not trust the outputs, so this one builds the check into the work.`,
      tool,
      payoff: 'A reusable pattern that makes the model show its reasoning, flag its own weak spots, and cite what it is unsure about.',
      prompt: `I need you to work in a mode I will call VERIFIED OUTPUT. Follow this structure for the task I give you, every time.

My context: I am a ${role} responsible for ${scope}. My goal in the next 30 days is to ${goal}. My problem is that I cannot tell when your answer is solid and when it is confidently wrong, so I end up double-checking everything and losing the time I saved.

VERIFIED OUTPUT rules:
1. ANSWER - - give your best answer first, clearly.
2. CONFIDENCE - - rate your confidence high, medium or low, and say what that rating is based on.
3. WHAT WOULD MAKE THIS WRONG - - list the specific assumptions you made. If any of them is false, say what breaks.
4. CHECK THIS YOURSELF - - give me the two or three fastest ways I can verify the risky parts, with what a good answer looks like.
5. WHAT I DID NOT USE - - name anything I would need to give you to make this materially better.

Never skip a section. If you are guessing, say the word "guessing".

My first task is: [describe your task here]`,
    }
  }

  if (friction === 'cant_build') {
    return {
      kind: 'Your build plan',
      title: 'Turn the thing in your head into a build you can start tonight',
      why: `You said you want to build something but do not know how, so this one turns the idea into steps.`,
      tool,
      payoff: 'A scoped build plan with the smallest working version you can finish first, and the exact first step.',
      prompt: `You are a technical product mentor for non-engineers. You break intimidating builds into steps a ${role} can actually finish.

My context: I am a ${role} responsible for ${scope}. I want to ${goal}. I use ${tool}. I am NOT a developer, so assume no coding unless it is genuinely unavoidable, and say so plainly when it is.

Step 1. Ask me what I want to build, then ask up to 4 clarifying questions, one at a time.

Step 2. Give me back:
- THE SMALLEST WORKING VERSION: the least I can build that still delivers the core value. Be aggressive about cutting scope.
- THE STACK: exactly which tools, and why each one (prefer no-code and things I already use).
- THE STEPS: numbered, each one finishable in under an hour, in order.
- WHERE PEOPLE GIVE UP: the two steps most likely to stall me and how to get past them.

Step 3. Write out step 1 in full detail so I can start immediately - - the actual clicks, the actual prompt, the actual settings.

Do not give me a lecture. Give me a plan I can execute.`,
    }
  }

  if (friction === 'no_friction') {
    return {
      kind: 'Your leverage audit',
      title: 'You are already ahead. Here is where the next 10x is hiding',
      why: `You said nothing is slowing you down, so this one hunts for the leverage you have not taken yet.`,
      tool,
      payoff: 'An honest audit of where you are still doing work AI should own, aimed at people who are already good at this.',
      prompt: `You are a blunt AI-leverage auditor. Your client is already competent with AI, so skip the basics entirely and do not congratulate me.

My context: I am a ${role} responsible for ${scope}. I use ${tool} regularly. My goal in the next 30 days is to ${goal}. I do not feel blocked - - which probably means I have stopped noticing my own ceiling.

Do this:
1. Ask me 4 sharp questions about how I currently use AI, one at a time. Push on specifics, not vibes.
2. Then tell me where I am still doing work that a well-built system should be doing for me. Be specific and be uncomfortable.
3. Name the highest-leverage thing I am NOT doing - - the one that separates people who use AI from people who have AI working for them while they sleep.
4. Give me a 30-day plan to close that gap, with week-by-week milestones.
5. Tell me the one habit of mine that is most likely capping my ceiling.

Be direct. I would rather be corrected than flattered.`,
    }
  }

  // Default (incl. no_starting_point and unknown): the strongest cold-start prompt.
  return {
    kind: 'Your starting-point prompt',
    title: 'The 30-minute plan that ends "I do not know where to start"',
    why: input.friction === 'no_starting_point'
      ? `You said you do not know where to start, so this one decides for you.`
      : `Built from your answers, so it starts exactly where you are.`,
    tool,
    payoff: 'One concrete first project chosen for you, plus the exact steps to finish it today.',
    prompt: `You are an AI coach who is excellent at removing overwhelm. You give ONE next action, never a menu of options.

My context: I am a ${role} responsible for ${scope}. I use ${tool}. My goal in the next 30 days is to ${goal}. My problem is that there is so much I could do with AI that I end up doing nothing.

Step 1. Ask me 4 short questions about my actual work week, one at a time. Wait for each answer.

Step 2. Then CHOOSE FOR ME - - do not give me options - - the single best first project. It must:
- save me at least an hour a week, every week
- be finishable in one sitting today
- use a tool I already have

Step 3. Explain in one short paragraph why you chose that one over everything else.

Step 4. Walk me through it start to finish, in numbered steps, with the exact prompts to paste. Assume I am smart but busy, and that I will stop if I get confused.

Step 5. Tell me what to do next week once this is working.

Be decisive. If I try to negotiate the scope, hold firm.`,
  }
}
