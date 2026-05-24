// Country → continent map (ISO 3166-1 alpha-2 + common name variants)
// Trimmed to entries we're likely to hit; falls back to 'Other' for unknown.

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  // North America
  'United States': 'North America', 'USA': 'North America', 'US': 'North America',
  'Canada': 'North America', 'Mexico': 'North America',
  // Europe
  'United Kingdom': 'Europe', 'UK': 'Europe', 'Great Britain': 'Europe', 'England': 'Europe', 'Scotland': 'Europe', 'Wales': 'Europe',
  'Germany': 'Europe', 'France': 'Europe', 'Spain': 'Europe', 'Italy': 'Europe',
  'Netherlands': 'Europe', 'Belgium': 'Europe', 'Switzerland': 'Europe', 'Austria': 'Europe',
  'Sweden': 'Europe', 'Norway': 'Europe', 'Denmark': 'Europe', 'Finland': 'Europe',
  'Ireland': 'Europe', 'Portugal': 'Europe', 'Poland': 'Europe', 'Czech Republic': 'Europe', 'Czechia': 'Europe',
  'Romania': 'Europe', 'Greece': 'Europe', 'Hungary': 'Europe', 'Slovakia': 'Europe', 'Slovenia': 'Europe',
  'Bulgaria': 'Europe', 'Croatia': 'Europe', 'Serbia': 'Europe', 'Lithuania': 'Europe', 'Latvia': 'Europe', 'Estonia': 'Europe',
  'Ukraine': 'Europe', 'Russia': 'Europe', 'Belarus': 'Europe', 'Moldova': 'Europe',
  'Luxembourg': 'Europe', 'Iceland': 'Europe', 'Malta': 'Europe', 'Cyprus': 'Europe',
  // Asia
  'India': 'Asia', 'China': 'Asia', 'Japan': 'Asia', 'South Korea': 'Asia', 'Korea': 'Asia',
  'Singapore': 'Asia', 'Hong Kong': 'Asia', 'Taiwan': 'Asia', 'Thailand': 'Asia', 'Indonesia': 'Asia',
  'Vietnam': 'Asia', 'Philippines': 'Asia', 'Malaysia': 'Asia', 'Pakistan': 'Asia', 'Bangladesh': 'Asia',
  'Sri Lanka': 'Asia', 'Nepal': 'Asia', 'United Arab Emirates': 'Asia', 'UAE': 'Asia', 'Saudi Arabia': 'Asia',
  'Israel': 'Asia', 'Turkey': 'Asia', 'Iran': 'Asia', 'Iraq': 'Asia', 'Qatar': 'Asia', 'Kuwait': 'Asia',
  'Jordan': 'Asia', 'Lebanon': 'Asia', 'Oman': 'Asia', 'Bahrain': 'Asia',
  // Oceania
  'Australia': 'Oceania', 'New Zealand': 'Oceania', 'Fiji': 'Oceania',
  // South America
  'Brazil': 'South America', 'Argentina': 'South America', 'Chile': 'South America', 'Colombia': 'South America',
  'Peru': 'South America', 'Venezuela': 'South America', 'Uruguay': 'South America', 'Ecuador': 'South America',
  'Bolivia': 'South America', 'Paraguay': 'South America',
  // Africa
  'South Africa': 'Africa', 'Nigeria': 'Africa', 'Kenya': 'Africa', 'Egypt': 'Africa', 'Morocco': 'Africa',
  'Ghana': 'Africa', 'Ethiopia': 'Africa', 'Tunisia': 'Africa', 'Algeria': 'Africa', 'Uganda': 'Africa',
  'Tanzania': 'Africa', 'Senegal': 'Africa', 'Rwanda': 'Africa', 'Zimbabwe': 'Africa', 'Botswana': 'Africa',
  'Cameroon': 'Africa', 'Ivory Coast': 'Africa', "Côte d'Ivoire": 'Africa',
}

export function continentOf(country?: string | null): string {
  if (!country) return 'Unknown'
  const cleaned = country.trim()
  if (COUNTRY_TO_CONTINENT[cleaned]) return COUNTRY_TO_CONTINENT[cleaned]
  // Try without trailing punctuation
  const c2 = cleaned.replace(/[.,]$/, '')
  return COUNTRY_TO_CONTINENT[c2] || 'Other'
}

export function isUS(country?: string | null): boolean {
  if (!country) return false
  const c = country.trim().toLowerCase()
  return c === 'united states' || c === 'usa' || c === 'us' || c === 'u.s.' || c === 'u.s.a.'
}

/** Should we surface the State/Region field? Only for countries where it's culturally meaningful. */
export function showState(country?: string | null): boolean {
  if (!country) return false
  const c = country.trim().toLowerCase()
  return (
    c === 'united states' || c === 'usa' || c === 'us' ||
    c === 'canada' ||
    c === 'australia'
  )
}
