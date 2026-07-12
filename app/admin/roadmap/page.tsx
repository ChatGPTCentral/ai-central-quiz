import { listRoadmapTasks, type RoadmapTask } from '@/lib/roadmap'
import RoadmapBoard from './RoadmapBoard.client'

export const dynamic = 'force-dynamic'

// ── Roadmap · the project's source of truth ────────────────────────────
// Claude maintains this board like a programmer: cards move to In progress
// when work starts, close to Done (with the commit) when it ships, and
// "status the project" answers are read straight from here.

export default async function RoadmapPage() {
  let tasks: RoadmapTask[] = []
  let error: string | null = null
  try {
    tasks = await listRoadmapTasks()
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const shipped = tasks.filter(t => t.status === 'done').length
  const open = tasks.length - shipped - tasks.filter(t => t.status === 'parked').length
  const onOwner = tasks.filter(t => t.status === 'waiting_owner').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-1.5 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black text-[#333333]">Roadmap</h1>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9C9C9C', border: '1px solid #E8E4DF', borderRadius: 4, padding: '2px 8px', background: '#FAF7F1' }}>
            {open} open · {shipped} shipped{onOwner > 0 ? ` · ${onOwner} on you` : ''}
          </span>
        </div>
      </div>
      <p className="mb-5" style={{ fontSize: 12.5, color: '#9C9C9C' }}>
        Source of truth for the funnel project. Claude keeps it in sync: cards close when work ships, with the commit attached. Drag to move, click to expand.
      </p>

      {error ? (
        <p className="text-sm text-[#BE3B3B]">Error: {error}</p>
      ) : (
        <RoadmapBoard initialTasks={tasks} />
      )}
    </div>
  )
}
