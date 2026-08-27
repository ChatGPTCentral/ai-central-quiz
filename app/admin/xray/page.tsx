// Retired 2026-08-27: X-ray is now embedded at the top of /admin/dashboard
// (components/admin/XraySection.tsx), and this was its only nav entry. Kept
// as a redirect, not a delete, so an old bookmark still lands somewhere.

import { redirect } from 'next/navigation'

export default function XrayPage() {
  redirect('/admin/dashboard')
}
