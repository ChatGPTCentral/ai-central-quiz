'use client'

import { useEffect, useRef, useState } from 'react'

const US_PEOPLE = [
  { name: 'James R.', flag: '🇺🇸', city: 'New York' },
  { name: 'Sarah M.', flag: '🇺🇸', city: 'San Francisco' },
  { name: 'Michael T.', flag: '🇺🇸', city: 'Chicago' },
  { name: 'Emily K.', flag: '🇺🇸', city: 'Austin' },
  { name: 'David L.', flag: '🇺🇸', city: 'Boston' },
  { name: 'Jennifer W.', flag: '🇺🇸', city: 'Seattle' },
  { name: 'Robert H.', flag: '🇺🇸', city: 'Denver' },
  { name: 'Lisa C.', flag: '🇺🇸', city: 'Atlanta' },
  { name: 'Christopher B.', flag: '🇺🇸', city: 'Miami' },
  { name: 'Amanda S.', flag: '🇺🇸', city: 'Dallas' },
  { name: 'Daniel P.', flag: '🇺🇸', city: 'Los Angeles' },
  { name: 'Michelle G.', flag: '🇺🇸', city: 'Phoenix' },
  { name: 'Kevin O.', flag: '🇺🇸', city: 'Nashville' },
  { name: 'Rachel N.', flag: '🇺🇸', city: 'Portland' },
  { name: 'Andrew F.', flag: '🇺🇸', city: 'Minneapolis' },
  { name: 'Jessica V.', flag: '🇺🇸', city: 'Philadelphia' },
  { name: 'Ryan D.', flag: '🇺🇸', city: 'San Diego' },
  { name: 'Lauren Q.', flag: '🇺🇸', city: 'Detroit' },
  { name: 'Matthew Z.', flag: '🇺🇸', city: 'Charlotte' },
  { name: 'Stephanie J.', flag: '🇺🇸', city: 'Houston' },
]

const EU_PEOPLE = [
  { name: 'Oliver B.', flag: '🇬🇧', city: 'London' },
  { name: 'Sophie L.', flag: '🇫🇷', city: 'Paris' },
  { name: 'Hans M.', flag: '🇩🇪', city: 'Berlin' },
  { name: 'Emma V.', flag: '🇳🇱', city: 'Amsterdam' },
  { name: 'Luca R.', flag: '🇮🇹', city: 'Milan' },
  { name: 'Charlotte D.', flag: '🇧🇪', city: 'Brussels' },
  { name: 'Erik S.', flag: '🇸🇪', city: 'Stockholm' },
  { name: 'Ana P.', flag: '🇪🇸', city: 'Madrid' },
  { name: 'Niels H.', flag: '🇩🇰', city: 'Copenhagen' },
  { name: 'Claire F.', flag: '🇨🇭', city: 'Zurich' },
  { name: 'Marco T.', flag: '🇵🇹', city: 'Lisbon' },
  { name: 'Ingrid K.', flag: '🇳🇴', city: 'Oslo' },
  { name: 'Jan W.', flag: '🇵🇱', city: 'Warsaw' },
  { name: 'Lea G.', flag: '🇦🇹', city: 'Vienna' },
  { name: 'Pieter C.', flag: '🇧🇪', city: 'Antwerp' },
]

function pickPerson() {
  const useUS = Math.random() < 0.7
  const pool = useUS ? US_PEOPLE : EU_PEOPLE
  return pool[Math.floor(Math.random() * pool.length)]
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function timeAgo() {
  const mins = Math.floor(randomBetween(2, 28))
  return `${mins} min ago`
}

const PAYMENT_URL = process.env.NEXT_PUBLIC_PAYMENT_URL || 'https://buy.stripe.com/14A5kC67m22McnWfBxdQQ0e'

interface FomoProps {
  /** 'offer' (default) shows the $4.99 claim with a payment link — used on
   *  the result page. 'completed' shows "just completed the AI quiz" with no
   *  link — used on the cover + calculating screens. */
  variant?: 'offer' | 'completed'
}

export default function FomoPopup({ variant = 'offer' }: FomoProps) {
  const [visible, setVisible] = useState(false)
  const [person, setPerson] = useState(pickPerson())
  const [ago, setAgo] = useState(timeAgo())
  const dismissed = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function showNext() {
      if (dismissed.current) return
      setPerson(pickPerson())
      setAgo(timeAgo())
      setVisible(true)

      timerRef.current = setTimeout(() => {
        setVisible(false)
        const gap = randomBetween(2000, 5000)
        timerRef.current = setTimeout(showNext, gap)
      }, 5500)
    }

    const initialDelay = randomBetween(3000, 5000)
    timerRef.current = setTimeout(showNext, initialDelay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function dismiss() {
    dismissed.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 transition-all duration-500 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
      }`}
      style={{ maxWidth: 320 }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-100 p-3.5 flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-square.svg" alt="AI Central" className="w-8 h-8 object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          {variant === 'offer' ? (
            <p className="text-[13px] text-gray-800 leading-snug">
              🎉 <span className="font-semibold">{person.name}</span> from {person.flag} {person.city} claimed the{' '}
              <a
                href={PAYMENT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-black font-semibold underline underline-offset-2"
              >
                Limited Time $4.99 Special Offer
              </a>
            </p>
          ) : (
            <p className="text-[13px] text-gray-800 leading-snug">
              ✅ <span className="font-semibold">{person.name}</span> from {person.flag} {person.city} just completed the AI quiz
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">{ago}</p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors text-base leading-none mt-0.5"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
