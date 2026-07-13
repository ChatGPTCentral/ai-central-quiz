import EnrichInspect from './EnrichInspect.client'

export const dynamic = 'force-dynamic'

// Side-by-side visual audit of the current vs new enrichment flow, step by
// step, on a single submitted record.
export default function EnrichInspectPage() {
  return (
    <div className="p-8" style={{ maxWidth: 1100 }}>
      <div className="mb-5">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Enrichment inspector</h1>
        <p className="text-sm text-[#9C9C9C]">
          Submit a record and watch both pipelines run step by step. Each step shows the input it consumed, the Google queries and results it read, and what it produced, so you can see exactly where the current and new flows diverge.
        </p>
      </div>
      <EnrichInspect />
    </div>
  )
}
