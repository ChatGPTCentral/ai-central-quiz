import PagesBrowser from './PagesBrowser.client'

export const dynamic = 'force-dynamic'

// ── Pages · every version of the result page, with links ────────────────
// Built because the owner had to ask for result-page links in chat over and
// over and got a hand-assembled list each time. The variants were never a
// secret, they were just never surfaced.

export default function PagesPage() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#1A1A1A' }}>
          Result pages
        </h1>
        <p style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4, maxWidth: 720, lineHeight: 1.5 }}>
          Every version, previewed live and linkable. Pick a variant, a stage and a device;
          the link updates and copies in one click. Test clicks are excluded by default.
        </p>
      </div>
      <PagesBrowser />
    </div>
  )
}
