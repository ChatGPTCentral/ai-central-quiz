// Heuristic name inference from an email's local-part.
// Examples:
//   john.doe@acme.com    → { firstName: 'John',  lastName: 'Doe',  confidence: 'high'   }
//   j.doe@acme.com       → { firstName: 'J',     lastName: 'Doe',  confidence: 'low'    }
//   john@acme.com        → { firstName: 'John',                    confidence: 'medium' }
//   info@acme.com        → null  (generic mailbox)
//   john_doe@acme.com    → { firstName: 'John',  lastName: 'Doe',  confidence: 'high'   }

export interface InferredName {
  firstName?: string
  lastName?: string
  fullName?: string
  confidence: 'low' | 'medium' | 'high'
}

const GENERIC_LOCALS = new Set([
  'info', 'hello', 'contact', 'team', 'support', 'admin', 'sales',
  'marketing', 'press', 'pr', 'jobs', 'careers', 'help', 'noreply',
  'no-reply', 'billing', 'office', 'service', 'inquiries', 'enquiries',
  'mail', 'webmaster', 'postmaster', 'me', 'hi', 'hey', 'feedback',
])

function titleCase(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

export function inferNameFromEmail(email: string | undefined | null): InferredName | null {
  if (!email) return null
  const local = email.trim().split('@')[0]?.toLowerCase().trim()
  if (!local) return null
  // Strip "+tag" extensions ("john.doe+newsletter@…")
  const clean = local.split('+')[0]
  if (GENERIC_LOCALS.has(clean)) return null
  // Pure digits → not a person
  if (/^\d+$/.test(clean)) return null

  // Split on common separators
  const parts = clean.split(/[._-]+/).filter(Boolean)

  // Two clean parts → very likely "first last"
  if (parts.length === 2 && parts[0].length >= 2 && parts[1].length >= 2) {
    return {
      firstName: titleCase(parts[0]),
      lastName: titleCase(parts[1]),
      fullName: `${titleCase(parts[0])} ${titleCase(parts[1])}`,
      confidence: 'high',
    }
  }

  // Three parts (e.g. "john.michael.doe") — assume first + last (drop middle)
  if (parts.length === 3 && parts[0].length >= 2 && parts[2].length >= 2) {
    return {
      firstName: titleCase(parts[0]),
      lastName: titleCase(parts[2]),
      fullName: `${titleCase(parts[0])} ${titleCase(parts[2])}`,
      confidence: 'medium',
    }
  }

  // One part with separator-less "jdoe" style — initial + lastname
  if (parts.length === 1 && /^[a-z][a-z]+$/.test(parts[0])) {
    const p = parts[0]
    if (p.length === 1) return null
    if (p.length <= 4) {
      // Likely a first name only or initials, no clear surname
      return { firstName: titleCase(p), fullName: titleCase(p), confidence: 'medium' }
    }
    // 5+ chars and a single token — could be either first or last. Treat as first-name.
    return { firstName: titleCase(p), fullName: titleCase(p), confidence: 'medium' }
  }

  // Initial + last name like "jdoe"
  if (parts.length === 1 && /^[a-z]\.?[a-z]{2,}$/.test(parts[0])) {
    const p = parts[0]
    return {
      firstName: p[0].toUpperCase(),
      lastName: titleCase(p.slice(1)),
      fullName: `${p[0].toUpperCase()} ${titleCase(p.slice(1))}`,
      confidence: 'low',
    }
  }

  // First + initial: e.g. "j.d" (just letters) — low value
  if (parts.length === 2 && (parts[0].length === 1 || parts[1].length === 1)) {
    const first = parts[0].length > 1 ? titleCase(parts[0]) : parts[0].toUpperCase()
    const last  = parts[1].length > 1 ? titleCase(parts[1]) : parts[1].toUpperCase()
    return { firstName: first, lastName: last, fullName: `${first} ${last}`, confidence: 'low' }
  }

  return null
}
