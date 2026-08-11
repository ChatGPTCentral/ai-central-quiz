'use client'

// PostHog: session replay we can actually read.
//
// WHY, given we already have Clarity. Clarity has no API for recordings or
// heatmaps, only aggregate counts. So the most useful question in the funnel
// - - "show me the last twenty people who reached the name field and quit" - -
// is unanswerable, and every UX decision has been a guess dressed up as a
// hypothesis. PostHog exposes sessions over an API, which turns that guess
// into something I can go and watch.
//
// Runs ALONGSIDE Clarity, deliberately. Nothing is removed until this has
// proved it is better, and the two cost nothing to run together.
//
// No-op until NEXT_PUBLIC_POSTHOG_KEY is set, matching the Clarity pattern, so
// this ships dark and switches on with an env var.

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'
import { isAnalyticsOptedOut } from '@/lib/analytics-optout'

/** The admin area is the CRM. It must never be recorded. */
function isAdminPath(path: string | null): boolean {
  return !!path && path.startsWith('/admin')
}

export default function PostHogProvider() {
  const pathname = usePathname()

  // Session replay is a SEPARATE pipeline from event capture, which is the
  // hole this closes. `before_send` below drops admin EVENTS, and the comment
  // there claimed the admin area was protected, but it never touched the
  // recorder: on 2026-08-09 a replay was captured starting at
  // /admin/submissions, meaning every customer name, email, job title and
  // company on screen went to a third party. Recording is now stopped
  // explicitly whenever the path is under /admin, and never started there.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    if (!(posthog as unknown as { __loaded?: boolean }).__loaded) return
    try {
      if (isAdminPath(pathname)) posthog.stopSessionRecording()
      else if (!isAnalyticsOptedOut()) posthog.startSessionRecording()
    } catch { /* analytics must never break the app */ }
  }, [pathname])

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    // Our own testing is excluded per device, see lib/analytics-optout.ts. At
    // current volume this is not a rounding error: the day replay went live it
    // captured three sessions, at least one of which was us. Checked before
    // init so an opted-out device never loads the SDK at all, which means no
    // recording is ever made, not merely one we agree to ignore later.
    if (isAnalyticsOptedOut()) {
      try { posthog.opt_out_capturing() } catch { /* not loaded, nothing to opt out of */ }
      return
    }

    // Guard against double-init across client navigations.
    if ((posthog as unknown as { __loaded?: boolean }).__loaded) return

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,

      // Never START the recorder on an admin page. The effect above handles
      // the client-side navigation case; this handles a direct load of
      // /admin, which would otherwise be recording before any effect runs.
      disable_session_recording: isAdminPath(window.location.pathname),

      // Unhandled errors, with a stack trace. Enabled in the PostHog project
      // too, but stated here as well so the behaviour is visible in the code
      // rather than only in a settings page nobody reads.
      //
      // This is the check we did not have. Both of 2026-08-07's bugs were
      // unhandled client exceptions - - the wheel arm's hydration failure and
      // the "Application error" screens - - and both were found by accident,
      // one of them fourteen hours late. Clarity could only ever say "12 script
      // errors on /result", which is a number you cannot act on.
      capture_exceptions: true,

      // DEAD CLICKS, WITH THE ELEMENT ATTACHED.
      //
      // This was off, and it is the single reason "which element is dead?" has
      // been unanswerable. Clarity counts dead clicks per URL and its export
      // API cannot say which element was clicked, so 150 dead clicks on
      // /quiz-v2 was a number with no next step. PostHog captures a
      // $dead_click carrying the elements chain, which turns the same number
      // into a selector we can go and fix.
      //
      // A dead click is someone deciding to act and getting nothing back. It
      // is the cheapest conversion loss there is, because the intent already
      // exists and only the wiring is missing.
      capture_dead_clicks: true,

      // Rage clicks: the same signal, angrier. Both are cheap events, only
      // fired when a person is already frustrated, so the volume is tiny.
      rageclick: true,

      // The DOM detail behind autocapture, which is what makes a dead click
      // actionable rather than a tally. Without it every click reads as
      // "something on this page".
      capture_heatmaps: true,

      session_recording: {
        // NON-NEGOTIABLE. The quiz collects a name and an email, and the
        // checkout collects card details. Replay records the DOM, so without
        // this we would be shipping our readers' personal data to a third
        // party in order to look at button placement. Masking everything typed
        // still shows WHERE someone hesitated, which is the entire reason we
        // want replay - - we need to see that they stalled on the name field,
        // not what their name is.
        maskAllInputs: true,
        maskTextSelector: '[data-ph-mask]',
        // Stripe and YouTube iframes are someone else's DOM. Never record them.
        blockSelector: 'iframe',
      },

      // The admin area shows real customer records. Recording it would put the
      // whole CRM into replay for the sake of watching myself click around.
      before_send: (event) => {
        if (!event) return null
        const url = String(event.properties?.$current_url ?? '')
        if (url.includes('/admin')) return null
        return event
      },
    })
  }, [])

  return null
}

/**
 * Tie a session to the person, so a replay can be found from a submission.
 *
 * Call once the quiz knows who someone is. Uses the SUBMISSION ID as the
 * distinct id rather than the email: it is the key everything else in this
 * codebase joins on, and it keeps raw email out of a third party by default.
 * Email goes in as a property so a session is still searchable by it when we
 * need that, which is a deliberate, narrow exception rather than the default.
 */
export function identifyPerson(input: {
  submissionId?: string | null
  email?: string | null
  stage?: string | null
  score?: number | null
}): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
  if (!input.submissionId) return
  if (isAnalyticsOptedOut()) return
  try {
    posthog.identify(input.submissionId, {
      email: input.email ?? undefined,
      stage: input.stage ?? undefined,
      score: input.score ?? undefined,
    })
  } catch { /* analytics must never break the funnel */ }
}

/** Mark the quiz step someone reached, so drop-off is queryable by question. */
export function trackQuizStep(step: number, questionId: string | null): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
  if (isAnalyticsOptedOut()) return
  try {
    posthog.capture('quiz_step_viewed', { step, question_id: questionId })
  } catch { /* never break the funnel */ }
}
