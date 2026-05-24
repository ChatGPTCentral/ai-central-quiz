import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { allSubmissionsForExport } from '@/lib/kv'
import { parseFilters, filteredSubmissionsAll } from '@/lib/dashboard-queries'

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // If any filter params are present, use the filtered query; otherwise export everything
  const sp = req.nextUrl.searchParams
  const hasFilters = Array.from(sp.keys()).some(k => k !== 'offset')
  const items = hasFilters
    ? await filteredSubmissionsAll(parseFilters(sp))
    : await allSubmissionsForExport()

  const headers = [
    'id', 'source', 'ts', 'name', 'email', 'archetype', 'score',
    'aiLevel', 'workArea', 'learningStyle', 'timeCommitment', 'mainGoal', 'aiTools', 'jobLevel',
    'linkedinUrl', 'photoUrl', 'jobTitle', 'seniority', 'jobFunction', 'department',
    'companyName', 'companyDomain', 'companySize', 'companyIndustry', 'companySubIndustry',
    'companyRevenue', 'companyFunding', 'companyFoundedYear',
    'country', 'region', 'city', 'ageBracket', 'buyingIntent',
    'utmSource', 'utmRef', 'enrichmentStatus',
  ]
  const rows = items.map(s => [
    s.id, s.source || '',
    new Date(s.ts).toISOString(),
    s.name, s.email, s.archetype, s.score ?? '',
    s.aiLevel, s.workArea, s.learningStyle, s.timeCommitment, s.mainGoal, s.aiTools, s.jobLevel,
    s.linkedinUrl || '', s.photoUrl || '', s.jobTitle || '', s.seniority || '',
    s.jobFunction || '', s.department || '',
    s.companyName || '', s.companyDomain || '', s.companySize || '',
    s.companyIndustry || '', s.companySubIndustry || '',
    s.companyRevenue || '', s.companyFunding || '', s.companyFoundedYear ?? '',
    s.country || '', s.region || '', s.city || '',
    s.ageBracket || '', s.buyingIntent || '',
    s.utmSource || '', s.utmRef || '', s.enrichmentStatus || '',
  ])
  const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="submissions-${Date.now()}.csv"`,
    },
  })
}
