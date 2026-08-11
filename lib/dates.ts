// Human dates, everywhere. "2023-11-11" is a machine's date; the owner reads
// "11 Nov 2023". One place so no screen drifts into its own format.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2023-11-11" or an ISO timestamp → "11 Nov 2023" */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '–'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '–'
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "2026-08" (or any longer ISO) → "Aug 2026" */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return '–'
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  if (!y || !m) return '–'
  return `${MONTHS[m - 1]} ${y}`
}

/** "2026-08" → "Aug '26", for axis labels where space is tight. */
export function fmtMonthShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  if (!y || !m) return ''
  return `${MONTHS[m - 1]} '${String(y).slice(2)}`
}
