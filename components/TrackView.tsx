'use client'

import { useEffect, useRef } from 'react'
import { track } from '@/lib/track'

/** Fire-once view beacon for server-rendered pages (landing, result). */
export default function TrackView({ event, props }: { event: string; props?: Record<string, unknown> }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    track(event, props)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
