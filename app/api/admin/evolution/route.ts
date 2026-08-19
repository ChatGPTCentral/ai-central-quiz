// The supervision controls behind /admin/evolve. Every action is a deliberate
// human decision and every one is written to evolution_log, so the page can
// never change without a record of who changed it and when.
import { NextRequest, NextResponse } from 'next/server'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { db } from '@/lib/evolution'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; slot?: string; allele?: string; enabled?: boolean; value?: boolean }
  const c = db()
  const now = new Date().toISOString()
  const log = (action: string, detail: Record<string, unknown>) =>
    c.from('evolution_log').insert({ generation: 0, action, detail: { ...detail, by: 'owner' } })

  switch (body.action) {
    case 'approve': {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      // Approved individuals start small: the cron will grow them if the
      // genes earn it, so approving is permission to compete, not a promotion.
      await c.from('page_individuals').update({ approved_at: now, approved_by: 'owner', weight: 0.08 }).eq('id', body.id)
      await log('approve', { id: body.id })
      return NextResponse.json({ ok: true })
    }
    case 'reject': {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      await c.from('page_individuals').update({ rejected_at: now, retired_at: now, weight: 0 }).eq('id', body.id)
      await log('reject', { id: body.id })
      return NextResponse.json({ ok: true })
    }
    case 'retire': {
      if (!body.id || body.id === 'baseline') return NextResponse.json({ error: 'the baseline is the control and cannot be retired' }, { status: 400 })
      await c.from('page_individuals').update({ retired_at: now, weight: 0 }).eq('id', body.id)
      await log('retire', { id: body.id })
      return NextResponse.json({ ok: true })
    }
    case 'allele': {
      if (!body.slot || !body.allele) return NextResponse.json({ error: 'slot and allele required' }, { status: 400 })
      await c.from('page_genes').update({ enabled: body.enabled === true }).eq('slot', body.slot).eq('allele', body.allele)
      // Disabling a gene must also stop the pages already carrying it, or the
      // veto would only apply to future breeding.
      if (body.enabled === false) {
        const { data } = await c.from('page_individuals').select('id, genome').is('retired_at', null)
        for (const row of (data ?? []) as { id: string; genome: Record<string, string> }[]) {
          if (row.id !== 'baseline' && row.genome?.[body.slot] === body.allele) {
            await c.from('page_individuals').update({ retired_at: now, weight: 0 }).eq('id', row.id)
          }
        }
      }
      await log('allele', { slot: body.slot, allele: body.allele, enabled: body.enabled === true })
      return NextResponse.json({ ok: true })
    }
    case 'pause':
    case 'auto': {
      const { data } = await c.from('app_settings').select('value').eq('key', 'evolution').maybeSingle()
      const cur = (data?.value ?? {}) as Record<string, unknown>
      const next = body.action === 'pause'
        ? { ...cur, enabled: body.value === true }
        : { ...cur, auto_approve: body.value === true }
      await c.from('app_settings').upsert({ key: 'evolution', value: next }, { onConflict: 'key' })
      await log(body.action, next)
      return NextResponse.json({ ok: true, config: next })
    }
    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }
}
