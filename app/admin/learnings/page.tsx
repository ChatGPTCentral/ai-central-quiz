// Merged into /admin/cohorts on 2026-09-12 (owner: "learnings, cohort ed
// experiments devono diventare una cosa sola"). This page only ever read
// cohort_learnings and linked out to /admin/cohorts for the live math on
// half its own rows — now it's all one page. The route stays so old links
// and bookmarks keep working.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function LearningsRedirect() {
  redirect('/admin/cohorts')
}
