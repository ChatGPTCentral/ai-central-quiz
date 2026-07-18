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
    <div>
      <header style={{ padding: '26px 36px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Project · source of truth</div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Roadmap</h1>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9C9C9C', border: '1px solid #E8E4DF', borderRadius: 4, padding: '2px 8px', background: '#FAF7F1' }}>
            {open} open · {shipped} shipped{onOwner > 0 ? ` · ${onOwner} on you` : ''}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: '#9C9C9C', margin: '6px 0 0' }}>
          Source of truth for the funnel project. Claude keeps it in sync: cards close when work ships, with the commit attached. Drag to move, click to expand.
        </p>
      </header>

      <div className="p-8 pt-1">
        {error ? (
          <p className="text-sm text-[#BE3B3B]">Error: {error}</p>
        ) : (
          <RoadmapBoard initialTasks={tasks} />
        )}
      </div>
    </div>
  )
}
