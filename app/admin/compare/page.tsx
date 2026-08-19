// SIDE BY SIDE — the two versions of a page, on screen together.
//
// WHY (owner, 2026-08-19): "what's impossible for me is to understand the
// difference between pages when you test things." Numbers about a variant
// are not the variant. This renders BOTH arms of a running experiment in
// two live frames using the preview parameters, so no exposure is recorded
// and nothing here can pollute a result. Scroll them and the difference is
// simply visible.

import { db } from '@/lib/revenue-shared'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const INK = '#1A1A1A', MUTE = '#75705F', PAPER = '#FFFDFA', LATTE = '#FEF7E7'
const GREEN = '#2E7D32', BLUE = '#3B5C8F'

type Exp = {
  key: string; name: string; page: string; status: string
  variants: { key: string; name?: string; weight?: number }[]; primary_metric: string | null
}

/** Each arm as a URL. Control is the page with no preview parameter; the
 *  variant carries the same preview the flow lab uses. An experiment with no
 *  entry here still lists, it just cannot be framed until its parameter is
 *  added — better than silently showing the wrong thing. */
const ARMS: Record<string, { base: string; variant: string; label: string; sample?: boolean; anchor?: string }> = {
  entry_microcopy_v1: { base: '/', variant: 'xv=microcopy', label: 'microcopy' },
  // #offer: the change is 8% down the page, so a frame showing the top made
  // the two arms look identical (owner, 2026-08-19). Land on the difference.
  result_page_v3: { base: '/result', variant: 'xv=research', label: 'research', sample: true, anchor: 'offer' },
  quiz_flow_v2: { base: '/quiz-v2', variant: 'qf=v2', label: 'flow2' },
}
const SAMPLE = 'name=Moshe%20Epstein&score=77&persona=maker&stage=S3_practitioner&id=03a3224c-d974-4ff9-971b-65481171f384'

export default async function ComparePage({ searchParams }: { searchParams: { exp?: string; w?: string } }) {
  let exps: Exp[] = []
  try {
    const { data } = await db().from('experiments')
      .select('key, name, page, status, variants, primary_metric')
      .in('status', ['running', 'paused']).order('status')
    exps = (data ?? []) as Exp[]
  } catch { /* none */ }

  const active = exps.find(e => e.key === searchParams.exp) ?? exps[0] ?? null
  const arm = active ? ARMS[active.key] : undefined
  const phone = searchParams.w === 'phone'

  const hash = arm?.anchor ? `#${arm.anchor}` : ''
  const controlUrl = arm ? (arm.sample ? `${arm.base}?${SAMPLE}${hash}` : `${arm.base}${hash}`) : 'about:blank'
  const variantUrl = arm ? (arm.sample ? `${arm.base}?${SAMPLE}&${arm.variant}${hash}` : `${arm.base}?${arm.variant}${hash}`) : 'about:blank'

  // WHAT CHANGED, computed rather than described: fetch both arms and diff
  // their visible text. This is the answer to "the pages look the same" —
  // either it lists real differences, or the test genuinely changes nothing
  // a person can see, which is worth knowing immediately.
  let added: string[] = [], removed: string[] = []
  if (arm) {
    try {
      const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://quiz.thecentral.ai'
      const strip = (h: string): string[] => {
        const noScript = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
        return noScript.replace(/<[^>]+>/g, '\n').split('\n')
          .map(t => t.replace(/\s+/g, ' ').trim()).filter(t => t.length > 24)
      }
      const [ra, rb] = await Promise.all([
        fetch(`${origin}${controlUrl.split('#')[0]}`, { cache: 'no-store' }).then(r => r.text()),
        fetch(`${origin}${variantUrl.split('#')[0]}`, { cache: 'no-store' }).then(r => r.text()),
      ])
      const A = strip(ra), B = strip(rb)
      const inA: Record<string, true> = {}, inB: Record<string, true> = {}
      A.forEach(t => { inA[t] = true }); B.forEach(t => { inB[t] = true })
      const uniq = (arr: string[], other: Record<string, true>) => {
        const seen: Record<string, true> = {}
        return arr.filter(t => !other[t] && !seen[t] && (seen[t] = true)).slice(0, 8)
      }
      added = uniq(B, inA)
      removed = uniq(A, inB)
    } catch { /* frames still render; the diff panel simply says nothing */ }
  }

  const tab: React.CSSProperties = { padding: '7px 12px', border: `2px solid ${INK}`, background: PAPER, color: INK, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }
  const tabOn: React.CSSProperties = { ...tab, background: INK, color: LATTE }

  const Frame = ({ src, label, sub, accent }: { src: string; label: string; sub: string; accent: string }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: `2px solid ${INK}`, borderBottom: 'none', background: LATTE }}>
        <span style={{ width: 10, height: 10, background: accent, display: 'inline-block' }} />
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <span style={{ fontSize: 11, color: MUTE }}>{sub}</span>
        <a href={src} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 11, color: BLUE }}>open ↗</a>
      </div>
      <div style={{ border: `2px solid ${INK}`, background: '#fff', height: '78vh', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
        <iframe
          src={src}
          title={label}
          style={phone
            ? { width: 420, height: '95vh', border: 0, transform: 'scale(0.82)', transformOrigin: 'top center' }
            : { width: '100%', height: '100%', border: 0 }}
        />
      </div>
    </div>
  )

  return (
    <div style={{ padding: '18px 22px 40px', maxWidth: 1500 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', margin: 0, color: INK }}>Side by side</h1>
      <p style={{ fontSize: 13, color: MUTE, margin: '6px 0 14px', maxWidth: 820, lineHeight: 1.5 }}>
        Both versions of a page being tested, live, in one view. The frames use preview parameters, so nothing here is
        counted as an exposure or a visit.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {exps.map(e => (
          <a key={e.key} href={`/admin/compare?exp=${e.key}${phone ? '&w=phone' : ''}`} style={active?.key === e.key ? tabOn : tab}>
            {e.page} · {e.key}
          </a>
        ))}
        {!exps.length && <span style={{ fontSize: 13, color: MUTE }}>No experiment is running right now.</span>}
      </div>

      {active && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: MUTE }}>
            <strong style={{ color: INK, fontSize: 13 }}>{active.name}</strong>
            <span>decided on <strong style={{ color: INK }}>{active.primary_metric}</strong></span>
            {(active.variants ?? []).map(v => (
              <span key={v.key}>· {v.key} <strong style={{ color: INK }}>{Math.round((v.weight ?? 0) * 100)}%</strong></span>
            ))}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <a href={`/admin/compare?exp=${active.key}`} style={phone ? tab : tabOn}>desktop</a>
              <a href={`/admin/compare?exp=${active.key}&w=phone`} style={phone ? tabOn : tab}>phone</a>
            </span>
          </div>

          {arm && (added.length || removed.length) ? (
            <div style={{ border: `2px solid ${INK}`, background: PAPER, padding: '12px 14px', marginBottom: 12 }}>
              <strong style={{ fontSize: 13 }}>What actually changes</strong>
              <span style={{ fontSize: 11.5, color: MUTE, marginLeft: 8 }}>
                computed by fetching both arms and diffing their visible text, just now
              </span>
              <div style={{ display: 'flex', gap: 18, marginTop: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: GREEN, fontWeight: 700, marginBottom: 4 }}>ONLY IN THE VARIANT</div>
                  {added.map(t => <div key={t} style={{ fontSize: 12, marginBottom: 4, color: INK }}>+ {t.slice(0, 130)}</div>)}
                </div>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#A31621', fontWeight: 700, marginBottom: 4 }}>ONLY IN THE CONTROL</div>
                  {removed.map(t => <div key={t} style={{ fontSize: 12, marginBottom: 4, color: MUTE }}>− {t.slice(0, 130)}</div>)}
                </div>
              </div>
            </div>
          ) : arm ? (
            <div style={{ border: `2px solid #A31621`, background: '#FDF3F1', padding: '12px 14px', marginBottom: 12, fontSize: 13 }}>
              <strong style={{ color: '#A31621' }}>These two pages render identical text.</strong> If that is not the
              intent, the variant is not being applied — check the preview parameter before trusting any result from
              this experiment.
            </div>
          ) : null}

          {arm ? (
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <Frame src={controlUrl} label="Control" sub="what most people see today" accent={MUTE} />
              <Frame src={variantUrl} label={`Variant · ${arm.label}`} sub="the change being tested" accent={GREEN} />
            </div>
          ) : (
            <p style={{ fontSize: 13, color: MUTE }}>
              No preview mapping for this experiment yet, so it cannot be framed. Add it to ARMS in
              app/admin/compare/page.tsx.
            </p>
          )}

          <p style={{ fontSize: 11.5, color: MUTE, marginTop: 10, maxWidth: 900, lineHeight: 1.5 }}>
            Result-page frames use one real submission, so the personalization is genuine rather than placeholder text.
            Scroll each frame on its own; what differs between them is exactly what the experiment is measuring.
          </p>
        </>
      )}
    </div>
  )
}
