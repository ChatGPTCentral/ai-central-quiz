import SurveyV2Preview from './SurveyV2Preview.client'

export const dynamic = 'force-dynamic'

export default function SurveyV2Page() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#FFFDFA] bg-[#E48715] px-2 py-0.5 rounded">🧪 Sandbox</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">Survey v2 preview</span>
        </div>
        <h1 className="text-2xl font-black text-[#333333] mb-1">Survey v2 - - laddering signals</h1>
        <p className="text-sm text-[#9C9C9C] max-w-2xl">
          Take the 6 new questions yourself against any existing CRM email. Watch the row jump from S2 Experimenter to its real stage as the answers land. Writes to the sandbox columns only - - existing quiz data untouched.
        </p>
      </div>

      <SurveyV2Preview />
    </div>
  )
}
