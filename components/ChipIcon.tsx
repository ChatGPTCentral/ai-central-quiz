const paths: Record<string, React.ReactNode> = {
  rocket:       <path d="M12 2C6.5 7.5 5 12 5 12s2 .5 4 2 2 4 2 4 4.5-1.5 10-7c1-4-2-8-9-9zM9 15c-1-1-1-2.5 0-3.5s2.5-1 3.5 0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  star:         <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  chart:        <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
  people:       <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><circle cx="9" cy="7" r="4" strokeWidth="1.5" fill="none"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="1.5" strokeLinecap="round" fill="none"/></>,
  person:       <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><circle cx="12" cy="7" r="4" strokeWidth="1.5" fill="none"/></>,
  dots:         <><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></>,
  startup:      <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><polyline points="9 22 9 12 15 12 15 22" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
  'building-sm':<><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" fill="none"/><path d="M9 22V12h6v10" strokeWidth="1.5" strokeLinecap="round" fill="none"/></>,
  'building-md':<><path d="M3 22V8l9-5 9 5v14H3z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><rect x="9" y="14" width="6" height="8" strokeWidth="1.5" fill="none"/></>,
  'building-lg':<><rect x="2" y="7" width="20" height="15" rx="1" strokeWidth="1.5" fill="none"/><path d="M16 22V3H8v19M2 11h20" strokeWidth="1.5" strokeLinecap="round" fill="none"/></>,
  'building-xl':<><path d="M1 22h22M5 22V6l7-4 7 4v16M9 10h2M9 14h2M13 10h2M13 14h2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
  bolt:         <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  trending:     <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><polyline points="17 6 23 6 23 12" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
  target:       <><circle cx="12" cy="12" r="10" strokeWidth="1.5" fill="none"/><circle cx="12" cy="12" r="6" strokeWidth="1.5" fill="none"/><circle cx="12" cy="12" r="2" strokeWidth="1.5" fill="none"/></>,
  book:         <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
  code:         <><polyline points="16 18 22 12 16 6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><polyline points="8 6 2 12 8 18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
  'circle-empty':<circle cx="12" cy="12" r="10" strokeWidth="1.5" fill="none"/>,
  seedling:     <><path d="M12 22V12M12 12C12 7 7 4 2 5c0 5 3 9 10 7M12 12c0-5 5-8 10-7-1 5-4 9-10 7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
  'check-circle':<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeWidth="1.5" strokeLinecap="round" fill="none"/><polyline points="22 4 12 14.01 9 11.01" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
  question:     <><circle cx="12" cy="12" r="10" strokeWidth="1.5" fill="none"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" strokeWidth="1.5" strokeLinecap="round" fill="none"/></>,
  clock:        <><circle cx="12" cy="12" r="10" strokeWidth="1.5" fill="none"/><polyline points="12 6 12 12 16 14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
  gear:         <><circle cx="12" cy="12" r="3" strokeWidth="1.5" fill="none"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeWidth="1.5" fill="none"/></>,
  refresh:      <><polyline points="23 4 23 10 17 10" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" strokeWidth="1.5" strokeLinecap="round" fill="none"/></>,
  newspaper:    <><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" strokeWidth="1.5" strokeLinecap="round" fill="none"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z" strokeWidth="1.5" strokeLinecap="round" fill="none"/></>,
  calendar:     <><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.5" fill="none"/><line x1="16" y1="2" x2="16" y2="6" strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" strokeWidth="1.5" strokeLinecap="round"/><line x1="3" y1="10" x2="21" y2="10" strokeWidth="1.5"/></>,
}

export default function ChipIcon({ name, size = 14 }: { name: string; size?: number }) {
  const content = paths[name]
  if (!content) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      className="flex-shrink-0"
      aria-hidden="true"
    >
      {content}
    </svg>
  )
}
