import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSubmission } from '@/lib/kv'
import { ARCHETYPES } from '@/lib/archetypes'
import DeleteButton from './DeleteButton.client'
import EditableRecord from './EditableRecord.client'

export const dynamic = 'force-dynamic'

export default async function SubmissionDetailPage({ params }: { params: { id: string } }) {
  let item: Awaited<ReturnType<typeof getSubmission>> = null
  try {
    item = await getSubmission(params.id)
  } catch {
    item = null
  }
  if (!item) notFound()

  const archetype = ARCHETYPES[item.archetype]

  const fields: { label: string; value: string }[] = [
    { label: 'Name', value: item.name },
    { label: 'Email', value: item.email },
    { label: 'AI level', value: item.aiLevel },
    { label: 'Work area', value: item.workArea },
    { label: 'Learning style', value: item.learningStyle },
    { label: 'Time commitment', value: item.timeCommitment },
    { label: 'Main goal', value: item.mainGoal },
    { label: 'AI tools', value: item.aiTools || '—' },
    { label: 'Job level', value: item.jobLevel },
  ]

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/admin/dashboard" className="text-sm text-gray-500 hover:text-black">← All submissions</Link>

      <div className="flex items-start justify-between mt-3 mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-black mb-1">{item.name || item.email}</h1>
          <p className="text-sm text-gray-500">{item.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block px-3 py-1 rounded-full text-xs font-bold"
            style={{
              backgroundColor: `${archetype?.accentColor || '#999'}18`,
              color: archetype?.accentColor || '#999',
            }}
          >
            {archetype?.label || item.archetype}
          </span>
          {item.score !== undefined && (
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-black text-white">
              Score {item.score}
            </span>
          )}
        </div>
      </div>

      {/* Inline editor — manually correct any field, especially LinkedIn URL + photo */}
      <EditableRecord
        initial={{
          id: item.id,
          name: item.name,
          linkedinUrl: item.linkedinUrl,
          photoUrl: item.photoUrl,
          jobTitle: item.jobTitle,
          seniority: item.seniority,
          companyName: item.companyName,
          companyDomain: item.companyDomain,
          companyIndustry: item.companyIndustry,
          country: item.country,
          region: item.region,
          city: item.city,
          ageBracket: item.ageBracket,
          buyingIntent: item.buyingIntent,
        }}
      />

      <section className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 px-5 pt-5">Quiz answers</h2>
        <div className="px-5 pb-2">
          {fields.map(f => (
            <div key={f.label} className="flex items-start justify-between gap-4 py-3 border-b border-[#F0F0F0] last:border-b-0">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400 w-32 shrink-0">{f.label}</span>
              <span className="text-sm text-black flex-1 break-words">{f.value || '—'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Apollo enrichment</h2>
        {item.apolloData?.success ? (
          <pre className="text-xs bg-[#FAFAFA] border border-[#F0F0F0] rounded-lg p-3 overflow-auto max-h-96">
            {JSON.stringify(item.apolloData, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-gray-400">No Apollo data (personal email or no match)</p>
        )}
      </section>

      <section className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Metadata</h2>
        <div className="text-xs space-y-1 text-gray-600">
          <div><span className="font-medium text-gray-400">ID:</span> {item.id}</div>
          <div><span className="font-medium text-gray-400">Submitted:</span> {new Date(item.ts).toLocaleString()}</div>
          {item.ip && <div><span className="font-medium text-gray-400">IP:</span> {item.ip}</div>}
          {item.userAgent && <div className="break-all"><span className="font-medium text-gray-400">UA:</span> {item.userAgent}</div>}
        </div>
      </section>

      <DeleteButton id={item.id} />
    </div>
  )
}
