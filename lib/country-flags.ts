// Country-name → flag emoji. Covers everything `lib/geo.ts` recognises.
// Falls back to a globe glyph for unknowns.

const NAME_TO_CODE: Record<string, string> = {
  'United States': 'US', 'USA': 'US', 'US': 'US',
  'Canada': 'CA', 'Mexico': 'MX',
  'United Kingdom': 'GB', 'UK': 'GB', 'England': 'GB', 'Scotland': 'GB', 'Wales': 'GB', 'Great Britain': 'GB',
  'Germany': 'DE', 'France': 'FR', 'Spain': 'ES', 'Italy': 'IT',
  'Netherlands': 'NL', 'Belgium': 'BE', 'Switzerland': 'CH', 'Austria': 'AT',
  'Sweden': 'SE', 'Norway': 'NO', 'Denmark': 'DK', 'Finland': 'FI',
  'Ireland': 'IE', 'Portugal': 'PT', 'Poland': 'PL', 'Czech Republic': 'CZ', 'Czechia': 'CZ',
  'Romania': 'RO', 'Greece': 'GR', 'Hungary': 'HU', 'Slovakia': 'SK', 'Slovenia': 'SI',
  'Bulgaria': 'BG', 'Croatia': 'HR', 'Serbia': 'RS',
  'Lithuania': 'LT', 'Latvia': 'LV', 'Estonia': 'EE',
  'Ukraine': 'UA', 'Russia': 'RU', 'Belarus': 'BY', 'Moldova': 'MD',
  'Luxembourg': 'LU', 'Iceland': 'IS', 'Malta': 'MT', 'Cyprus': 'CY',
  'India': 'IN', 'China': 'CN', 'Japan': 'JP', 'South Korea': 'KR', 'Korea': 'KR',
  'Singapore': 'SG', 'Hong Kong': 'HK', 'Taiwan': 'TW', 'Thailand': 'TH', 'Indonesia': 'ID',
  'Vietnam': 'VN', 'Philippines': 'PH', 'Malaysia': 'MY', 'Pakistan': 'PK', 'Bangladesh': 'BD',
  'Sri Lanka': 'LK', 'Nepal': 'NP',
  'United Arab Emirates': 'AE', 'UAE': 'AE', 'Saudi Arabia': 'SA',
  'Israel': 'IL', 'Turkey': 'TR', 'Iran': 'IR', 'Iraq': 'IQ',
  'Qatar': 'QA', 'Kuwait': 'KW', 'Jordan': 'JO', 'Lebanon': 'LB', 'Oman': 'OM', 'Bahrain': 'BH',
  'Australia': 'AU', 'New Zealand': 'NZ', 'Fiji': 'FJ',
  'Brazil': 'BR', 'Argentina': 'AR', 'Chile': 'CL', 'Colombia': 'CO',
  'Peru': 'PE', 'Venezuela': 'VE', 'Uruguay': 'UY', 'Ecuador': 'EC',
  'Bolivia': 'BO', 'Paraguay': 'PY',
  'South Africa': 'ZA', 'Nigeria': 'NG', 'Kenya': 'KE', 'Egypt': 'EG', 'Morocco': 'MA',
  'Ghana': 'GH', 'Ethiopia': 'ET', 'Tunisia': 'TN', 'Algeria': 'DZ', 'Uganda': 'UG',
  'Tanzania': 'TZ', 'Senegal': 'SN', 'Rwanda': 'RW', 'Zimbabwe': 'ZW', 'Botswana': 'BW',
  'Cameroon': 'CM', 'Ivory Coast': 'CI', "Côte d'Ivoire": 'CI',
}

/** Convert an ISO-3166-1 alpha-2 code to its flag emoji (regional indicators). */
export function isoToFlag(code?: string | null): string {
  if (!code || code.length !== 2) return ''
  const c = code.toUpperCase()
  return String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65, 0x1f1e6 + c.charCodeAt(1) - 65)
}

/** Country full name (or alias) → flag emoji. Returns 🌍 fallback when unknown. */
export function countryFlag(country?: string | null): string {
  if (!country) return ''
  const code = NAME_TO_CODE[country.trim()] || NAME_TO_CODE[country.trim().replace(/[.,]$/, '')]
  return code ? isoToFlag(code) : '🌍'
}
