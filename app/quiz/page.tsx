'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * `/quiz` is now an alias of `/quiz-v2`. All traffic is forwarded with
 * every query parameter preserved so embed-mode (`?embed=1&ac-embed-id=…`),
 * UTM tags, prefill emails, and any partner deep-link continue to work.
 *
 * Kept alive (rather than deleted) because:
 *  - Search engines, partner sites, and old GTM snippets may have the URL cached
 *  - The embed snippet's SURVEY_PATHS['quiz'] also points at /quiz-v2 now, but
 *    a small minority of integrations might still hit /quiz directly
 *  - Reverting is one Edit away if v2 ever needs to be pulled
 */
function Redirect() {
  const router = useRouter()
  const sp = useSearchParams()
  useEffect(() => {
    const qs = sp.toString()
    router.replace(qs ? `/quiz-v2?${qs}` : '/quiz-v2')
  }, [router, sp])
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDFA' }}>
      <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: '#E8E4DF', borderTopColor: '#046BB1' }} />
    </div>
  )
}

export default function QuizPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDFA' }}>
        <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: '#E8E4DF', borderTopColor: '#046BB1' }} />
      </div>
    }>
      <Redirect />
    </Suspense>
  )
}
