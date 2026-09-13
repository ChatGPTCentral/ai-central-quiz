// Merged into /admin/cohorts on 2026-09-13 (owner: "perché abbiamo ancora
// una sezione insights, cohorts, experiments, daily digest" — completing
// the owner's own 2026-08-30 ask, half-done the day before when learnings
// folded in). The route stays so old links and bookmarks keep working.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function InsightsRedirect() {
  redirect('/admin/cohorts')
}
