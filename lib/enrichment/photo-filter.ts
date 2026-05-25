// Reject LinkedIn / Apollo default-avatar URLs so they don't pose as a real
// profile picture in the merge. When all providers return placeholders we
// leave photo_url alone rather than overwriting a good photo with a ghost.

const PLACEHOLDER_SUBSTRINGS = [
  'ghost_person',
  'ghost-person',
  'ghosts/person',
  'ghosts%2Fperson',
  '9c8pery4andzj6ohjkjp54ma2',       // canonical LinkedIn default-avatar hash
  'aero-v1/sc/h/',                    // static asset bucket used for defaults
  'static.licdn.com/sc/h/',           // static placeholder bucket
  'default-profile',
  'default_profile',
  'anonymous-user',
  'no-photo',
  '/sc/h/',                           // most generic static-asset path on licdn
]

/** Returns true when the URL is a known LinkedIn / Apollo default-avatar placeholder. */
export function isPlaceholderPhoto(url?: string | null): boolean {
  if (!url) return false
  const u = url.toLowerCase()
  return PLACEHOLDER_SUBSTRINGS.some(s => u.includes(s))
}

/** Pass-through unless the URL is a placeholder, in which case returns undefined. */
export function cleanPhoto(url?: string | null): string | undefined {
  if (!url) return undefined
  return isPlaceholderPhoto(url) ? undefined : url
}
