import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * GET /api/admin/flow/trace?id=<rowId|email>
 *
 * Returns an annotated trace showing which `determineArchetype` rule branch
 * matched (or fell through) for a single submission. This is the
 * server-side ground truth for the Flow page's archetype tracer.
 *
 * Mirrors the conditions in lib/archetypes.ts → determineArchetype().
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: 'id (uuid or email) required' }, { status: 400 })

  const c = client()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const query = isUuid
    ? c.from('submissions').select('email, ai_level, work_area, job_level, main_goal, time_commitment, archetype').eq('id', id)
    : c.from('submissions').select('email, ai_level, work_area, job_level, main_goal, time_commitment, archetype').ilike('email', id)
  const { data: row, error } = await query.order('ts', { ascending: false }).limit(1).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'No matching row' }, { status: 404 })

  const aiLevel        = row.ai_level || ''
  const workArea       = row.work_area || ''
  const jobLevel       = row.job_level || ''
  const mainGoal       = row.main_goal || ''
  const timeCommitment = row.time_commitment || ''

  const techAreas    = ['Coding', 'Data analytics']
  const execRoles    = ['Founder', 'C-Suite', 'VP/Director']
  const growthAreas  = ['Marketing', 'Sales', 'Business operations']

  const workAreaList: string[] = workArea.split(', ').filter(Boolean)
  const isTechWorker   = workAreaList.some((a: string) => techAreas.includes(a))
  const isExec         = execRoles.includes(jobLevel)
  const isGrowthWorker = workAreaList.some((a: string) => growthAreas.includes(a))
  const isHighCommit   = timeCommitment === '3+ hours' || timeCommitment === '1-2 hours'

  // Rule order mirrors lib/archetypes.ts → determineArchetype()
  const rules = [
    {
      rule: '→ Technical Pioneer',
      detail: 'aiLevel = Advanced OR (work_area ∈ {Coding, Data analytics} AND time_commitment ∈ {1-2h, 3+h})',
      matched: aiLevel === 'Advanced' || (isTechWorker && isHighCommit),
    },
    {
      rule: '→ Executive Strategist',
      detail: 'job_level ∈ {Founder, C-Suite, VP/Director} AND main_goal ∈ {Grow my business, Professional growth}',
      matched: isExec && (mainGoal === 'Grow my business' || mainGoal === 'Professional growth'),
    },
    {
      rule: '→ Growth Operator',
      detail: 'work_area ∈ {Marketing, Sales, Business operations} AND main_goal ∈ {Professional growth, Grow my business}',
      matched: isGrowthWorker && (mainGoal === 'Professional growth' || mainGoal === 'Grow my business'),
    },
    {
      rule: '→ Practical Learner (fallback)',
      detail: 'default if none of the above match',
      matched: true,  // always last in the cascade — visualised as the catch-all
    },
  ]

  // Find the FIRST rule that matched (top-down cascade)
  let firstMatchIndex = rules.findIndex(r => r.matched)
  // Only the first match actually "fires" — later matches are eclipsed
  const annotated = rules.map((r, i) => ({
    ...r,
    matched: i === firstMatchIndex && r.matched,
  }))

  const result = ['technical_pioneer', 'executive_strategist', 'growth_operator', 'practical_learner'][firstMatchIndex]

  let reason = ''
  switch (firstMatchIndex) {
    case 0:
      reason = aiLevel === 'Advanced'
        ? `Mapped to Technical Pioneer because ai_level = "Advanced".`
        : `Mapped to Technical Pioneer because work_area includes a tech area (${workAreaList.filter((a: string) => techAreas.includes(a)).join(', ')}) AND time_commitment = "${timeCommitment}".`
      break
    case 1:
      reason = `Mapped to Executive Strategist because job_level = "${jobLevel}" AND main_goal = "${mainGoal}".`
      break
    case 2:
      reason = `Mapped to Growth Operator because work_area includes a growth area (${workAreaList.filter((a: string) => growthAreas.includes(a)).join(', ')}) AND main_goal = "${mainGoal}".`
      break
    case 3:
      reason = `Mapped to Practical Learner by fallback — none of the three more-specific rules above matched this submission's answers.`
      break
  }

  return NextResponse.json({
    email: row.email,
    archetype: row.archetype || result,
    reason,
    answers: {
      ai_level: aiLevel,
      work_area: workArea,
      job_level: jobLevel,
      main_goal: mainGoal,
      time_commitment: timeCommitment,
    },
    steps: annotated,
  })
}
