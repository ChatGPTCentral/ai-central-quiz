import EnrichGame from './EnrichGame.client'

export const dynamic = 'force-dynamic'

// The enrichment labeling game: play the last 40 records, pick the better
// enrichment (or tell me the truth), and I converge the resolver on your calls.
export default function EnrichGamePage() {
  return (
    <div>
      <header style={{ padding: '26px 36px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Tools · train the resolver</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Enrichment game</h1>
        <p className="text-sm text-[#9C9C9C] mt-1">
          Each round shows a person, their photo, and both pipelines&rsquo; guesses. Pick the one that&rsquo;s right, or tell me the real profile and how you found it. Your calls become the answer key I tune the new resolver against, so it learns to think like you.
        </p>
      </header>
      <div className="p-8 pt-1" style={{ maxWidth: 900 }}>
        <EnrichGame />
      </div>
    </div>
  )
}
