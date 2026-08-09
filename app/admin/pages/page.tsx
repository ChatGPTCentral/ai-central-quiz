import PagesBrowser from './PagesBrowser.client'
import { resultsByArm } from '@/lib/result-variants'

export const dynamic = 'force-dynamic'

// ── Pages · every version of the result page, with links ────────────────
// Built because the owner had to ask for result-page links in chat over and
// over and got a hand-assembled list each time. The variants were never a
// secret, they were just never surfaced.

// LAYOUT NOTE. The admin shell gives .ac-main no padding, so every page
// supplies its own. This one supplied none, exactly like /admin/ads did, so it
// sat flush against the sidebar. Same p-8 wrapper and header shape as
// /admin/experiments and /admin/ads.
export default async function PagesPage() {
  // Server-side, because the results come from an RPC over the service role.
  const results = Object.fromEntries(await resultsByArm())

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Result pages</h1>
        <p className="text-sm text-[#9C9C9C]">
          Every version, with what it actually did. LIVE is what a visitor can be served today,
          RETIRED ran and lost, PREVIEW is a toggle for looking at something and was never served
          on its own, which is why it has no conversion number. Test clicks are excluded by default.
        </p>
      </div>
      <PagesBrowser results={results} />
    </div>
  )
}
