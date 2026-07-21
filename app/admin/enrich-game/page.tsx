import VerifyRecords from './VerifyRecords.client'

export const dynamic = 'force-dynamic'

// Enrich tuner — one unified flow. Every unverified contact, newest first, shown
// next to two live enrichers (Apollo + a Google/Apify resolver). The owner votes
// or overrides; one click saves the profile onto the record, stamps it verified,
// banks it as ground truth, and reuses it as few-shot so the resolver
// self-reinforces. Verifying and tuning are the same act now.
export default function EnrichTunerPage() {
  return (
    <div>
      <header style={{ padding: '26px 36px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Tools · verify + self-tune</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Enrich tuner</h1>
        <p className="text-sm text-[#9C9C9C] mt-1" style={{ maxWidth: 720 }}>
          Every contact no one has confirmed yet, newest first. See what the quiz knows next to two live enrichers, Apollo and a Google + Apify resolver. Vote the winner or type the fix, and one click saves it to the record, stamps it verified, and teaches the resolver, which reuses the people you verify as it goes. No separate steps, no researching by hand.
        </p>
      </header>
      <div className="p-8 pt-1" style={{ maxWidth: 980 }}>
        <VerifyRecords />
      </div>
    </div>
  )
}
