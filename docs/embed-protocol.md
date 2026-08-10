# The embed protocol — frozen contract for /embed/v1.js

`public/embed/v1.js` has an external consumer: the owner maintains a copy in a
separate widgets project (exported 2026-08-10). From that date, the v1
protocol below is a CONTRACT, not an implementation detail. Additive changes
are fine on either side; anything that breaks a clause here ships as a new
`v2.js`, never as an edit to v1 semantics.

## What the quiz app guarantees (this repo)

- `/quiz-v2` is iframable from any origin: `frame-ancestors *` and
  `X-Frame-Options: ALLOWALL` in next.config.js. Do not tighten these —
  every embed on thecentral.ai and every widget preview depends on them.
- `/embed/v1.js` is served with `Access-Control-Allow-Origin: *` and stays at
  this URL. The live homepage_slider on thecentral.ai loads it from here.
- The quiz reads two URL params to enter embed mode:
  - `embed=1` (or the presence of `ac-embed-id`)
  - `ac-embed-id=<opaque id>` — echoed back verbatim on every message
- Extra query params (utm_source, utm_ref, ...) are recorded as attribution.
- The quiz posts messages to `window.parent` with targetOrigin `'*'`:
  - `{ source: 'ai-central-quiz', embedId, type: 'form_resized', size: <px number> }`
    on every step change
  - `{ source: 'ai-central-quiz', embedId, type: 'form_submitted', redirectUrl: <personal result URL> }`
    on completion
  `source` and `embedId` are the filter fields; consumers ignore anything else.

## What the widget script guarantees (both copies)

- Builds the iframe URL as `<quiz origin>/quiz-v2` with `embed=1` +
  `ac-embed-id`, forwarding any non-namespaced `data-*` attribute on the embed
  element as a query param (`data-utm_source` → `utm_source=...`), and the host
  page's own query params when `data-inherit-parameters` is present.
- Survey-id aliases `quiz` and `quiz-v2` both resolve to `/quiz-v2`.
- Filters incoming messages on `source === 'ai-central-quiz'` and its own
  `embedId`; on `form_submitted` it redirects the host page to `redirectUrl`.
- Re-dispatches completion to the host page as a `ac-quiz-submitted`
  CustomEvent before redirecting, so host analytics can hook it.

## The one difference between the two copies

- The in-repo original derives the quiz origin from its own script tag (it is
  served BY the quiz app, so that is always right here).
- The exported copy pins `https://quiz.thecentral.ai` as the default and keeps
  `data-ac-domain` as the per-embed override, because it is served from a
  different origin.

## Placement rule

`data-utm_source="homepage_slider"` on the thecentral.ai homepage keeps that
exact value forever — 466 takers of history hang off it (see
docs/site-embed-tagging.md).
