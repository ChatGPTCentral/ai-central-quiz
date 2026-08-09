import PagesBrowser from './PagesBrowser.client'

export const dynamic = 'force-dynamic'

// ── Pages · every version of the result page, with links ────────────────
// Built because the owner had to ask for result-page links in chat over and
// over and got a hand-assembled list each time. The variants were never a
// secret, they were just never surfaced.

// LAYOUT NOTE. The admin shell gives .ac-main no padding, so every page
// supplies its own. This one supplied none, exactly like /admin/ads did, so it
// sat flush against the sidebar. Same p-8 wrapper and header shape as
// /admin/experiments and /admin/ads.
export default function PagesPage() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Result pages</h1>
        <p className="text-sm text-[#9C9C9C]">
          Every version, previewed live and linkable. Pick a variant, a stage and a device;
          the link updates and copies in one click. Test clicks are excluded by default.
        </p>
      </div>
      <PagesBrowser />
    </div>
  )
}
