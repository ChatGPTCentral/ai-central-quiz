// Standalone route for THE X-RAY. The actual funnel-flow logic lives in
// components/admin/XraySection.tsx, shared with its embedded copy inside
// /admin/dashboard — one source of the SVG-building logic, two call sites.

import XraySection from '@/components/admin/XraySection'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function XrayPage() {
  return <XraySection />
}
