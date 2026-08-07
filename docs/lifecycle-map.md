# The lifecycle map

Written 2026-08-07, because we had four sequences in flight and no way to say
whether a fifth was a good idea.

## The theory, in three rules

**1. Sequences own states, campaigns work backlogs.** These are different
things and conflating them is what makes the list feel like sprawl.

- A **sequence** is triggered by a state change and runs forever. It is
  machinery. Build once, it works on everyone who ever enters that state.
- A **campaign** is a one-off send to a segment that already exists. It works
  a backlog down. It does not repeat itself.

"Get the 94k who never took the quiz" is a **campaign**. Pass Recovery is a
**sequence**. Counting them together is how you end up feeling like you are
building five things.

**2. One state, one job, one owner.** A person is in exactly one state. Each
state has exactly one job: move them to the next state. If two sequences act
on the same state they compete, and the person gets two asks in a week.

**3. A new sequence is only justified if it owns an unowned state.** Not
because the idea is good. The test is: which state does this own, who owns it
today, and is it better than the incumbent? If the answer is "no state", it is
a campaign, and campaigns are cheap. If the answer is "a state that already has
an owner", fix the owner instead.

Priority = population x value of the move x how much of it is unowned.

## The states, as of 2026-08-07

| # | State | Population | The one job | Owner today | Status |
|---|---|---|---|---|---|
| 1 | Subscriber, never took the quiz | **94,187** | Take the quiz | AI 101 Class 1 | only reaches NEW signups, so 94k unowned |
| 2 | Took quiz, no purchase, first 24h | flow | Buy the $4.99 trial | Pass Recovery | BUILT, NOT PUBLISHED |
| 3 | Took quiz, no purchase, after 24h | **1,310** | Buy the $4.99 trial | nothing | unowned |
| 4 | Clicked checkout, did not pay | flow | Finish the payment | nothing | unowned |
| 5 | On the $4.99 trial | flow | **Stay to the $59.75 annual** | **nothing** | unowned, highest value |
| 6 | Annual customer | 793 premium | Retain, expand | nothing | unowned |
| 7 | Lapsed or disengaged | — | Win back | Re-engagement Sequence | inactive since 2024 |

Live sequences: **one** (AI 101 Course v3). Everything else is draft, inactive,
or does not exist. The feeling of sprawl is not from too many sequences running,
it is from too many being *discussed*.

## Where the money actually is

State 5 is the answer and it has no owner.

Trial to annual was last measured at **36.8%**. Per 100 trials that is
100 x $4.99 + 36.8 x $59.75 = **$2,698**, so **$27 per trial**. Move it to 50%
and the same 100 trials are worth $3,486, or **$34.86 per trial**. That is
**+29% on every trial, forever, with no extra traffic.**

Compare with state 1, the 94k campaign: roughly 55-150 trials, once. Worth
doing, and it is cheap because the segment already exists, but it is a backlog
being worked, not a machine being built.

The order that follows from the theory:

1. **Publish Pass Recovery** (state 2). Already built, waiting on the owner. A
   sequence that exists and is not switched on is the cheapest win available.
2. **Build the trial-to-annual sequence** (state 5). Highest value, zero
   coverage, and it compounds on every future trial.
3. **Run the 94k campaign** (state 1). Cheap, the segment is built, but it is a
   one-off and should be treated as one.
4. Leave states 3, 4, 6, 7 alone until the above are done.

## Segments that back this

- `Quiz takers (has stage)` seg_ddb076ca-2f9a-4d9f-b9e5-7f7aa029f06b, 1,133
- `Never took the quiz` seg_59b00843-8408-4753-af31-9bc05dc20d68, 94,187

Both key on the `stage` custom field, which `/api/submit-quiz-v2` writes on
every completion. **Do not key on the `stage_*` tags:** `lib/beehiiv.ts` adds
them best-effort and non-fatally, so only 203 exist against 1,393 takers.

## The engagement gap, and how not to misread it

| | takers | non-takers |
|---|---|---|
| open rate | 47.99% | 33.36% |
| click rate | 18.89% | 2.77% |
| premium | 2.4% | 0.8% |

This is **selection, not causation**. Engaged readers are the ones who took the
quiz. The correct inference is the unflattering one: the 94k are measurably less
engaged, so any campaign to them should be sized with a *lower* conversion than
the 6.5% taker-to-paid rate, not the same one.
