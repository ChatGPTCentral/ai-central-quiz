// Cleaning helpers for free-text fields from enrichment providers.
//
// Apify / Apollo / LinkedIn return industries lower-cased ("information
// technology & services") and countries as compound strings ("Georgia United
// States", "São Paulo Brazil"). Normalize both before saving so the dashboard
// segments cleanly.

import { NAME_TO_CODE } from './country-flags'

// ── Industry: Title Case with small-word exceptions ────────────────

const SMALL_WORDS = new Set(['and', 'or', 'of', 'the', 'for', 'to', 'in', 'on', 'at', 'a', 'an', 'as', 'by', 'vs', 'via'])

/** Properize a free-form string into Title Case ("information technology" → "Information Technology"). */
export function titleCase(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  if (!s) return undefined

  // Split on whitespace AND hyphens, but remember which separator was there
  const tokens = s.split(/(\s+|[/\-&])/)  // keep separators in the array
  const out = tokens.map((tok, i) => {
    // separator chunks pass through unchanged
    if (/^(\s+|[/\-&])$/.test(tok)) return tok
    const lower = tok.toLowerCase()
    // Keep all-caps acronyms as-is when 2-4 chars and originally all caps
    if (/^[A-Z]{2,4}$/.test(tok)) return tok
    // Lowercase small words unless at start or end
    if (i !== 0 && i !== tokens.length - 1 && SMALL_WORDS.has(lower)) return lower
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })
  return out.join('')
}

// ── Country: extract base country from compound strings ────────────

/**
 * Reduce a freeform location string to the canonical country.
 * "Georgia United States" → "United States"
 * "São Paulo Brazil" → "Brazil"
 * "Tamil Nadu India" → "India"
 * "United States" → "United States" (passthrough)
 *
 * Strategy: check the WHOLE string against known countries, then try suffixes
 * of 1..4 trailing words. Returns the original string if no country is found.
 */
export function normalizeCountry(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  if (!s) return undefined

  // Whole-string match (covers aliases like "USA", "UK")
  if (NAME_TO_CODE[s]) return canonicalName(s)

  // Try trailing 1..4 word suffixes (longest first → "United States" before "States")
  const words = s.split(/\s+/)
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    const tail = words.slice(-n).join(' ')
    if (NAME_TO_CODE[tail]) return canonicalName(tail)
  }

  // Also try comma-separated last segment ("San Francisco, CA, United States")
  const commaParts = s.split(',').map(p => p.trim()).filter(Boolean)
  if (commaParts.length > 1) {
    const last = commaParts[commaParts.length - 1]
    if (NAME_TO_CODE[last]) return canonicalName(last)
    const lastWords = last.split(/\s+/)
    for (let n = Math.min(4, lastWords.length); n >= 1; n--) {
      const tail = lastWords.slice(-n).join(' ')
      if (NAME_TO_CODE[tail]) return canonicalName(tail)
    }
  }

  return s
}

/** Map aliases to their canonical name (USA → United States, UK → United Kingdom). */
function canonicalName(name: string): string {
  const ALIASES: Record<string, string> = {
    'USA': 'United States', 'US': 'United States',
    'UK': 'United Kingdom', 'Great Britain': 'United Kingdom',
    'England': 'United Kingdom', 'Scotland': 'United Kingdom', 'Wales': 'United Kingdom',
    'UAE': 'United Arab Emirates',
    'Korea': 'South Korea',
    'Czechia': 'Czech Republic',
    "Côte d'Ivoire": 'Ivory Coast',
  }
  return ALIASES[name] || name
}
