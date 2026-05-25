// Thin wrapper around the apify-profile actor for the case where we already
// know the LinkedIn URL and just want the canonical profile data (face, role,
// company, location, headline).
//
// This delegates to `apifyProfileProvider.lookup({linkedinUrl})` which already
// handles the actor call + defensive output parsing.

import { apifyProfileProvider } from './apify-profile'
import type { NormalizedPerson } from './types'

export async function scrapeLinkedInProfile(linkedinUrl: string): Promise<NormalizedPerson | null> {
  if (!linkedinUrl) return null
  // Reject LinkedIn's name-disambiguation URLs — they're not real profiles,
  // and the scraper actors return arbitrary unrelated person data for them.
  // (See the "Kafein Technology Solutions" mass-contamination bug.)
  if (/linkedin\.com\/pub\/dir\//i.test(linkedinUrl)) {
    console.warn('[linkedin-scrape] refusing /pub/dir/ disambiguation URL:', linkedinUrl)
    return null
  }
  // The provider's lookup expects an `email` field but doesn't require it;
  // when only linkedinUrl is supplied the actor uses `profileUrls`.
  return apifyProfileProvider.lookup({ email: '', linkedinUrl })
}
