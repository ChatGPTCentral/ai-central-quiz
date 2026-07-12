import { redirect } from 'next/navigation'

// The v2 result page was promoted to /result. Preview-era links keep
// working via this redirect (query preserved).
export default function ResultV2Redirect({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === 'string' && v !== '') p.set(k, v)
  }
  const qs = p.toString()
  redirect(qs ? `/result?${qs}` : '/result')
}
