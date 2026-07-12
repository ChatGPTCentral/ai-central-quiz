// Daily Clarity snapshot — Vercel Cron (vercel.json, 06:30 UTC, before the
// 07:00 digest) with Authorization: Bearer CRON_SECRET, same contract as
// /api/cron/bandit. Pulls the trailing day per dimension and persists into
// clarity_daily; the export API itself forgets everything after 3 days.

import { NextRequest, NextResponse } from 'next/server'
import { clarityConfigured, snapshotClarity } from '@/lib/clarity'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!clarityConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'CLARITY_API_TOKEN not set' })
  }
  try {
    const result = await snapshotClarity()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
