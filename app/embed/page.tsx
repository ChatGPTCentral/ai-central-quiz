/* Embed snippet docs — pick a config, copy the snippet, paste into GTM
 * or any HTML page. The preview at the bottom uses the same snippet so
 * you can validate the button + popup live.
 */
export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Embed snippet — AI Central',
  robots: { index: false, follow: false },
}

export default function EmbedDocs() {
  const example = `<div data-ac-survey-id="quiz"
     data-ac-embed-type="slider"
     data-button-text="Receive a gift 🎁"
     data-button-size="large"
     data-button-color="#E48715"
     data-button-float="bottom-right"
     data-slider-direction="right"
     data-inherit-parameters
     data-utm_source="homepage_slider"></div>
<script src="https://ai-central-quiz.vercel.app/embed/v1.js"></script>`

  return (
    <main style={{ maxWidth: 880, margin: '40px auto', padding: '0 20px', fontFamily: 'Inter, system-ui, sans-serif', color: '#333333' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9C9C9C' }}>AI Central · embed v1</div>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: '6px 0 8px' }}>Drop-in survey widget</h1>
        <p style={{ color: '#555', lineHeight: 1.55 }}>
          Replace the Fillout embed snippet with these two lines. Same data-attribute API as Fillout - - same pill button, slider/popup,
          floats over your site - - except the quiz lives on AI Central and data lands directly in the CRM.
        </p>
      </header>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Snippet (copy into GTM or your page)</h2>
        <pre style={{ background: '#171717', color: '#E48715', padding: 16, borderRadius: 10, overflowX: 'auto', fontSize: 12, lineHeight: 1.6 }}>{example}</pre>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Attributes</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #E8E4DF' }}>
            <th style={{ padding: '8px 6px' }}>Attribute</th><th>Default</th><th>Values</th>
          </tr></thead>
          <tbody style={{ verticalAlign: 'top' }}>
            <Row name="data-ac-survey-id" def="quiz" vals="quiz · quiz-v2 (when live)" />
            <Row name="data-ac-embed-type" def="popup" vals="popup · slider · standard · fullscreen" />
            <Row name="data-button-text" def="Take the quiz" vals="any string" />
            <Row name="data-button-color" def="#E48715" vals="any hex" />
            <Row name="data-button-size" def="medium" vals="small · medium · large" />
            <Row name="data-button-float" def="(none)" vals="bottom-right · bottom-left" />
            <Row name="data-slider-direction" def="right" vals="right · left" />
            <Row name="data-popup-size" def="large" vals="small · medium · large" />
            <Row name="data-inherit-parameters" def="off" vals="presence = inherit ?utm_*, ?ref, etc." />
            <Row name="data-utm_source / data-anything" def="-" vals="passes through as URL param on the quiz iframe" />
            <Row name="data-ac-domain" def="(this origin)" vals="override base URL (rarely needed)" />
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Events (parent page can listen)</h2>
        <pre style={{ background: '#F5F5F5', padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>{`window.addEventListener('ac-quiz-submitted', (e) => {
  // e.detail = { archetype, name, score, email }
  console.log('Quiz submitted:', e.detail)
})`}</pre>
      </section>

      <section style={{ marginBottom: 28, padding: 16, background: '#FEF7E7', borderRadius: 10, border: '1px solid #E48715' }}>
        <strong>Live preview:</strong> the pill button is floating in the bottom-right of this page right now.
        Click it to see the slider in action.
      </section>

      <div
        data-ac-survey-id="quiz"
        data-ac-embed-type="slider"
        data-button-text="Receive a gift 🎁"
        data-button-size="large"
        data-button-color="#E48715"
        data-button-float="bottom-right"
        data-slider-direction="right"
        data-inherit-parameters="true"
        data-utm_source="embed_docs"
      />
      <script src="/embed/v1.js" defer />
    </main>
  )
}

function Row({ name, def, vals }: { name: string; def: string; vals: string }) {
  return (
    <tr style={{ borderBottom: '1px solid #F5F5F5' }}>
      <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>{name}</td>
      <td style={{ padding: '8px 6px', color: '#9C9C9C', fontFamily: 'monospace', fontSize: 12 }}>{def}</td>
      <td style={{ padding: '8px 6px' }}>{vals}</td>
    </tr>
  )
}
