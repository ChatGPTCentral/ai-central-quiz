import { QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import { PERSONAS } from '@/lib/segmentation-v2'

const QUESTIONS = QUESTIONS_V2_MERGED

const PERSONA_BOXES = PERSONAS.filter(p => p.key !== 'unknown')

export default function AdminFlowPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-black mb-1">Quiz Flow Diagram</h1>
          <p className="text-sm text-gray-500">AI Central · Survey v2 · {QUESTIONS.length} steps → 6 stages + 4 personas</p>
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
                        {i + 1}
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

            {/* Arrow to personas */}
            <div className="flex items-center mt-8">
              <svg width="40" height="12" viewBox="0 0 40 12" fill="none">
                <line x1="0" y1="6" x2="32" y2="6" stroke="#333" strokeWidth="2"/>
                <path d="M32 2L38 6L32 10" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>

            {/* Persona boxes */}
            <div className="flex flex-col gap-2">
              {PERSONA_BOXES.map(p => (
                <div
                  key={p.key}
                  className="w-[160px] rounded-xl border-2 p-3"
                  style={{ borderColor: p.color, backgroundColor: `${p.color}10` }}
                >
                  <div
                    className="w-3 h-3 rounded-full mb-1.5"
                    style={{ backgroundColor: p.color }}
                  />
                  <p className="text-xs font-black text-black leading-snug mb-1">{p.emoji} {p.label}</p>
                  <p className="text-[10px] text-gray-500 leading-snug">{p.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stage + Persona classifier — the v2 segmentation layer */}
        <div className="bg-white rounded-2xl border border-[#E0E0E0] p-6 mt-6">
          <h2 className="text-sm font-black text-black uppercase tracking-wider mb-2">Stage + Persona classifier (v2)</h2>
          <p className="text-[11px] text-gray-500 mb-4">
            The canonical classification, computed by <code className="bg-[#F5F5F5] px-1 rounded">assignSegmentationV2</code> in <code className="bg-[#F5F5F5] px-1 rounded">lib/segmentation-v2.ts</code>. Two orthogonal axes:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl p-4 border border-[#E48715]/40 bg-[#E48715]/05">
              <p className="text-xs font-black mb-2 text-[#E48715]">📈 STAGE (mutable, the ladder)</p>
              <p className="text-[11px] text-gray-700 leading-relaxed">
                S0 Unaware → S1 Curious → S2 Experimenter → S3 Practitioner → S4 Power User → S5 Builder. Computed from <code className="bg-[#F5F5F5] px-1 rounded">frequency_score</code> + <code className="bg-[#F5F5F5] px-1 rounded">depth_score</code> + <code className="bg-[#F5F5F5] px-1 rounded">breadth_score</code> when survey-v2 fields present, else inferred from legacy <code className="bg-[#F5F5F5] px-1 rounded">aiLevel</code> + <code className="bg-[#F5F5F5] px-1 rounded">aiTools</code>
              </p>
            </div>
            <div className="rounded-xl p-4 border border-[#3B4C99]/40 bg-[#3B4C99]/05">
              <p className="text-xs font-black mb-2 text-[#3B4C99]">👤 PERSONA (mostly fixed, role context)</p>
              <p className="text-[11px] text-gray-700 leading-relaxed">
                Decision Maker / Operator / Maker / Learner. Computed from <code className="bg-[#F5F5F5] px-1 rounded">seniority</code> + <code className="bg-[#F5F5F5] px-1 rounded">jobLevel</code> + <code className="bg-[#F5F5F5] px-1 rounded">workArea</code> + <code className="bg-[#F5F5F5] px-1 rounded">jobFunction</code>. Decision Maker wins first; Operator is the broad fallback for any signal we can&apos;t place
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
