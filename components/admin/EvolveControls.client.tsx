'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// The supervision controls. Deliberately plain: approve, reject, retire, veto
// a gene, pause everything. Each one posts, logs, and refreshes — no optimistic
// UI, because a control over what real visitors see should show you the state
// the server actually has, not the state you hoped for.

const INK = '#1A1A1A', GREEN = '#2E7D32', RED = '#A31621', MUTE = '#75705F'

async function act(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/evolution', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `failed (${r.status})`)
}

function Btn({ label, color, onClick, small }: { label: string; color: string; onClick: () => Promise<void>; small?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const router = useRouter()
  return (
    <span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr('')
          try { await onClick(); router.refresh() } catch (e) { setErr(e instanceof Error ? e.message : 'failed') }
          setBusy(false)
        }}
        style={{
          border: `2px solid ${color}`, background: busy ? '#EEE' : '#FFFDFA', color,
          fontSize: small ? 10.5 : 12, fontWeight: 700, padding: small ? '2px 7px' : '5px 10px',
          cursor: busy ? 'wait' : 'pointer', marginRight: 6,
        }}
      >
        {busy ? '…' : label}
      </button>
      {err && <span style={{ color: RED, fontSize: 11 }}>{err}</span>}
    </span>
  )
}

export function ApproveControls({ id }: { id: string }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <Btn label="approve" color={GREEN} small onClick={() => act({ action: 'approve', id })} />
      <Btn label="reject" color={RED} small onClick={() => act({ action: 'reject', id })} />
    </span>
  )
}

export function RetireControl({ id }: { id: string }) {
  return <Btn label="retire" color={MUTE} small onClick={() => act({ action: 'retire', id })} />
}

export function AlleleToggle({ slot, allele, enabled }: { slot: string; allele: string; enabled: boolean }) {
  return (
    <Btn
      label={enabled ? 'veto' : 'allow'}
      color={enabled ? RED : GREEN}
      small
      onClick={() => act({ action: 'allele', slot, allele, enabled: !enabled })}
    />
  )
}

export function MasterControls({ enabled, autoApprove }: { enabled: boolean; autoApprove: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: `2px solid ${INK}`, background: enabled ? '#FFFDFA' : '#FDF3F1', padding: '10px 14px', marginBottom: 18 }}>
      <strong style={{ fontSize: 13 }}>
        Evolution is {enabled ? <span style={{ color: GREEN }}>running</span> : <span style={{ color: RED }}>paused</span>}
      </strong>
      <Btn
        label={enabled ? 'pause everything' : 'resume'}
        color={enabled ? RED : GREEN}
        onClick={() => act({ action: 'pause', value: !enabled })}
      />
      <span style={{ fontSize: 12, color: MUTE, marginLeft: 6 }}>
        New pages {autoApprove ? 'go live automatically' : 'wait for your approval'}
      </span>
      <Btn
        label={autoApprove ? 'require my approval' : 'let them go live automatically'}
        color={INK}
        onClick={() => act({ action: 'auto', value: !autoApprove })}
      />
    </div>
  )
}
