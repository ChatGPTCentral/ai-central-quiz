import { redirect } from 'next/navigation'

// The funnel now lives on the dashboard; this stub keeps old links working.
export default function FunnelRedirect() {
  redirect('/admin/dashboard')
}
