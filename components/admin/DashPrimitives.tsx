// Shared presentational primitives for the redesigned admin (design:
// "Admin section redesign" 1g — calmer, editorial reporting).

const MUTE = '#9C9C9C'
const INK = '#1A1A1A'
const BORDER = '#E8E4DF'

export interface Kpi {
  label: string
  value: string | number
  hint?: string
  color?: string
}

/** A single framed plate of KPI cells with hairline dividers — replaces a
 *  row of separate rounded stat cards. */
export function KpiPlate({ kpis }: { kpis: Kpi[] }) {
  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4 overflow-hidden"
      style={{ border: `1px solid ${BORDER}`, borderRadius: 8, background: '#FFFFFF' }}
    >
      {kpis.map((k, i) => (
        <div
          key={k.label}
          style={{
            padding: '18px 22px',
            borderRight: (i + 1) % 4 === 0 ? 'none' : `1px solid ${BORDER}`,
            borderBottom: i < kpis.length - (kpis.length % 4 || 4) ? `1px solid ${BORDER}` : 'none',
          }}
        >
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTE }}>{k.label}</p>
          <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums', color: k.color || INK, lineHeight: 1 }}>
            {typeof k.value === 'number' ? k.value.toLocaleString() : k.value}
          </p>
          {k.hint && <p style={{ margin: '7px 0 0', fontSize: 11.5, color: MUTE }}>{k.hint}</p>}
        </div>
      ))}
    </div>
  )
}

/** Editorial section header: bold uppercase label · hairline rule · muted
 *  subtitle on the right. */
export function SectionRule({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-4" style={{ margin: '28px 0 14px' }}>
      <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: INK, whiteSpace: 'nowrap' }}>{label}</span>
      <span className="flex-1" style={{ borderTop: `1px solid ${BORDER}` }} />
      {subtitle && <span style={{ fontSize: 11, color: MUTE, whiteSpace: 'nowrap' }} className="hidden sm:inline">{subtitle}</span>}
    </div>
  )
}

/** Flat calm card (hairline border, gentle radius) for chart panels. */
export function Panel({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
      {(title || subtitle) && (
        <header style={{ padding: '16px 20px 10px' }}>
          {title && <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#333333' }}>{title}</h3>}
          {subtitle && <p style={{ margin: '3px 0 0', fontSize: 11, color: MUTE }}>{subtitle}</p>}
        </header>
      )}
      {children}
    </div>
  )
}
