import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Archive, Award, CalendarDays, Landmark, Megaphone, Users, Wallet } from 'lucide-react'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { PageHeader } from '../components/common/PageHeader'
import { ErrorState, SkeletonCardGrid } from '../components/common/StateFeedback'
import { Button, Surface } from '../components/common/ui'
import { useAuthStore } from '../stores/authStore'
import { useParishProfileStore } from '../stores/parishProfileStore'

const destinations = [
  { title: 'Hồ sơ Xứ đoàn', description: 'Lịch sử, cơ cấu, nhân sự, hoạt động, thành tích và timeline.', to: '/parish-profile', icon: Landmark, adminOnly: false },
  { title: 'Huynh trưởng / GLV', description: 'Tài khoản, phân công giảng dạy và thông tin phục vụ.', to: '/catechists', icon: Users, adminOnly: true },
  { title: 'Lịch & sự kiện', description: 'Lịch phụng vụ và hoạt động đang vận hành.', to: '/calendar', icon: CalendarDays, adminOnly: false },
  { title: 'Thông báo', description: 'Thông tin điều hành gửi tới các nhóm liên quan.', to: '/notices', icon: Megaphone, adminOnly: false },
  { title: 'Quỹ & thu chi', description: 'Theo dõi quỹ, giao dịch và nghĩa vụ tài chính.', to: '/finances', icon: Wallet, adminOnly: true },
] as const

export default function OrganizationDashboardPage() {
  const navigate = useNavigate()
  const role = useAuthStore(state => state.user?.role)
  const snapshot = useParishProfileStore(state => state.snapshot)
  const isLoading = useParishProfileStore(state => state.isLoading)
  const error = useParishProfileStore(state => state.error)
  const fetchSnapshot = useParishProfileStore(state => state.fetchSnapshot)

  useEffect(() => { void fetchSnapshot() }, [fetchSnapshot])

  if (isLoading && !snapshot) return <DesktopAppShell width="wide"><SkeletonCardGrid count={5} /></DesktopAppShell>
  if (!snapshot) return <DesktopAppShell width="wide"><ErrorState message={error || undefined} onRetry={() => void fetchSnapshot()} /></DesktopAppShell>

  const publishedRecords = snapshot.records.filter(item => item.status === 'PUBLISHED')
  const personnelCount = snapshot.people.length > 0 ? snapshot.people.length : (snapshot.accounts?.length || 0)
  const stats = [
    { label: 'Nhân sự', value: personnelCount, icon: Users },
    { label: 'Đơn vị hoạt động', value: snapshot.units.filter(item => item.isActive).length, icon: Landmark },
    { label: 'Hoạt động & cột mốc', value: publishedRecords.length, icon: Award },
    { label: 'Tư liệu', value: snapshot.assets.length, icon: Archive },
  ]

  return (
    <DesktopAppShell width="wide" className="space-y-4">
      <PageHeader
        title="Xứ đoàn & Giáo xứ"
        description={`${snapshot.profile.displayName} · Không gian tổ chức, vận hành và bộ nhớ số`}
        icon={<Landmark aria-hidden="true" className="h-5 w-5" />}
        actions={<Button size="sm" onClick={() => navigate({ to: '/parish-profile' })}>Mở Hồ sơ Xứ đoàn</Button>}
      />

      <section aria-label="Số liệu Xứ đoàn" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(item => <Surface key={item.label} variant="card" className="p-4"><item.icon aria-hidden="true" className="h-5 w-5 text-parish-primary" /><div className="mt-3 text-2xl font-extrabold text-text-main">{item.value}</div><div className="mt-1 text-xs font-bold uppercase tracking-wide text-text-muted">{item.label}</div></Surface>)}
      </section>

      <section aria-labelledby="organization-tools-title">
        <h2 id="organization-tools-title" className="typography-section-title">Công việc Xứ đoàn</h2>
        <p className="mt-1 typography-body-sm text-text-muted">Mỗi chức năng dùng chung tài khoản, dữ liệu, phân quyền và nhật ký hệ thống của Catevia.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {destinations.filter(item => !item.adminOnly || role === 'admin').map(item => (
            <button key={item.to} type="button" onClick={() => navigate({ to: item.to })} className="entity-card app-panel--interactive min-h-28 p-4 text-left">
              <item.icon aria-hidden="true" className="h-5 w-5 text-parish-primary" />
              <span className="mt-3 block typography-card-title">{item.title}</span>
              <span className="mt-1 block typography-body-sm text-text-muted">{item.description}</span>
            </button>
          ))}
        </div>
      </section>
    </DesktopAppShell>
  )
}
