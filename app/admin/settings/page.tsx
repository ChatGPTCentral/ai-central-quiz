import SeniorityClassifier from './SeniorityClassifier.client'
import StripeSync from './StripeSync.client'

export const dynamic = 'force-dynamic'

/**
 * Settings — surfaces the underlying data model so the user understands
 * (and can override) how raw signals get classified into canonical buckets.
 *
 * First section: Role → Seniority mapping. Shows every unique job_title in
 * the DB with the resolved seniority, lets the user write an override that
 * trumps the hardcoded SENIORITY_BANK regex map.
 */
export default function SettingsPage() {
  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Settings</h1>
        <p className="text-sm text-[#9C9C9C]">
          Inspect and override the classification dictionaries that power the dashboard segments.
        </p>
      </div>

      <SeniorityClassifier />
      <StripeSync />
    </div>
  )
}
