import { useEffect, useMemo, useState } from 'react'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { useNavigate } from '@tanstack/react-router'
import {
  Archive, Award, CalendarDays, ClipboardList, Landmark, Megaphone, Sparkles, Users, Wallet,
  ChevronRight, Clock, MapPin, UserCheck,
  Bell, Building2,
} from 'lucide-react'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { PageHeader } from '../components/common/PageHeader'
import { ErrorState, SkeletonCardGrid } from '../components/common/StateFeedback'
import { Button, Surface, Badge } from '../components/common/ui'
import { ParishLogoModal } from '../components/parish/ParishLogoModal'
import { useAuthStore } from '../stores/authStore'
import { useParishProfileStore } from '../stores/parishProfileStore'
import { useParishEventStore } from '../stores/parishEventStore'
import { useNoticeStore } from '../stores/noticeStore'
import { useOperationsStore } from '../stores/operationsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { selectUpcomingPortalEvents } from '../utils/parishPortal'
import { compareTermsByAuthority, hasCoordinationRole, isTermActiveOn } from '../utils/parishTerms'

function formatDate(value: string | null | undefined) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

const destinations = [
  { title: 'Hồ sơ Xứ đoàn', description: 'Lịch sử, cơ cấu, nhân sự, tư liệu, thành tích và timeline.', to: '/parish-profile', icon: Landmark, adminOnly: false },
  { title: 'Huynh trưởng / GLV', description: 'Danh bạ, phân công giảng dạy và thông tin phục vụ.', to: '/catechists', icon: Users, adminOnly: false },
  { title: 'Lịch & sự kiện', description: 'Lịch phụng vụ và hoạt động đang vận hành.', to: '/calendar', icon: CalendarDays, adminOnly: false },
  { title: 'Công việc', description: 'Phân công, theo dõi tiến độ và việc của tôi.', to: '/operations', icon: ClipboardList, adminOnly: false },
  { title: 'Thông báo', description: 'Thông tin điều hành gửi tới các nhóm liên quan.', to: '/notices', icon: Megaphone, adminOnly: false },
  { title: 'Quỹ & thu chi', description: 'Theo dõi quỹ, giao dịch và nghĩa vụ tài chính.', to: '/finances', icon: Wallet, adminOnly: true },
] as const

export default function OrganizationDashboardPage() {
  const navigate = useNavigate()
  const [showLogoModal, setShowLogoModal] = useState(false)
  const user = useAuthStore(state => state.user)
  const role = user?.role
  const displayName = user?.fullName || 'Huynh trưởng'
  const parishName = useSettingsStore(state => state.settings.parishName)

  // Lời chào theo thời gian trong ngày
  const greeting = useMemo(() => {
    const hours = new Date().getHours()
    if (hours >= 5 && hours < 11) return 'Chào buổi sáng'
    if (hours >= 11 && hours < 14) return 'Chào buổi trưa'
    if (hours >= 14 && hours < 18) return 'Chào buổi chiều'
    return 'Chào buổi tối'
  }, [])

  const roleLabel = useMemo(() => {
    if (role === 'admin') return 'Ban Quản trị'
    if (role === 'chunhiem') return 'Chủ nhiệm'
    if (role === 'phuta') return 'Phụ tá'
    if (role === 'phuhuynh') return 'Phụ huynh'
    return 'Huynh Trưởng / GLV'
  }, [role])

  const rawSnapshot = useParishProfileStore(state => state.snapshot)
  const currentYear = useAcademicYearStore(state => state.currentYear)
  const snapshot = useMemo(() => rawSnapshot ? { ...rawSnapshot, units: rawSnapshot.units.filter(unit => !unit.academicYearId || unit.academicYearId === currentYear) } : null, [rawSnapshot, currentYear])
  const isLoading = useParishProfileStore(state => state.isLoading)
  const error = useParishProfileStore(state => state.error)
  const fetchSnapshot = useParishProfileStore(state => state.fetchSnapshot)

  const events = useParishEventStore(state => state.events)
  const eventsError = useParishEventStore(state => state.error)
  const eventsSource = useParishEventStore(state => state.source)
  const fetchEvents = useParishEventStore(state => state.fetchEvents)
  const notices = useNoticeStore(state => state.notices)
  const fetchNotices = useNoticeStore(state => state.fetchNotices)
  const tasks = useOperationsStore(state => state.tasks)
  const fetchOperations = useOperationsStore(state => state.fetch)

  useEffect(() => {
    void fetchSnapshot()
    void fetchEvents()
    void fetchNotices()
    if (role !== 'phuhuynh') {
      void fetchOperations().catch(() => undefined)
    }
  }, [fetchSnapshot, fetchEvents, fetchNotices, fetchOperations, role])

  const pendingAcknowledgements = useMemo(() => {
    return tasks.filter(task => task.status !== 'DONE' && task.status !== 'CANCELLED' && task.myAssignments?.some(a => a.acknowledgementStatus === 'PENDING')).length
  }, [tasks])

  const myTasksCount = useMemo(() => {
    return tasks.filter(task => task.status !== 'DONE' && task.status !== 'CANCELLED').length
  }, [tasks])

  const peopleById = useMemo(() => new Map(snapshot?.people.map(p => [p.id, p]) ?? []), [snapshot?.people])
  const unitsById = useMemo(() => new Map(snapshot?.units.map(u => [u.id, u]) ?? []), [snapshot?.units])

  // Lọc nhiệm kỳ đang hiệu lực (đã bắt đầu, chưa kết thúc), Trưởng có quyền điều phối trước
  const currentLeadership = useMemo(() => {
    if (!snapshot) return []
    const todayStr = new Date().toISOString().slice(0, 10)
    const activeTerms = snapshot.terms.filter(term => isTermActiveOn(term, todayStr))
    return activeTerms
      .map(term => ({
        term,
        person: peopleById.get(term.personId),
        unit: term.unitId ? unitsById.get(term.unitId) : null,
      }))
      .filter(item => Boolean(item.person))
      .sort((a, b) => compareTermsByAuthority(a.term, b.term))
  }, [snapshot, peopleById, unitsById])

  // Sự kiện sắp diễn ra trong 14 ngày tới
  const upcomingEvents = useMemo(() => {
    return selectUpcomingPortalEvents(events)
  }, [events])

  // Thông báo mới nhất
  const recentNotices = useMemo(() => {
    return [...notices]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 3)
  }, [notices])

  // Hoạt động tiêu biểu gần nhất
  const recentHighlights = useMemo(() => {
    if (!snapshot) return []
    return snapshot.records
      .filter(r => r.status === 'PUBLISHED')
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
      .slice(0, 3)
  }, [snapshot])

  if (isLoading && !snapshot) return <DesktopAppShell width="wide"><SkeletonCardGrid count={6} /></DesktopAppShell>
  if (!snapshot) return <DesktopAppShell width="wide"><ErrorState message={error || undefined} onRetry={() => void fetchSnapshot()} /></DesktopAppShell>

  const publishedRecords = snapshot.records.filter(item => item.status === 'PUBLISHED')
  const totalPeople = snapshot.people.length > 0 ? snapshot.people.length : (snapshot.accounts?.length || 0)
  const activePeopleCount = snapshot.people.filter(p => p.serviceStatus === 'ACTIVE').length
  const activeUnitsCount = snapshot.units.filter(item => item.isActive).length

  return (
    <DesktopAppShell width="wide" className="space-y-3 sm:space-y-3.5">
      {/* 1. Khung Chào Mobile — Đồng bộ Cổng Học Vụ kèm nút xem Ý Nghĩa Logo Xứ Đoàn */}
      <div className="mobile-home-hero block md:hidden">
        <div className="relative z-1 flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-amber-300/80 shrink-0" aria-hidden="true" />
            <span className="text-xs font-bold tracking-[0.08em] text-amber-200/80 uppercase">
              {parishName || 'Giáo Xứ Gia Tôn'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowLogoModal(true)}
            className="flex items-center gap-1.5 rounded-full bg-amber-400/20 hover:bg-amber-400/30 active:bg-amber-400/40 px-2.5 py-1 text-xs font-bold text-amber-200 border border-amber-300/30 shadow-sm transition-colors"
            aria-label="Xem Ý Nghĩa Logo Xứ Đoàn"
          >
            <Sparkles size={11} className="text-amber-300" aria-hidden="true" />
            <span>Ý Nghĩa Logo</span>
          </button>
        </div>

        <div className="relative z-1 my-0.5">
          <div className="text-xs font-semibold text-white/80 leading-none mb-1">{greeting},</div>
          <h2 className="text-2xl font-black m-0 tracking-tight text-white leading-tight">
            {displayName}
          </h2>
        </div>
        <p className="relative z-1 text-xs text-white/70 mt-1 m-0 font-medium leading-relaxed">
          {roleLabel} · {snapshot.profile.displayName || 'Xứ Đoàn Đức Mẹ Fatima'}
        </p>
      </div>

      {/* Page Header hợp nhất Căn Tính Xứ Đoàn (Ẩn trên mobile vì MobileTopBar đã hiển thị tên trang) */}
      <div className="hidden md:block">
        <PageHeader
          title={
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-parish-primary">
                  Phong trào Thiếu Nhi Thánh Thể Việt Nam
                </span>
                {snapshot.profile.patronName && (
                  <Badge tone="primary">Bổn mạng {snapshot.profile.patronName}</Badge>
                )}
                {snapshot.profile.foundedDate && (
                  <span className="text-xs text-text-muted">
                    · Thành lập {formatDate(snapshot.profile.foundedDate)}
                  </span>
                )}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-text-main tracking-tight">
                {snapshot.profile.displayName}
              </div>
            </div>
          }
          description={
            <div className="space-y-1 mt-1">
              {snapshot.profile.motto && (
                <p className="text-sm font-extrabold text-parish-primary italic m-0">
                  “{snapshot.profile.motto}”
                </p>
              )}
              {snapshot.profile.description && (
                <p className="text-xs text-text-secondary line-clamp-2 m-0">
                  {snapshot.profile.description}
                </p>
              )}
            </div>
          }
          icon={<Landmark aria-hidden="true" className="h-6 w-6" />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Sparkles className="h-4 w-4 text-parish-secondary" />}
                onClick={() => setShowLogoModal(true)}
              >
                Ý Nghĩa Logo
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<CalendarDays className="h-4 w-4" />}
                onClick={() => navigate({ to: '/calendar' })}
              >
                Lịch Phụng Vụ
              </Button>
              <Button
                size="sm"
                leadingIcon={<Landmark className="h-4 w-4" />}
                onClick={() => navigate({ to: '/parish-profile' })}
              >
                Hồ Sơ Xứ Đoàn
              </Button>
            </div>
          }
        />
      </div>

      {/* Banner Nhắc Việc Đang Chờ Tiếp Nhận */}
      {pendingAcknowledgements > 0 && (
        <Surface variant="card" className="p-3.5 sm:p-4 rounded-2xl border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <ClipboardList size={18} />
            </div>
            <div>
              <strong className="text-xs sm:text-sm font-bold text-text-main block">
                Bạn có {pendingAcknowledgements} công việc đang chờ tiếp nhận
              </strong>
              <span className="text-xs text-text-muted">
                Vui lòng kiểm tra và xác nhận trách nhiệm được phân công trong các sự kiện Xứ đoàn.
              </span>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 self-end sm:self-center"
            onClick={() => navigate({ to: '/operations' })}
          >
            Xem công việc
          </Button>
        </Surface>
      )}

      {/* Thống Kê Tổng Quan (Executive KPI Strip) */}
      <section aria-label="Số liệu Xứ đoàn" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Surface
          variant="card"
          as="button"
          type="button"
          interactive
          onClick={() => navigate({ to: '/parish-profile', search: { tab: 'people' } })}
          className="p-4 flex flex-col justify-between text-left cursor-pointer transition-colors group"
          title="Xem danh sách hồ sơ Huynh Trưởng / GLV"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted group-hover:text-parish-primary transition-colors">Huynh Trưởng / GLV</span>
            <Users className="h-4 w-4 text-parish-primary group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-text-main">{totalPeople}</span>
            <span className="text-xs font-semibold text-parish-success">{activePeopleCount} tại nhiệm</span>
          </div>
        </Surface>

        <Surface
          variant="card"
          as="button"
          type="button"
          interactive
          onClick={() => navigate({ to: '/parish-profile', search: { tab: 'organization' } })}
          className="p-4 flex flex-col justify-between text-left cursor-pointer transition-colors group"
          title="Xem sơ đồ cơ cấu tổ chức và các ban ngành"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted group-hover:text-parish-primary transition-colors">Đơn Vị Trực Thuộc</span>
            <Building2 className="h-4 w-4 text-parish-primary group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-text-main">{activeUnitsCount}</span>
            <span className="text-xs text-text-muted">Ban, Ngành, Chi đoàn</span>
          </div>
        </Surface>

        <Surface
          variant="card"
          as="button"
          type="button"
          interactive
          onClick={() => navigate({ to: '/parish-profile', search: { tab: 'history' } })}
          className="p-4 flex flex-col justify-between text-left cursor-pointer transition-colors group"
          title="Xem các cột mốc lịch sử và sự kiện nổi bật"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted group-hover:text-parish-primary transition-colors">Hoạt Động & Cột Mốc</span>
            <Award className="h-4 w-4 text-parish-primary group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-text-main">{publishedRecords.length}</span>
            <span className="text-xs text-text-muted">Đã lưu trữ số</span>
          </div>
        </Surface>

        <Surface
          variant="card"
          as="button"
          type="button"
          interactive
          onClick={() => navigate({ to: '/parish-profile', search: { tab: 'archive' } })}
          className="p-4 flex flex-col justify-between text-left cursor-pointer transition-colors group"
          title="Xem kho ảnh, video và văn kiện lưu trữ"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted group-hover:text-parish-primary transition-colors">Kho Tư Liệu</span>
            <Archive className="h-4 w-4 text-parish-primary group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-text-main">{snapshot.assets.length}</span>
            <span className="text-xs text-text-muted">Ảnh, video, văn kiện</span>
          </div>
        </Surface>
      </section>

      {/* Hai Cột Chính Trên Desktop (lg:grid-cols-12) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* CỘT TRÁI (8 CỘT): Ban Điều Hành + Lịch Sắp Tới + Cột Mốc Nổi Bật */}
        <div className="lg:col-span-8 space-y-5">
          {/* Widget: Ban Điều Hành & Nhân Sự Đương Nhiệm */}
          <Surface variant="card" className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-text-main m-0 flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-parish-primary" />
                  Ban Điều Hành & Nhân Sự Đương Nhiệm
                </h3>
                <p className="text-xs text-text-muted mt-0.5 m-0">
                  Nhiệm kỳ và các vị trí lãnh đạo, phụ trách các ban ngành hiện nay.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-bold text-parish-primary"
                onClick={() => navigate({ to: '/parish-profile', search: { tab: 'organization' } })}
              >
                Xem tất cả
              </Button>
            </div>

            {currentLeadership.length === 0 ? (
              <div className="py-6 text-center text-xs text-text-muted">
                Chưa có nhiệm kỳ nào được ghi nhận đang hoạt động. Vui lòng cập nhật trong Hồ sơ Xứ đoàn.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {currentLeadership.slice(0, 6).map(({ term, person, unit }) => (
                  <div
                    key={term.id}
                    onClick={() => navigate({ to: '/parish-profile', search: { tab: 'organization' } })}
                    className="p-3 rounded-xl bg-surface-app hover:bg-surface-hover border border-surface-border flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    title={`Xem cơ cấu của ${person?.fullName || 'nhân sự'}`}
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-black text-text-main block truncate">
                        {person?.holyName && (
                          <span className="font-bold text-parish-primary mr-1">{person.holyName}</span>
                        )}
                        {person?.fullName}
                      </span>
                      <span className="text-xs font-semibold text-text-muted truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{term.positionTitle} {unit ? `· ${unit.name}` : ''}</span>
                        {hasCoordinationRole(term) && <Badge tone="primary">Điều phối</Badge>}
                      </span>
                    </div>
                    {term.rankTitle && (
                      <Badge tone="neutral" className="shrink-0">
                        {term.rankTitle}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Surface>

          {/* Widget: Lịch Sự Kiện & Phụng Vụ Sắp Tới */}
          <Surface variant="card" className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-text-main m-0 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-parish-primary" />
                  Sự Kiện & Phụng Vụ Sắp Tới
                </h3>
                <p className="text-xs text-text-muted mt-0.5 m-0">
                  Các ngày lễ lớn, tĩnh tâm, sinh hoạt và chương trình của Xứ đoàn.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-bold text-parish-primary"
                onClick={() => navigate({ to: '/calendar' })}
              >
                Xem lịch đầy đủ
              </Button>
            </div>

            {eventsError && (
              <p role="status" className="m-0 rounded-xl border border-parish-warning/30 bg-parish-warning-bg/40 px-3 py-2 text-xs font-semibold text-parish-warning">
                {eventsSource === 'cache'
                  ? 'Đang hiển thị lịch đã lưu trên thiết bị; thay đổi sự kiện cần kết nối máy chủ.'
                  : 'Chưa thể tải lịch Xứ đoàn từ máy chủ. Vui lòng thử lại khi có kết nối.'}
              </p>
            )}

            {upcomingEvents.length === 0 ? (
              <div className="py-6 text-center text-xs text-text-muted">
                Không có sự kiện phụng vụ nào sắp diễn ra trong 14 ngày tới.
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {upcomingEvents.map(event => (
                  <div key={event.id} className="py-3 first:pt-1 last:pb-1 flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone="primary">{event.categoryName || event.category}</Badge>
                        <span className="text-xs font-extrabold text-text-main">{event.title}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted">
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {formatDate(event.date)} {event.time ? `· ${event.time}` : ''}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} /> {event.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Surface>

          {/* Widget: Hoạt Động & Cột Mốc Gần Nhất */}
          {recentHighlights.length > 0 && (
            <Surface variant="card" className="p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-text-main m-0 flex items-center gap-2">
                    <Award className="h-4 w-4 text-parish-primary" />
                    Hoạt Động & Thành Tích Tiêu Biểu
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5 m-0">
                    Những sự kiện và mốc son đáng nhớ được lưu giữ trong bộ nhớ số.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs font-bold text-parish-primary"
                  onClick={() => navigate({ to: '/parish-profile', search: { tab: 'history' } })}
                >
                  Xem toàn bộ
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {recentHighlights.map(record => (
                  <div
                    key={record.id}
                    onClick={() => navigate({ to: '/parish-profile', search: { tab: record.recordType === 'ACHIEVEMENT' ? 'achievements' : 'history' } })}
                    className="p-3 rounded-xl bg-surface-app hover:bg-surface-hover border border-surface-border flex flex-col justify-between gap-2 cursor-pointer transition-colors"
                    title={`Xem chi tiết ${record.title} trong Hồ sơ Xứ đoàn`}
                  >
                    <div>
                      <span className="text-xs font-black uppercase text-parish-primary block">
                        {record.recordType === 'MILESTONE' ? 'Cột mốc' : record.recordType === 'ACHIEVEMENT' ? 'Thành tích' : 'Hoạt động'}
                      </span>
                      <h4 className="text-xs font-bold text-text-main m-0 mt-1 line-clamp-2">
                        {record.title}
                      </h4>
                      {record.summary && (
                        <p className="text-xs text-text-muted mt-1 m-0 line-clamp-2">
                          {record.summary}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-text-muted font-medium pt-1 border-t border-surface-border/60">
                      {formatDate(record.occurredOn)}
                    </span>
                  </div>
                ))}
              </div>
            </Surface>
          )}
        </div>

        {/* CỘT PHẢI (4 CỘT): Thông Báo Điều Hành + Công Việc Xứ Đoàn */}
        <div className="lg:col-span-4 space-y-5">
          {/* Widget: Thông Báo Điều Hành Mới Nhất */}
          <Surface variant="card" className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
              <h3 className="text-sm font-extrabold text-text-main m-0 flex items-center gap-2">
                <Bell className="h-4 w-4 text-parish-primary" />
                Thông Báo Điều Hành
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-bold text-parish-primary px-1"
                onClick={() => navigate({ to: '/notices' })}
              >
                Tất cả
              </Button>
            </div>

            {recentNotices.length === 0 ? (
              <p className="text-xs text-text-muted py-4 text-center m-0">
                Chưa có thông báo điều hành nào.
              </p>
            ) : (
              <div className="divide-y divide-surface-border">
                {recentNotices.map(n => (
                  <div key={n.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                    <span className="text-xs font-bold text-text-main block line-clamp-2 hover:text-parish-primary transition-colors cursor-pointer" onClick={() => navigate({ to: '/notices' })}>
                      {n.title}
                    </span>
                    <span className="text-xs text-text-muted block">
                      {formatDate(n.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Surface>

          {/* Công Việc Xứ Đoàn (Quick Access Launcher) */}
          <Surface variant="card" className="p-4 flex flex-col gap-3">
            <h3 className="text-sm font-extrabold text-text-main m-0 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-parish-primary" />
              Công Việc Xứ Đoàn
            </h3>
            <p className="text-xs text-text-muted m-0">
              Truy cập nhanh các phân hệ chuyên biệt của tổ chức.
            </p>

            <div className="flex flex-col gap-2 pt-1">
              {destinations.filter(item => !item.adminOnly || role === 'admin').map(item => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => navigate({ to: item.to })}
                  className="p-3 rounded-xl bg-surface-app hover:bg-surface-hover border border-surface-border transition-colors text-left flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-parish-primary/10 text-parish-primary flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-text-main group-hover:text-parish-primary transition-colors block truncate">
                          {item.title}
                        </span>
                        {item.to === '/operations' && pendingAcknowledgements > 0 && (
                          <Badge tone="warning">{pendingAcknowledgements} chờ nhận</Badge>
                        )}
                        {item.to === '/operations' && pendingAcknowledgements === 0 && myTasksCount > 0 && (
                          <Badge tone="neutral">{myTasksCount} việc</Badge>
                        )}
                      </div>
                      <span className="text-xs text-text-muted block truncate">
                        {item.description}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-text-muted group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              ))}
            </div>
          </Surface>
        </div>
      </div>
      <ParishLogoModal isOpen={showLogoModal} onClose={() => setShowLogoModal(false)} />
    </DesktopAppShell>
  )
}
