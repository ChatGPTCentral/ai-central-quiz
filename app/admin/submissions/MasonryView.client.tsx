'use client'

import { useState } from 'react'
import IdCard, { type IdCardPerson } from '@/components/admin/IdCard'
import PhotoLightbox, { type CardPerson } from '@/components/admin/PhotoLightbox'
import type { StoredSubmission } from '@/lib/kv'

interface Props {
  items: StoredSubmission[]
}

function toIdCard(s: StoredSubmission): IdCardPerson {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    photoUrl: s.photoUrl,
    jobTitle: s.jobTitle,
    jobTitleStandardized: s.jobTitleStandardized,
    companyName: s.companyName,
    companyIndustry: s.companyIndustry,
    companySize: s.companySize,
    companyLinkedinUrl: s.companyLinkedinUrl,
    linkedinUrl: s.linkedinUrl,
    country: s.country,
    city: s.city,
    region: s.region,
    ageBracket: s.ageBracket,
    ageAiEstimate: s.ageAiEstimate,
    sexAiEstimate: s.sexAiEstimate,
    seniority: s.seniority,
    source: s.source,
    score: s.score,
    archetype: s.archetype,
    // Revenue / membership — surfaces same data the table column shows
    lifetimeValueUsd: s.lifetimeValueUsd,
    subscriptionTier: s.subscriptionTier,
    beehiivStatus: s.beehiivStatus,
    stripeCustomerId: s.stripeCustomerId,
    enrichmentStatus: s.enrichmentStatus,
  }
}

function toCardPerson(s: StoredSubmission): CardPerson {
  return {
    id: s.id, name: s.name, email: s.email, photoUrl: s.photoUrl,
    title: s.jobTitle, company: s.companyName, companyIndustry: s.companyIndustry,
    linkedinUrl: s.linkedinUrl, country: s.country, city: s.city,
    ageBracket: s.ageBracket, ageAiEstimate: s.ageAiEstimate,
    sexAiEstimate: s.sexAiEstimate, source: s.source, score: s.score,
  }
}

/**
 * Masonry-style grid of ID cards. Native CSS `columns` layout means cards
 * stack into 3 columns and flow into shorter ones — no JS reflow needed,
 * `break-inside-avoid` on each card prevents mid-card breaks.
 *
 * Inspired by https://reactbits.dev/components/masonry
 */
export default function MasonryView({ items }: Props) {
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <div className="bg-white border border-[#E8E4DF] rounded-xl p-8 text-center">
        <p className="text-sm text-[#9C9C9C]">No matches. Loosen the filters.</p>
      </div>
    )
  }

  const focused = lightboxId
    ? items.find(s => s.id === lightboxId) || null
    : null

  return (
    <>
      <div className="masonry-cards" style={{ columnGap: '1rem' }}>
        {items.map(s => (
          <IdCard
            key={s.id}
            person={toIdCard(s)}
            onPhotoClick={(id) => setLightboxId(id)}
          />
        ))}
      </div>

      <PhotoLightbox
        person={focused ? toCardPerson(focused) : null}
        allPeople={items.map(toCardPerson)}
        onChange={(next) => setLightboxId(next.id || null)}
        onClose={() => setLightboxId(null)}
      />

      <style jsx>{`
        .masonry-cards {
          column-count: 1;
        }
        @media (min-width: 640px) {
          .masonry-cards { column-count: 2; }
        }
        @media (min-width: 1024px) {
          .masonry-cards { column-count: 3; }
        }
        @media (min-width: 1440px) {
          .masonry-cards { column-count: 4; }
        }
      `}</style>
    </>
  )
}
