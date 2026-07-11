# Post-quiz nurture sequence — copy drafts for approval

**Status: BUILT AS A DRAFT AUTOMATION IN BEEHIIV - - nothing sends until you
publish it.** Automation: "Quiz nurture (post-result) - - DRAFT for approval"
(https://app.beehiiv.com/automations/52a2a777-ce63-4bf0-9c34-2fdcc04c3fd0/workflow).
All five bodies below are already loaded into the draft steps; review/edit
there, then publish. Notes vs this doc: E1 opens with "a few days ago" (works
for both fresh takers and the backfill cohort); SK1 is PARKED — /starter-kit
has no email capture (deliberately "no email, no card"), so kit takers are
anonymous and can't receive a delivery email until you decide to add a
capture step. The `{{first_name}}`/`{{stage}}` placeholders may need
re-inserting as merge tags in the Beehiiv editor if they render literally in
the preview.

Audience: quiz-takers WITHOUT the `customer_active` tag. Exit: `purchased` tag
(applied automatically by the Stripe webhook within seconds of a charge).
Branch rule: E2 splits on the Beehiiv `stage` **custom field** (not stage tags,
which accumulate across retakes) - - Early = S0/S1/S2, Deep = S3/S4/S5.
Every link carries `utm_source=lifecycle&utm_campaign=<email>` so per-email
conversion shows up in the dashboard automatically. The exit popup is already
suppressed for these visitors (shipped).

Merge fields available in Beehiiv: `first_name`, `stage` (custom fields).
Fallback for missing first_name: "there".

CTA destinations:
- PAID → https://upgrade.thecentral.ai (swap for the direct Stripe payment
  link if you prefer one-click checkout) + UTM
- FREE → https://quiz.thecentral.ai/starter-kit + UTM

---

## E1 · Day 2 after quiz · everyone

**Subject:** Your {{first_name}}, your AI result said something worth rereading
**Alt subject:** Your {{stage}} result - - and the one move that changes it
**Preview:** Most people misread their own result. Here's what yours actually means.

Hey {{first_name}},

two days ago you took the AI readiness quiz. Quick recap of what your answers
actually said:

You're at the **{{stage}}** rung of the AI adoption ladder. That's not a
score - - it's a position. And positions move.

Here's the thing most people miss: the gap between rungs isn't talent or
time. In almost every case we've measured, it comes down to one thing - -
whether you're following a curriculum or collecting random tips.

The people one rung above you aren't smarter. They just stopped improvising.

Your result page is still live, with the exact tutorials mapped to your
level:

**[See my result again →]** (result page / upgrade.thecentral.ai?utm_source=lifecycle&utm_campaign=e1)

More on Thursday - - I'll show you the single most common mistake people at
your rung make.

- - Alex
AI Central

---

## E2 · Day 4 · BRANCH: Early (stage = S0_unaware / S1_curious / S2_experimenter)

**Subject:** You don't need 100 AI tutorials. You need 3.
**Preview:** The overwhelm is the obstacle. Here's the shortcut.

Hey {{first_name}},

the #1 reason people stay stuck at the early rungs of AI adoption isn't
lack of interest. It's overwhelm. Ten newsletters, a hundred tools, a
thousand hot takes - - and no obvious first step.

So forget the hundred tutorials. You need exactly three:

1. One that sets up your daily AI workspace (15 minutes)
2. One that automates the first task you actually hate doing
3. One that teaches you to write instructions AI can't misread

That's it. That's the difference between "I've tried ChatGPT" and "I use AI
every day."

The library gives you all three in a guided path for your level - - plus the
other 240 when you're ready. **$4.99 for the first month**, cancel in two
clicks.

**[Start with tutorial #1 →]** (upgrade.thecentral.ai?utm_source=lifecycle&utm_campaign=e2_early)

- - Alex

## E2 · Day 4 · BRANCH: Deep (stage = S3_practitioner / S4_power_user / S5_builder)

**Subject:** You're ahead of most people. That's the trap.
**Preview:** The plateau nobody warns Power Users about.

Hey {{first_name}},

your quiz result put you at **{{stage}}** - - ahead of the crowd. Which is
exactly where progress usually dies.

Here's the pattern: once AI saves you a few hours a week, the pressure to
improve disappears. You've got your prompts, your two or three tools, your
routine. Comfortable. And twelve months later the people who kept
systematizing are running circles around you - - shipped automations, custom
GPTs doing real work, workflows that run while they sleep.

The library's advanced tracks are built for exactly this plateau: agent
workflows, tool integrations, the stuff between "power user" and "the
person everyone asks how they did it."

**$4.99 first month.** If it doesn't show you something you don't already
know, cancel in two clicks and keep the change.

**[Show me the advanced tracks →]** (upgrade.thecentral.ai?utm_source=lifecycle&utm_campaign=e2_deep)

- - Alex

---

## E4 · Day 8 · everyone still in sequence

**Subject:** $4.99. Cancel in two clicks. Here's exactly what's inside.
**Preview:** No mystery box - - the full inventory, and the honest math.

Hey {{first_name}},

no story today. Just the facts, because "another subscription" deserves a
straight answer.

**What you get for $4.99:**
- The full AI Central library - - 250+ step-by-step tutorials, sorted by
  level (including a track matched to your quiz result)
- New tutorials added every month
- Templates and prompts you can copy-paste the same day

**What it costs after the first month:** $59.75/year - - that's $4.98/month,
billed yearly. Cancel inside your first month and you pay nothing more.

**The honest math:** one tutorial that saves you a single hour has already
paid for the year several times over.

**[Get the full library - - $4.99 →]** (upgrade.thecentral.ai?utm_source=lifecycle&utm_campaign=e4)

30-day guarantee on everything. If it's not for you, one email and it's
refunded.

- - Alex

---

## E5 · Day 13 · everyone still in sequence · FINAL promo email

**Subject:** Last note about your quiz results
**Preview:** Three doors. Pick one and I'll stop emailing you about this.

Hey {{first_name}},

this is the last email I'll send you about your quiz result - - promised.
Three doors, pick whichever fits:

**1. Go all in.** The library, matched to your level, $4.99 first month.
**[Start now →]** (upgrade.thecentral.ai?utm_source=lifecycle&utm_campaign=e5)

**2. Start free.** The 10 most downloaded tutorials of 2026, no card, no
catch. **[Take the free starter kit →]** (quiz.thecentral.ai/starter-kit?utm_source=lifecycle&utm_campaign=e5)

**3. Just stay.** Do nothing and you'll keep getting the newsletter - - the
best of AI, once a week, free forever.

Whatever you pick, glad you took the quiz.

- - Alex
AI Central

---

## SK1 · Day 0 on `free_course` tag · starter-kit takers

**Subject:** Your 10 free tutorials (start with #3)
**Preview:** Delivery + the one to open first.

Hey {{first_name}},

as promised - - the 10 most downloaded AI Central tutorials of 2026, all in
one doc:

**[Open the starter kit →]** (the kit Google Doc, utm_source=lifecycle&utm_campaign=sk1)

If you only open one today, make it **#3** - - it's the one readers reply
about most, and it takes 15 minutes.

One honest note: these 10 are the sampler. The full library is 250+
tutorials with a guided path for your exact level, and it's $4.99 for the
first month. No pressure - - the sampler is yours either way.

**[See the full library →]** (upgrade.thecentral.ai?utm_source=lifecycle&utm_campaign=sk1)

- - Alex

---

## Build notes (for the Beehiiv automation)

- Entry trigger: quiz signup/completion (the subscribe carries utm_campaign
  quiz_v2) with re-entry OFF; entry filter: does NOT have tag
  `customer_active`.
- Exit condition: tag `purchased` added (webhook applies it on charge).
- E2 branch: condition on custom field `stage` value prefix S0/S1/S2 vs
  S3/S4/S5. Rows with no stage → Early branch (safer default).
- Waits: E1 at +2 days, E2 at +4, E4 at +8, E5 at +13 (from entry).
- SK1: PARKED (see status note at top — no email capture on /starter-kit).
- Backfill (after approval): manually enroll the existing non-buyer
  quiz-takers into the automation from the Beehiiv UI (they enter at the
  top — E1's "a few days ago" copy works for them); enroll in 2-3 chunks
  across consecutive days to stagger volume. The entry gate skips anyone
  already tagged customer_active/purchased automatically.
- Entry-trigger caveat: the signup trigger (campaign=quiz_v2) catches NEW
  subscribers only. Existing newsletter readers who take the quiz don't
  re-fire signup; they're covered by the manual backfill now, and a
  segment-based second trigger can be added later if that group grows.
