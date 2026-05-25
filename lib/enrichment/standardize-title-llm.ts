// LLM-backed standardization of a free-form LinkedIn headline → canonical
// job title, classified against the gpriday/job-titles Hugging Face dataset
// (https://huggingface.co/datasets/gpriday/job-titles).
//
// The full HF dataset is 65,248 titles deduplicated across ESCO, O*NET, and
// the Australian OSCA framework. Embedding that file is overkill — we instead
// instruct Claude to behave AS IF it had that list and pick the single most
// applicable canonical title.
//
// Tuning prompt is intentionally tight so output is one short string, no
// preamble, no markdown. Returns undefined if Anthropic is unconfigured.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'

const PROMPT = `You are a job-title standardizer. Map the following free-form LinkedIn headline to the SINGLE most-applicable canonical job title from the gpriday/job-titles Hugging Face dataset — a 65,248-entry deduplicated merge of ESCO, O*NET, and OSCA frameworks. Examples of canonical forms: "Chief Executive Officer", "Software Engineer", "Marketing Manager", "Account Executive", "Product Designer".

Rules:
- Output ONE canonical title only, in Title Case, max 6 words.
- No prefixes, suffixes, company names, brand names, or emojis.
- Strip seniority modifiers (Senior, Lead, Principal, Staff) unless they're part of the canonical form.
- If the headline is clearly not a job (e.g. "Investor", "Speaker", "Father") output: NONE
- Reply with the canonical title ONLY — no quotes, no explanation, no markdown.

Headline:`

export async function standardizeTitleWithLLM(headline: string): Promise<string | undefined> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return undefined
  if (!headline?.trim()) return undefined

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
        max_tokens: 30,
        messages: [{ role: 'user', content: `${PROMPT}\n${headline.trim()}` }],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error('Anthropic title-standardize error:', res.status)
      return undefined
    }
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    if (!text || text === 'NONE' || text.toLowerCase().startsWith('none')) return undefined
    // Clean up — strip markdown / quotes Claude sometimes adds
    const cleaned = text.replace(/^["'`*]+|["'`*]+$/g, '').replace(/\.$/, '').trim()
    if (!cleaned || cleaned.length > 80) return undefined  // sanity bound
    return cleaned
  } catch (err) {
    console.error('LLM title standardize failed:', err)
    return undefined
  }
}
