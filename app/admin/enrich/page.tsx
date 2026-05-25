import { redirect } from 'next/navigation'

// Re-enrich batch UI was retired — now the per-row "Enrich" page (formerly Lab)
// handles all enrichment operations.
export default function EnrichRedirect() {
  redirect('/admin/lab')
}
