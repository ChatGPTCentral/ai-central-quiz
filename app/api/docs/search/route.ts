import { NextRequest, NextResponse } from 'next/server'
import { searchDocs, notionConfigured } from '@/lib/notion'
import { checkRateLimit } from '@/lib/validation'

export const dynamic = 'force-dynamic'

// Public read-only search over the AI Central document database (Notion).
// Returns doc titles + summaries + tags; the body content stays gated behind
// the Stripe paywall (the client links each result to PAYMENT_URL).
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ docs: [], error: 'rate_limited' }, { status: 429 })
  }
  if (!notionConfigured()) {
    return NextResponse.json({ docs: [], configured: false })
  }
  const q = req.nextUrl.searchParams.get('q') || ''
  const docs = await searchDocs(q, 8)
  return NextResponse.json({ docs, configured: true })
}
