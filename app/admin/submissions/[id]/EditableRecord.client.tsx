'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Initial {
  id: string
  name?: string
  linkedinUrl?: string
  photoUrl?: string
  jobTitle?: string
  seniority?: string
  companyName?: string
  companyDomain?: string
  companyIndustry?: string
  country?: string
  region?: string
  city?: string
  ageBracket?: string
  buyingIntent?: string
}

const FIELDS: { key: keyof Omit<Initial, 'id'>; label: string; placeholder: string }[] = [
  { key: 'photoUrl',        label: 'Photo URL',          placeholder: 'https://media.licdn.com/...' },
  { key: 'linkedinUrl',     label: 'LinkedIn URL',       placeholder: 'https://linkedin.com/in/...' },
  { key: 'name',            label: 'Full name',          placeholder: 'Jane Doe' },
  { key: 'jobTitle',        label: 'Job title',          placeholder: 'VP of Marketing' },
  { key: 'seniority',       label: 'Seniority',          placeholder: 'vp / director / manager / ...' },
  { key: 'companyName',     label: 'Company',            placeholder: 'Acme Inc' },
  { key: 'companyDomain',   label: 'Company domain',     placeholder: 'acme.com' },
  { key: 'companyIndustry', label: 'Industry',           placeholder: 'SaaS or Software' },
  { key: 'country',         label: 'Country',            placeholder: 'United States' },
  { key: 'region',          label: 'Region / State',     placeholder: 'California' },
  { key: 'city',            label: 'City',               placeholder: 'San Francisco' },
  { key: 'ageBracket',      label: 'Age bracket',        placeholder: '36-45' },
  { key: 'buyingIntent',    label: 'Buying intent',      placeholder: 'now / soon / researching / not_now' },
]

export default function EditableRecord({ initial }: { initial: Initial }) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    FIELDS.forEach(f => { o[f.key as string] = (initial[f.key] as string) || '' })
    return o
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Photo preview reflects current draft
  const photo = values.photoUrl

  function setField(k: string, v: string) {
    setValues(prev => ({ ...prev, [k]: v }))
    if (saved) setSaved(false)
  }

  async function onSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const body: Record<string, string> = {}
      // Only send changed fields
      for (const f of FIELDS) {
        const cur = values[f.key as string] || ''
        const orig = (initial[f.key] as string) || ''
        if (cur !== orig) body[f.key as string] = cur
      }
      if (Object.keys(body).length === 0) {
        setSaving(false); setSaved(true)
        return
      }
      const res = await fetch(`/api/admin/submissions/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Save failed')
      } else {
        setSaved(true)
        router.refresh()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden mb-6">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#9C9C9C]">Edit record</h2>
          <p className="text-[11px] text-[#9C9C9C] mt-0.5">Manually correct any field — useful for adding a LinkedIn URL or photo by hand.</p>
        </div>
      </header>

      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-[100px_1fr] gap-x-5 gap-y-4">
        {/* Photo preview */}
        <div className="row-span-2">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt="Preview"
              className="w-20 h-20 rounded-full object-cover bg-[#F5F5F5] border border-[#E8E4DF]"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#F5F5F5] border border-[#E8E4DF] flex items-center justify-center text-[#9C9C9C] text-2xl font-black">
              {(values.name || initial.name || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        {/* Photo URL field gets full width */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mb-1">{FIELDS[0].label}</label>
          <input
            value={values.photoUrl}
            onChange={e => setField('photoUrl', e.target.value)}
            placeholder={FIELDS[0].placeholder}
            className="w-full px-3 py-2 border border-[#E8E4DF] rounded-md text-sm outline-none focus:border-[#333333]"
          />
        </div>

        {/* LinkedIn URL aligns under photo URL */}
        <div className="md:col-start-2">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mb-1">{FIELDS[1].label}</label>
          <input
            value={values.linkedinUrl}
            onChange={e => setField('linkedinUrl', e.target.value)}
            placeholder={FIELDS[1].placeholder}
            className="w-full px-3 py-2 border border-[#E8E4DF] rounded-md text-sm outline-none focus:border-[#333333]"
          />
        </div>
      </div>

      {/* Remaining fields */}
      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 border-t border-[#F5F5F5] pt-5">
        {FIELDS.slice(2).map(f => (
          <div key={f.key as string}>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mb-1">{f.label}</label>
            <input
              value={values[f.key as string]}
              onChange={e => setField(f.key as string, e.target.value)}
              placeholder={f.placeholder}
              className="w-full px-3 py-2 border border-[#E8E4DF] rounded-md text-sm outline-none focus:border-[#333333]"
            />
          </div>
        ))}
      </div>

      <footer className="flex items-center justify-between px-5 py-4 border-t border-[#E8E4DF] bg-[#FFFDFA]">
        <div className="text-xs">
          {error && <span className="text-[#BE3B3B]">{error}</span>}
          {saved && !error && <span className="text-[#62A758] font-semibold">✓ Saved</span>}
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-[#333333] text-[#FFFDFA] text-sm font-bold disabled:opacity-40 hover:opacity-90"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </footer>
    </section>
  )
}
