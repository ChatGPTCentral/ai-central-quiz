# Tagging every quiz entry point on thecentral.ai

## Why

The dashboard shows one coarse bucket, `thecentral.ai`, covering most site
placements (119 launch takers, ~0.8% net-new paid so far), while the one
deliberately-tagged unit — `homepage_slider` — reads 16.7%. Until each
placement carries its own `utm_source`, we cannot tell which site placements
work and which merely add volume. This is a paste-only change on the main
site; the quiz app needs no deploy.

As a safety net, the quiz now also logs the external `document.referrer` on
the `quiz_view` event, so untagged entries can at least be traced to the page
they came from. Tags remain the source of truth — the referrer is diagnostic.

## How tagging works

- **Embeds** (`/embed/v1.js`): any `data-utm_source` (and other
  non-namespaced `data-*`) attribute on the embed element is forwarded into
  the quiz URL automatically. Adding `data-inherit-parameters` ALSO forwards
  the parent page's own query params (use on blog posts that receive tagged
  campaign traffic).
- **Direct links**: append `?utm_source=...` (and optionally `&utm_ref=...`)
  to `https://quiz.thecentral.ai/quiz-v2`.
- Values land on the submission row (`utm_source`, `utm_ref`), the dashboard
  UTM chart and source table (`/admin/dashboard`), the advanced filter, and
  the CSV export — no further setup.

## Naming convention

`utm_source` = WHERE the entry point lives (one value per placement).
`utm_ref` = optional variant/campaign detail within that placement.

Keep `homepage_slider` as-is (its history is valuable).

## Snippets per placement

Replace each untagged embed/link on thecentral.ai with the matching version:

**Navigation bar link**
```html
<a href="https://quiz.thecentral.ai/quiz-v2?utm_source=site_nav">Am I AI-ready?</a>
```

**Footer link**
```html
<a href="https://quiz.thecentral.ai/quiz-v2?utm_source=site_footer">Take the AI readiness quiz</a>
```

**Inline embed inside a blog post / tutorial page**
```html
<div data-ac-survey-id="quiz" data-ac-embed-type="inline"
     data-utm_source="blog_inline" data-inherit-parameters></div>
<script src="https://quiz.thecentral.ai/embed/v1.js" async></script>
```

**Popup / button embed on a landing page**
```html
<div data-ac-survey-id="quiz" data-ac-embed-type="popup"
     data-button-text="Take the quiz" data-utm_source="landing_popup"></div>
<script src="https://quiz.thecentral.ai/embed/v1.js" async></script>
```

**Homepage banner / hero (if any, distinct from the slider)**
```html
<a href="https://quiz.thecentral.ai/quiz-v2?utm_source=homepage_hero">…</a>
```

**Newsletter (Beehiiv) links** — per send:
```
https://quiz.thecentral.ai/quiz-v2?utm_source=newsletter&utm_ref=<issue-or-campaign>
```

## Already tagged automatically (no action)

- `homepage_slider` — existing tag, keep.
- `pass_share` — new: visitors arriving from a shared member pass.
- `lifecycle` — reserved for the upcoming post-quiz email sequence.
- `li_ads` — reserved for future LinkedIn ads (flows end-to-end today).

## After pasting

Give it a day of traffic, then check the dashboard (`/admin/dashboard`)
source breakdown. The `thecentral.ai` bucket should shrink toward zero as the new
names take over; whatever remains is stale caches or unknown placements
(check the new `referrer` prop on `quiz_view` events to hunt those down).
