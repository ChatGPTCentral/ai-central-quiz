import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { todayTrialCount } from '@/lib/trial-entries'
import { getTrialSupplyState, raiseTrialSupply, setTrialSupplyEnabled } from '@/lib/trial-supply-cap'

export const dynamic = 'force-dynamic'

// The owner's own control on the real daily $4.99 supply cap (2026-09-04).
// Reachable from the trial-supply alert email so a raise is one click from
// his phone: this page performs the raise itself when ?raise=N is present
// (GET, not a form) then redirects to the clean URL, same one-tap
// convenience as an unsubscribe link. /admin's own middleware already gates
// every page under here on his session cookie — no separate check needed.
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

const INK = '#333333'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const HAIR = '#E8E2D4'
const GREEN = '#2D6A26'
const RED = '#BE3B3B'

export default async function TrialSupplyPage({ searchParams }: { searchParams: { raise?: string; cap?: string } }) {
  const c = db()
  const raiseBy = Number(searchParams.raise)
  if ([5, 10, 15].includes(raiseBy)) {
    await raiseTrialSupply(raiseBy, c)
    redirect('/admin/trial-supply')
  }
  // ?cap=on|off, same one-tap GET shape as ?raise. The cap is a PRICE
  // control, so the owner must be able to pull it himself without waiting
  // for anyone: off means everyone keeps $4.99 and the result page stops
  // saying anything about a daily supply.
  if (searchParams.cap === 'on' || searchParams.cap === 'off') {
    await setTrialSupplyEnabled(searchParams.cap === 'on', c)
    redirect('/admin/trial-supply')
  }

  const [count, supply] = await Promise.all([todayTrialCount(c), getTrialSupplyState(c)])
  const exhausted = !!supply.exhaustedAt

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-black text-[#333333] mb-1">Trial supply, today</h1>
      <p className="text-sm mb-6" style={{ color: MUTE }}>
        The real, discretionary cap on $4.99 trials for the UTC day. Raising it only affects arrivals from
        this moment on — anyone whose personal window already started keeps their $4.99 regardless.
      </p>

      <div style={{ marginBottom: 16, padding: '12px 16px', border: `1px solid ${INK}`, background: supply.enabled ? CREAM : '#FFFFFF' }}>
        <div className="flex items-center justify-between gap-4">
          <span style={{ fontSize: 13, fontWeight: 800, color: supply.enabled ? GREEN : MUTE }}>
            {supply.enabled
              ? 'The cap is ON. The result page states the daily limit.'
              : 'The cap is OFF. No limit, and the page says nothing about supply.'}
          </span>
          <a
            href={`/admin/trial-supply?cap=${supply.enabled ? 'off' : 'on'}`}
            style={{ fontSize: 13, fontWeight: 800, color: supply.enabled ? RED : GREEN, textDecoration: 'underline', whiteSpace: 'nowrap' }}
          >
            {supply.enabled ? 'switch it off' : 'switch it on'}
          </a>
        </div>
      </div>

      <div style={{ border: `1px solid ${INK}`, background: '#FFFFFF' }}>
        <div style={{ padding: '16px 20px', background: CREAM, borderBottom: `1px solid ${INK}` }}>
          <div className="flex items-baseline justify-between">
            <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{count} sold today</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>limit {supply.limit}</span>
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: exhausted ? RED : GREEN, margin: 0 }}>
            {exhausted
              ? `$4.99 is closed for new arrivals since ${new Date(supply.exhaustedAt!).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}. New visitors now see $14.95.`
              : `$4.99 is open. ${Math.max(0, supply.limit - count)} left before it closes for new arrivals today.`}
          </p>

          <div className="flex items-center flex-wrap" style={{ gap: 10, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${HAIR}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: MUTE, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Raise today&apos;s limit
            </span>
            {[5, 10, 15].map(n => (
              <a
                key={n}
                href={`/admin/trial-supply?raise=${n}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${INK}`, color: INK, fontWeight: 800, fontSize: 13,
                  padding: '8px 16px', textDecoration: 'none',
                }}
              >
                +{n}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
