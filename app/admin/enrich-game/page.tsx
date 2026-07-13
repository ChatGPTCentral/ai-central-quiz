import EnrichGame from './EnrichGame.client'

export const dynamic = 'force-dynamic'

// The enrichment labeling game: play the last 40 records, pick the better
// enrichment (or tell me the truth), and I converge the resolver on your calls.
export default function EnrichGamePage() {
  return (
    <div className="p-8" style={{ maxWidth: 900 }}>
      <div className="mb-5">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Enrichment game 🎯</h1>
        <p className="text-sm text-[#9C9C9C]">
          Each round shows a person, their photo, and both pipelines&rsquo; guesses. Pick the one that&rsquo;s right, or tell me the real profile and how you found it. Your calls become the answer key I tune the new resolver against, so it learns to think like you.
        </p>
      </div>
      <EnrichGame />
    </div>
  )
}
