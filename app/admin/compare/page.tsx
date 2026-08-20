// Side by side merged into /admin/experiments on 2026-08-20 (owner: the stats
// and the diff are two halves of one question). The route stays so old links,
// bookmarks and the ARMS documentation keep working.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function CompareRedirect({ searchParams }: { searchParams: { exp?: string; w?: string } }) {
  const q = new URLSearchParams()
  if (searchParams.exp) q.set('exp', searchParams.exp)
  if (searchParams.w) q.set('w', searchParams.w)
  redirect(`/admin/experiments${q.toString() ? `?${q}` : ''}`)
}
