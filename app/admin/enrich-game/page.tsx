import EnrichGame from './EnrichGame.client'
import VerifyRecords from './VerifyRecords.client'

export const dynamic = 'force-dynamic'

// Enrich tuner: two stacked tools. (1) The pipeline tuner — play current vs new
// enrichment and your calls become the answer key the resolver is tuned on.
// (2) Verify new records — the QA pass that confirms/fixes the profile stored on
// each live record and stamps it verified in the database.
export default function EnrichTunerPage() {
  return (
    <div>
      <header style={{ padding: '26px 36px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Tools · train the resolver</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Enrich tuner</h1>
        <p className="text-sm text-[#9C9C9C] mt-1">
          Each round shows a person, their photo, and both pipelines&rsquo; guesses. Pick the one that&rsquo;s right, or tell me the real profile and how you found it. Your calls become the answer key I tune the new resolver against, so it learns to think like you.
        </p>
      </header>
      <div className="p-8 pt-1" style={{ maxWidth: 900 }}>
        <EnrichGame />
      </div>

      {/* Verify new records — QA pass that stamps enrichment_verified_at in the DB */}
      <div style={{ borderTop: '1px solid #EDE7DA', marginTop: 8 }}>
        <header style={{ padding: '26px 36px 6px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Tools · confirm live records</div>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: '#1A1A1A' }}>Verify new records</h2>
          <p className="text-sm text-[#9C9C9C] mt-1">
            Every enriched record that no one has checked yet, newest first. Confirm the stored profile is right and it&rsquo;s stamped verified in the database, or fix a field and save. No enrichment is re-run here, so this costs nothing.
          </p>
        </header>
        <div className="p-8 pt-1" style={{ maxWidth: 900 }}>
          <VerifyRecords />
        </div>
      </div>
    </div>
  )
}
