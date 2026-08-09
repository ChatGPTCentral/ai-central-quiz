import AdsPanel from './AdsPanel.client'

// Paid acquisition, judged against one honest bar.
//
// The quiz database and the LinkedIn ads agent already share a Postgres, so the
// two halves of the funnel were never really separate — they just had no single
// screen. This is that screen: LinkedIn owns spend, we own what happened after
// the click, and the only question worth asking is whether the two reconcile.
//
// LAYOUT NOTE. The admin shell deliberately gives `.ac-main` no padding, so
// every page supplies its own. This one supplied none, which is why it sat
// flush against the sidebar while its siblings breathed. It now uses the same
// `p-8` wrapper and the same header shape as /admin/experiments, so the two
// screens read as one product rather than two.

export const dynamic = 'force-dynamic'

export default function AdsPage() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Ads</h1>
        <p className="text-sm text-[#9C9C9C]">
          What paid traffic does after it lands, and whether it pays for itself. LinkedIn owns the
          spend, this screen owns everything that happened after the click.
        </p>
      </div>
      <AdsPanel />
    </div>
  )
}
