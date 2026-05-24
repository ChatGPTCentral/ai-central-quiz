import { headers } from 'next/headers'
import AdminShell from '@/components/admin/AdminShell.client'

export const dynamic = 'force-dynamic'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Middleware sets x-pathname for authenticated routes.
  // Login page is public → render bare (no sidebar/shell).
  const path = headers().get('x-pathname') || ''
  if (!path || path.startsWith('/admin/login')) {
    return <>{children}</>
  }
  // Default shell — pages that need a right sidebar (e.g. /admin/dashboard with filters)
  // can pass their own via a child <AdminShell> override (Next App Router will compose).
  // For simplicity we use a single shell here without rightSidebar; the dashboard page
  // renders its own filter panel inline.
  return <AdminShell>{children}</AdminShell>
}
