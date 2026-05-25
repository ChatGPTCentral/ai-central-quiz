import { QUESTIONS } from '@/lib/questions'
import { ARCHETYPES } from '@/lib/archetypes'
import ArchetypeTrace from './ArchetypeTrace.client'

const ARCHETYPES_LIST = [
  { key: 'technical_pioneer', label: 'Technical Pioneer', color: '#2D8879' },
  { key: 'executive_strategist', label: 'Executive Strategist', color: '#3B4C99' },
  { key: 'growth_operator', label: 'Growth Operator', color: '#E48715' },
  { key: 'practical_learner', label: 'Practical Learner', color: '#62A758' },
]

export default function AdminFlowPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-black mb-1">Quiz Flow Diagram</h1>
          <p className="text-sm text-gray-500">AI Central — {QUESTIONS.length} steps → 4 archetypes</p>
        </div>

        {/* Flow steps */}
        <div className="bg-white rounded-2xl border border-[#E0E0E0] p-6 mb-6 overflow-x-auto">
          <div className="flex items-start gap-3 min-w-max pb-2">
            {QUESTIONS.map((q, i) => (
              <div key={q.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="w-[140px] rounded-xl border-2 border-black p-3 bg-white hover:bg-gray-50 transition-colors cursor-default"
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {q.step}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {q.type === 'text' ? 'Text' : q.type === 'email' ? 'Email' : q.type === 'chips' ? 'Single' : 'Multi'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-black leading-snug mb-2 line-clamp-2">{q.id}</p>
                    {q.options && (
                      <div className="flex flex-col gap-1">
                        {q.options.map(opt => (
                          <div key={opt.value} className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                            <span className="text-[10px] text-gray-500 truncate">{opt.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Arrow between steps */}
                {i < QUESTIONS.length - 1 && (
                  <div className="flex items-center mt-8">
                    <svg width="28" height="12" viewBox="0 0 28 12" fill="none">
                      <line x1="0" y1="6" x2="20" y2="6" stroke="#CCCCCC" strokeWidth="1.5"/>
                      <path d="M20 2L26 6L20 10" stroke="#CCCCCC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}

            {/* Arrow to archetypes */}
            <div className="flex items-center mt-8">
              <svg width="40" height="12" viewBox="0 0 40 12" fill="none">
                <line x1="0" y1="6" x2="32" y2="6" stroke="#333" strokeWidth="2"/>
                <path d="M32 2L38 6L32 10" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>

            {/* Archetype boxes */}
            <div className="flex flex-col gap-2">
              {ARCHETYPES_LIST.map(a => (
                <div
                  key={a.key}
                  className="w-[160px] rounded-xl border-2 p-3"
                  style={{ borderColor: a.color, backgroundColor: `${a.color}10` }}
                >
                  <div
                    className="w-3 h-3 rounded-full mb-1.5"
                    style={{ backgroundColor: a.color }}
                  />
                  <p className="text-xs font-black text-black leading-snug mb-1">{a.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {ARCHETYPES[a.key as keyof typeof ARCHETYPES].tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${a.color}20`, color: a.color }}
                      >
                        {tag.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Routing logic */}
        <div className="bg-white rounded-2xl border border-[#E0E0E0] p-6">
          <h2 className="text-sm font-black text-black uppercase tracking-wider mb-4">Archetype Routing Logic</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                label: 'Technical Pioneer',
                color: '#2D8879',
                rule: 'aiLevel = Advanced OR (Coding/Data + 1-2h or 3+h time)',
              },
              {
                label: 'Executive Strategist',
                color: '#3B4C99',
                rule: 'jobLevel = Founder/C-Suite/VP + mainGoal = Grow business or Professional growth',
              },
              {
                label: 'Growth Operator',
                color: '#E48715',
                rule: 'workArea = Marketing/Sales/Ops + mainGoal = Professional growth or Grow business',
              },
              {
                label: 'Practical Learner',
                color: '#62A758',
                rule: 'Default fallback — does not match any of the above conditions',
              },
            ].map(r => (
              <div
                key={r.label}
                className="rounded-xl p-4 border"
                style={{ borderColor: `${r.color}40`, backgroundColor: `${r.color}08` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-xs font-black text-black">{r.label}</span>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed">{r.rule}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Archetype trace — paste a row UUID or email to see how the form mapped it */}
        <ArchetypeTrace />
      </div>
    </div>
  )
}
