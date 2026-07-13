import EnrichCompare from './EnrichCompare.client'

export const dynamic = 'force-dynamic'

// Owner review gate for the enrichment overhaul: stored enrichment vs the new
// verified Google-first resolver, 30 records, approve before we switch the
// live pipeline over.
export default function EnrichComparePage() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Enrichment: current vs new</h1>
        <p className="text-sm text-[#9C9C9C]">
          The new resolver searches Google with the manual-research combos, reads the results, and only accepts a match it&rsquo;s confident about (returning nothing rather than the wrong person). Review the sample, then tell me to make it live.
        </p>
      </div>
      <EnrichCompare />
    </div>
  )
}
