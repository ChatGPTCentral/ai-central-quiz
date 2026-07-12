// Manual "Pull now" for Clarity snapshots (button on /admin/funnel).
// Same snapshot as the cron, admin-gated; counts against Clarity's
// 10-calls/day quota (each run spends 4), so it's a button, not a poller.

import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { clarityConfigured, snapshotClarity } from '@/lib/clarity'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clarityConfigured()) {
    return NextResponse.json({ error: 'CLARITY_API_TOKEN is not set on this deployment' }, { status: 400 })
  }
  try {
    const result = await snapshotClarity()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
