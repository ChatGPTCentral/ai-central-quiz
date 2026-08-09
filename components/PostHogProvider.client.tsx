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
import posthog from 'posthog-js'

export default function PostHogProvider() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return
    // Guard against double-init across client navigations.
    if ((posthog as unknown as { __loaded?: boolean }).__loaded) return

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,

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
  try {
    posthog.capture('quiz_step_viewed', { step, question_id: questionId })
  } catch { /* never break the funnel */ }
}
