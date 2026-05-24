// AI-estimated socio-demographics from a profile photo.
//
// Calls Anthropic Claude's vision API to estimate apparent age bracket and
// gender presentation from a LinkedIn-style headshot. These are best-effort
// visual estimates for segmentation — never identity claims.
//
// Requires ANTHROPIC_API_KEY in env. Silently no-ops if missing.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'

export interface PhotoDemographics {
  ageBracket?: '18-25' | '26-35' | '36-45' | '46-55' | '56-65' | '65+' | 'uncertain'
  sexPresentation?: 'male' | 'female' | 'uncertain'
  confidence?: 'low' | 'medium' | 'high'
  raw?: unknown
  error?: string
}

const PROMPT = `You are a CRM enrichment assistant analyzing a publicly visible LinkedIn-style profile headshot.

Estimate the apparent age bracket and gender presentation visible in the image. These are best-effort VISUAL estimates from the photo only — never identity claims about the person.

If the image is missing, low quality, shows multiple people, or otherwise impossible to read, return "uncertain" for the relevant field.

Reply with JSON only, no prose, no markdown:
{"age_bracket":"18-25"|"26-35"|"36-45"|"46-55"|"56-65"|"65+"|"uncertain","sex_presentation":"male"|"female"|"uncertain","confidence":"low"|"medium"|"high"}`

export async function estimateDemographicsFromPhoto(photoUrl: string): Promise<PhotoDemographics> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not set' }
  if (!photoUrl) return { error: 'No photo URL' }

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: photoUrl } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      return { error: `Anthropic ${res.status}: ${err.slice(0, 200)}` }
    }
    const data = await res.json()
    const text: string = data?.content?.[0]?.text || ''
    // Extract the JSON object (be forgiving of stray whitespace / fences)
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'No JSON in Claude response', raw: data }
    let parsed: { age_bracket?: string; sex_presentation?: string; confidence?: string }
    try { parsed = JSON.parse(match[0]) } catch { return { error: 'JSON parse failed', raw: data } }
    return {
      ageBracket: parsed.age_bracket as PhotoDemographics['ageBracket'],
      sexPresentation: parsed.sex_presentation as PhotoDemographics['sexPresentation'],
      confidence: parsed.confidence as PhotoDemographics['confidence'],
      raw: data,
    }
  } catch (err) {
    return { error: String(err) }
  }
}
