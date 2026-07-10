import AdminShell from '@/components/admin/AdminShell.client'
export const dynamic = 'force-dynamic'
export default function P() {
  return (
    <AdminShell>
      <div className="p-8">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Dashboard</h1>
        <p className="text-sm text-[#9C9C9C]">Shell preview — content area</p>
      </div>
    </AdminShell>
  )
}
