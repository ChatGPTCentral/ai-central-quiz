// This page is gone (owner, 2026-08-23: "merging therefore this with the
// retry table feature. we dont need to see all those buttons that you can
// fold into"). Every trial and its status, plus the retry queue as a
// toggle, now live together on /admin/revenue/trials — one dataset, one
// screen, instead of two that could drift (and did: see the Charge column
// fix earlier the same day). This keeps the old URL working.

import { redirect } from 'next/navigation'

export default function TrialRecoveryRedirect() {
  redirect('/admin/revenue/trials?nonpaying=1')
}
