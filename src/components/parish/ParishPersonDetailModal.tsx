import { useMemo, useState } from 'react'
import {
  Award,
  BookOpen,
  Building2,
  Calendar,
  CalendarRange,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  History,
  Image as ImageIcon,
  Landmark,
  MapPin,
  Pencil,
  Plus,
  Quote,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
  UserRound,
} from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Badge, type BadgeTone, Button, Surface } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import { useToastStore } from '../../stores/toastStore'
import { hasCoordinationRole, isTermActiveOn, sortTermsByAuthority } from '../../utils/parishTerms'
import type {
  ParishArchiveAsset,
  ParishOrganizationUnit,
  ParishPerson,
  ParishProfileSnapshot,
  ParishRecord,
  ParishServiceTerm,
} from '../../types/parishProfile'

export interface ParishPersonDetailModalProps {
  person: ParishPerson
  terms: ParishServiceTerm[]
  records: ParishRecord[]
  unitsById: Map<string, ParishOrganizationUnit>
  onClose: () => void
  onEdit?: () => void
  accounts?: ParishProfileSnapshot['accounts']
  assets?: ParishArchiveAsset[]
  canManage?: boolean
  onAddTerm?: () => void
  onEditTerm?: (term: ParishServiceTerm) => void
  onViewAsset?: (asset: ParishArchiveAsset) => void
}

type DetailTab = 'overview' | 'terms' | 'records'

function formatDate(value: string | null | undefined) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

function formatTermDuration(startDate: string, endDate: string | null): string {
  try {
    const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`)
    const end = endDate ? new Date(`${endDate.slice(0, 10)}T00:00:00Z`) : new Date()
    const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    if (diffMonths <= 0) return 'Dưới 1 tháng'
    const years = Math.floor(diffMonths / 12)
    const months = diffMonths % 12
    if (years === 0) return `${months} tháng`
    if (months === 0) return `${years} năm`
    return `${years} năm ${months} tháng`
  } catch {
    return ''
  }
}

const accountRoleLabels: Record<string, { label: string; tone: BadgeTone }> = {
  admin: { label: 'Ban Quản trị', tone: 'primary' },
  chunhiem: { label: 'GLV Chủ nhiệm', tone: 'info' },
  phuta: { label: 'GLV Phụ tá', tone: 'neutral' },
}

const unitBadgeTones: Record<ParishOrganizationUnit['unitType'], BadgeTone> = {
  BOARD: 'primary',
  COMMITTEE: 'violet',
  BRANCH: 'teal',
  CHAPTER: 'info',
  OTHER: 'neutral',
}

export function ParishPersonDetailModal({
  person,
  terms,
  records,
  unitsById,
  onClose,
  onEdit,
  accounts,
  assets,
  canManage = false,
  onAddTerm,
  onEditTerm,
  onViewAsset,
}: ParishPersonDetailModalProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [copiedId, setCopiedId] = useState(false)
  const addToast = useToastStore(state => state.addToast)

  const currentYear = new Date().getFullYear()
  const age = person.birthYear && person.birthYear > 1900 && person.birthYear <= currentYear
    ? currentYear - person.birthYear
    : null

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const sortedTerms = useMemo(() => sortTermsByAuthority(terms), [terms])
  const activeTerms = useMemo(() => sortedTerms.filter(t => isTermActiveOn(t, todayStr)), [sortedTerms, todayStr])
  const pastTerms = useMemo(() => sortedTerms.filter(t => !isTermActiveOn(t, todayStr)), [sortedTerms, todayStr])

  const highestRank = useMemo(() => {
    const termWithRank = sortedTerms.find(t => Boolean(t.rankTitle))
    return termWithRank?.rankTitle ?? null
  }, [sortedTerms])

  const serviceSpan = useMemo(() => {
    if (!terms.length) return null
    const validStarts = terms.map(t => t.startDate).filter(Boolean).sort()
    if (!validStarts.length) return null
    const earliestYear = parseInt(validStarts[0].slice(0, 4), 10)
    if (isNaN(earliestYear)) return null

    const hasActive = activeTerms.length > 0
    if (hasActive) {
      const spanYears = Math.max(1, currentYear - earliestYear)
      return `${earliestYear} – nay (${spanYears} năm)`
    }

    const validEnds = terms.map(t => t.endDate).filter(Boolean).sort() as string[]
    const latestEndYear = validEnds.length ? parseInt(validEnds[validEnds.length - 1].slice(0, 4), 10) : earliestYear
    const spanYears = Math.max(1, latestEndYear - earliestYear)
    return `${earliestYear} – ${latestEndYear} (${spanYears} năm)`
  }, [terms, activeTerms, currentYear])

  const linkedAccount = useMemo(() => {
    if (!person.linkedUserId || !accounts) return null
    return accounts.find(a => a.id === person.linkedUserId) || null
  }, [person.linkedUserId, accounts])

  const relatedRecords = useMemo(
    () => records.filter(r => r.personIds.includes(person.id)),
    [records, person.id],
  )
  const achievements = useMemo(
    () => relatedRecords.filter(r => r.recordType === 'ACHIEVEMENT'),
    [relatedRecords],
  )
  const activities = useMemo(
    () => relatedRecords.filter(r => r.recordType !== 'ACHIEVEMENT'),
    [relatedRecords],
  )

  const relatedAssets = useMemo(() => {
    if (!assets || !assets.length) return []
    const assetIdSet = new Set<string>()
    relatedRecords.forEach(r => {
      r.assetIds.forEach(id => assetIdSet.add(id))
    })
    return assets.filter(a => assetIdSet.has(a.id))
  }, [assets, relatedRecords])

  const avatarLetters = useMemo(() => {
    if (person.holyName && person.fullName) {
      return `${person.holyName.trim().charAt(0)}${person.fullName.trim().charAt(0)}`.toUpperCase()
    }
    return person.fullName.slice(0, 2).toUpperCase()
  }, [person.holyName, person.fullName])

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(person.id)
      setCopiedId(true)
      addToast('Đã sao chép mã định danh nhân sự', 'success')
      setTimeout(() => setCopiedId(false), 2000)
    } catch {
      addToast('Không thể sao chép mã định danh', 'error')
    }
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Hồ Sơ Huynh Trưởng / GLV"
      icon={<UserRound className="w-5 h-5 text-parish-primary" />}
      maxWidth="820px"
      footer={(
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>Mã định danh:</span>
            <code className="px-2 py-0.5 rounded bg-surface-sunken font-mono text-text-main font-bold border border-surface-border">
              {person.id}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5 text-xs text-text-muted hover:text-text-main"
              onClick={handleCopyId}
              aria-label="Sao chép mã định danh"
            >
              {copiedId ? (
                <Check className="h-3.5 w-3.5 text-parish-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-initial">
              Đóng
            </Button>
            {canManage && onAddTerm && (
              <Button
                variant="secondary"
                leadingIcon={<Plus className="h-4 w-4 text-parish-primary" />}
                onClick={onAddTerm}
                className="flex-1 sm:flex-initial"
              >
                Thêm nhiệm kỳ
              </Button>
            )}
            {onEdit && (
              <Button leadingIcon={<Pencil className="h-4 w-4" />} onClick={onEdit} className="flex-1 sm:flex-initial">
                Chỉnh sửa
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        {/* KHỐI 1: HERO CĂN TÍNH & CẤP BẬC TÔNG ĐỒ */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            {/* Avatar trang trọng */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-parish-primary/10 text-parish-primary flex items-center justify-center font-black text-2xl sm:text-3xl shrink-0 border-2 border-parish-primary/20 shadow-sm">
              {avatarLetters}
            </div>

            {/* Thông tin căn tính */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={person.serviceStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                  {person.serviceStatus === 'ACTIVE'
                    ? 'Đang phục vụ'
                    : person.serviceStatus === 'FORMER'
                      ? 'Đã mãn nhiệm'
                      : 'Đã qua đời'}
                </Badge>

                {highestRank && (
                  <Badge tone="primary" className="font-bold">
                    <Shield className="h-3 w-3 mr-1" />
                    {highestRank}
                  </Badge>
                )}

                {person.visibility === 'ADMIN' && (
                  <Badge tone="neutral">Chỉ Ban Quản trị</Badge>
                )}

                {person.birthYear && (
                  <span className="text-xs text-text-muted">
                    Sinh năm {person.birthYear}
                    {age !== null ? ` (${age} tuổi)` : ''}
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-text-main m-0 tracking-tight">
                {person.holyName && (
                  <span className="text-parish-primary mr-2 font-black">{person.holyName}</span>
                )}
                <span>{person.fullName}</span>
              </h2>

              {/* Thông tin tài khoản hệ thống liên kết */}
              {person.linkedUserId ? (
                <div className="flex items-center gap-2 text-xs flex-wrap pt-0.5">
                  <div className="flex items-center gap-1 text-parish-success font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Tài khoản Catevia:</span>
                  </div>
                  {linkedAccount ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-text-main">
                        {linkedAccount.holyName ? `${linkedAccount.holyName} ` : ''}
                        {linkedAccount.fullName}
                      </span>
                      {linkedAccount.role && accountRoleLabels[linkedAccount.role] && (
                        <Badge tone={accountRoleLabels[linkedAccount.role].tone} className="text-xs py-0">
                          {accountRoleLabels[linkedAccount.role].label}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <code className="text-text-muted font-mono text-xs">
                      {person.linkedUserId}
                    </code>
                  )}
                </div>
              ) : (
                <p className="text-xs text-text-muted m-0">
                  Chưa liên kết tài khoản hệ thống (Hồ sơ tiền bối / truyền thống).
                </p>
              )}
            </div>
          </div>
        </Surface>

        {/* KHỐI 2: THỐNG KÊ NHANH (KEY METRICS) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Surface variant="card" className="p-3 border border-surface-border text-center">
            <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Nhiệm kỳ
            </div>
            <div data-testid="metric-terms-count" className="mt-1 text-lg font-black text-text-main">
              {terms.length} <span className="text-xs font-semibold text-text-muted">lần</span>
            </div>
          </Surface>

          <Surface variant="card" className="p-3 border border-surface-border text-center">
            <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Đang đảm trách
            </div>
            <div data-testid="metric-active-count" className="mt-1 text-lg font-black text-parish-primary">
              {activeTerms.length} <span className="text-xs font-semibold text-text-muted">vị trí</span>
            </div>
          </Surface>

          <Surface variant="card" className="p-3 border border-surface-border text-center">
            <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Bản ghi & Mốc
            </div>
            <div data-testid="metric-records-count" className="mt-1 text-lg font-black text-text-main">
              {relatedRecords.length} <span className="text-xs font-semibold text-text-muted">sự kiện</span>
            </div>
          </Surface>

          <Surface variant="card" className="p-3 border border-surface-border text-center">
            <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Thời gian phục vụ
            </div>
            <div data-testid="metric-service-span" className="mt-1 text-xs font-black text-text-main truncate" title={serviceSpan ?? 'Chưa ghi nhận'}>
              {serviceSpan ?? 'Chưa ghi nhận'}
            </div>
          </Surface>
        </div>

        {/* KHỐI 3: THANH TABS ĐIỀU HƯỚNG */}
        <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-xl border border-surface-border">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'overview'
                ? 'bg-surface-card text-parish-primary shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Tổng quan & Tiểu sử</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'terms'
                ? 'bg-surface-card text-parish-primary shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Lịch sử Nhiệm kỳ</span>
            <span className="text-xs px-1.5 py-0.2 rounded-full bg-surface-sunken border border-surface-border text-text-muted">
              {terms.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('records')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'records'
                ? 'bg-surface-card text-parish-primary shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Trophy className="h-3.5 w-3.5" />
            <span>Hoạt động & Thành tích</span>
            <span className="text-xs px-1.5 py-0.2 rounded-full bg-surface-sunken border border-surface-border text-text-muted">
              {relatedRecords.length}
            </span>
          </button>
        </div>

        {/* NỘI DUNG THEO TAB */}

        {/* TAB 1: TỔNG QUAN & TIỂU SỬ */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Chức vụ đang đảm nhiệm */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted m-0 flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-parish-success" />
                  Chức vụ đang đảm nhiệm hiện tại ({activeTerms.length})
                </h3>
                {canManage && onAddTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-parish-primary"
                    onClick={onAddTerm}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Thêm vị trí
                  </Button>
                )}
              </div>

              {activeTerms.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-surface-app border border-surface-border text-xs text-text-muted flex items-center gap-2">
                  <History className="h-4 w-4 text-text-muted shrink-0" />
                  <span>Hiện không giữ chức vụ trực tiếp nào (đã mãn nhiệm hoặc đang trong thời gian nghỉ vụ).</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeTerms.map(term => {
                    const unit = term.unitId ? unitsById.get(term.unitId) : null
                    return (
                      <Surface
                        key={term.id}
                        variant="card"
                        className="p-3.5 border border-parish-success/30 rounded-xl space-y-1.5 relative"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-black text-text-main">
                              {term.positionTitle}
                            </span>
                            {hasCoordinationRole(term) && (
                              <Badge tone="primary" className="text-xs">
                                Điều phối
                              </Badge>
                            )}
                            {term.rankTitle && (
                              <Badge tone="neutral" className="text-xs">
                                {term.rankTitle}
                              </Badge>
                            )}
                          </div>
                          {canManage && onEditTerm && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-text-muted hover:text-text-main shrink-0"
                              onClick={() => onEditTerm(term)}
                              aria-label={`Sửa nhiệm kỳ ${term.positionTitle}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          {unit ? (
                            <div className="flex items-center gap-1 text-text-main font-semibold">
                              <Building2 className="h-3.5 w-3.5 text-parish-primary shrink-0" />
                              <span>{unit.name}</span>
                              <Badge tone={unitBadgeTones[unit.unitType]} className="text-xs py-0 ml-1">
                                {unit.unitType === 'BOARD' ? 'Ban Quản trị' : unit.unitType === 'BRANCH' ? 'Ngành' : unit.unitType === 'COMMITTEE' ? 'Ban' : 'Chi đoàn'}
                              </Badge>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-text-main font-semibold">
                              <Landmark className="h-3.5 w-3.5 text-parish-primary shrink-0" />
                              <span>Toàn Xứ đoàn</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-text-muted pt-1 border-t border-surface-border">
                          <span>Từ {formatDate(term.startDate)}</span>
                          <span className="font-bold text-parish-success">
                            {formatTermDuration(term.startDate, term.endDate)}
                          </span>
                        </div>
                      </Surface>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Tiểu sử & Ghi nhận dấn thân */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted m-0 flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-parish-primary" />
                Tiểu sử & Ghi nhận Tông đồ
              </h3>

              {person.biography ? (
                <div className="p-4 rounded-xl bg-surface-card border border-surface-border relative">
                  <Quote className="h-6 w-6 text-parish-primary/20 absolute right-4 top-3 pointer-events-none" />
                  <p className="text-xs sm:text-sm text-text-secondary whitespace-pre-wrap m-0 leading-relaxed">
                    {person.biography}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-surface-app border border-surface-border text-center py-6">
                  <Quote className="h-6 w-6 text-text-muted mx-auto mb-1.5" />
                  <p className="text-xs text-text-muted m-0">
                    Chưa có tiểu sử hoặc ghi nhận mốc dấn thân nào cho huynh trưởng này.
                  </p>
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs text-parish-primary"
                      onClick={onEdit}
                    >
                      Bấm vào đây để bổ sung tiểu sử
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: LỊCH SỬ NHIỆM KỲ (TIMELINE) */}
        {activeTab === 'terms' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted m-0">
                Toàn bộ dòng thời gian đảm nhiệm ({terms.length})
              </h3>
              {canManage && onAddTerm && (
                <Button
                  size="sm"
                  leadingIcon={<Plus className="h-3.5 w-3.5" />}
                  onClick={onAddTerm}
                >
                  Thêm nhiệm kỳ mới
                </Button>
              )}
            </div>

            {terms.length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title="Chưa có nhiệm kỳ nào"
                description="Hồ sơ này chưa được phân bổ nhiệm kỳ hoặc chức vụ chính thức trong Xứ đoàn."
                actionLabel={canManage && onAddTerm ? 'Bổ nhiệm chức vụ mới' : undefined}
                onAction={canManage && onAddTerm ? onAddTerm : undefined}
              />
            ) : (
              <div className="space-y-4">
                {/* Nhóm chức vụ đang đảm nhiệm */}
                {activeTerms.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-parish-success flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-parish-success" />
                      <span>Đang phục vụ ({activeTerms.length})</span>
                    </div>

                    <div className="space-y-2">
                      {activeTerms.map(term => {
                        const unit = term.unitId ? unitsById.get(term.unitId) : null
                        return (
                          <div
                            key={term.id}
                            className="p-3.5 rounded-xl bg-surface-card border border-parish-success/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-text-main">
                                  {term.positionTitle}
                                </span>
                                {hasCoordinationRole(term) && (
                                  <Badge tone="primary" className="text-xs">
                                    Điều phối
                                  </Badge>
                                )}
                                {term.rankTitle && (
                                  <Badge tone="neutral" className="text-xs">
                                    {term.rankTitle}
                                  </Badge>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-xs text-text-muted">
                                <span>{unit ? unit.name : 'Toàn Xứ đoàn'}</span>
                                {unit && (
                                  <Badge tone={unitBadgeTones[unit.unitType]} className="text-xs py-0">
                                    {unit.unitType}
                                  </Badge>
                                )}
                              </div>

                              {term.notes && (
                                <p className="text-xs text-text-secondary italic m-0 pt-0.5">
                                  "{term.notes}"
                                </p>
                              )}
                            </div>

                            <div className="shrink-0 flex sm:flex-col items-end justify-between sm:justify-center gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-surface-border">
                              <div className="text-xs text-right">
                                <span className="font-semibold text-text-main">{formatDate(term.startDate)}</span>
                                <span className="text-text-muted"> – </span>
                                <span className="font-bold text-parish-success">Hiện tại</span>
                                <div className="text-text-muted text-xs">
                                  ({formatTermDuration(term.startDate, term.endDate)})
                                </div>
                              </div>
                              {canManage && onEditTerm && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-text-muted hover:text-text-main"
                                  onClick={() => onEditTerm(term)}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Sửa
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Nhóm nhiệm kỳ tiền nhiệm */}
                {pastTerms.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-text-muted flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-text-muted" />
                      <span>Nhiệm kỳ tiền nhiệm ({pastTerms.length})</span>
                    </div>

                    <div className="space-y-2">
                      {pastTerms.map(term => {
                        const unit = term.unitId ? unitsById.get(term.unitId) : null
                        return (
                          <div
                            key={term.id}
                            className="p-3.5 rounded-xl bg-surface-sunken border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 opacity-90 hover:opacity-100 transition-colors"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-text-main">
                                  {term.positionTitle}
                                </span>
                                {term.rankTitle && (
                                  <Badge tone="neutral" className="text-xs">
                                    {term.rankTitle}
                                  </Badge>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-xs text-text-muted">
                                <span>{unit ? unit.name : 'Toàn Xứ đoàn'}</span>
                              </div>

                              {term.notes && (
                                <p className="text-xs text-text-secondary italic m-0 pt-0.5">
                                  "{term.notes}"
                                </p>
                              )}
                            </div>

                            <div className="shrink-0 flex sm:flex-col items-end justify-between sm:justify-center gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-surface-border">
                              <div className="text-xs text-right text-text-muted">
                                <span>{formatDate(term.startDate)}</span> – <span>{formatDate(term.endDate)}</span>
                                <div>({formatTermDuration(term.startDate, term.endDate)})</div>
                              </div>
                              {canManage && onEditTerm && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-text-muted hover:text-text-main"
                                  onClick={() => onEditTerm(term)}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Sửa
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: HOẠT ĐỘNG & THÀNH TÍCH */}
        {activeTab === 'records' && (
          <div className="space-y-4">
            {/* Phân khu 1: Khen thưởng & Thành tích danh dự */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-parish-warning m-0 flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-parish-warning" />
                Khen thưởng & Thành tích đạt được ({achievements.length})
              </h3>

              {achievements.length === 0 ? (
                <p className="text-xs text-text-muted py-3 px-4 rounded-xl bg-surface-app border border-surface-border m-0">
                  Chưa có khen thưởng danh dự hoặc giải thưởng nào được ghi nhận cho nhân sự này.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {achievements.map(rec => (
                    <div
                      key={rec.id}
                      className="p-3.5 rounded-xl bg-surface-card border border-parish-warning/40 shadow-xs space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-parish-warning-bg text-parish-warning shrink-0">
                            <Award className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="text-sm font-black text-text-main block">
                              {rec.title}
                            </span>
                            {rec.location && (
                              <span className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {rec.location}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-xs text-text-muted shrink-0 flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-parish-warning" />
                          <span>{formatDate(rec.occurredOn)}</span>
                        </div>
                      </div>

                      {rec.summary && (
                        <p className="text-xs text-text-secondary m-0 leading-relaxed pl-8">
                          {rec.summary}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Phân khu 2: Hoạt động & Sự kiện tham gia */}
            <div className="space-y-2 pt-2 border-t border-surface-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted m-0 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-parish-primary" />
                Hoạt động, Trại huấn luyện & Sự kiện ({activities.length})
              </h3>

              {activities.length === 0 ? (
                <p className="text-xs text-text-muted py-3 px-4 rounded-xl bg-surface-app border border-surface-border m-0">
                  Chưa có sự kiện hoặc trại huấn luyện nào được gắn thẻ nhân sự này.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activities.map(rec => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-xl bg-surface-app border border-surface-border space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-text-main line-clamp-1">
                          {rec.title}
                        </span>
                        <span className="text-xs text-text-muted shrink-0">
                          {formatDate(rec.occurredOn)}
                        </span>
                      </div>

                      {rec.summary && (
                        <p className="text-xs text-text-muted line-clamp-2 m-0">
                          {rec.summary}
                        </p>
                      )}

                      {rec.location && (
                        <div className="flex items-center gap-1 text-xs text-text-muted pt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{rec.location}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Phân khu 3: Tư liệu & Hình ảnh lưu trữ liên quan */}
            {relatedAssets.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-surface-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted m-0 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-parish-primary" />
                  Kho Tư liệu & Hình ảnh liên quan ({relatedAssets.length})
                </h3>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {relatedAssets.map(asset => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => onViewAsset?.(asset)}
                      className="group relative rounded-lg border border-surface-border overflow-hidden bg-surface-card hover:border-parish-primary transition-colors text-left focus:outline-none"
                    >
                      {asset.assetType === 'IMAGE' || asset.assetType === 'POSTER' ? (
                        <div className="aspect-square bg-surface-sunken flex items-center justify-center overflow-hidden">
                          {asset.storageType === 'UPLOAD' ? (
                            <img
                              src={`/api/parish/assets/${asset.id}/download`}
                              alt={asset.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                            />
                          ) : (
                            <img
                              src={asset.externalUrl || ''}
                              alt={asset.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="aspect-square bg-surface-sunken flex flex-col items-center justify-center p-2 text-center">
                          <FileText className="h-6 w-6 text-text-muted group-hover:text-parish-primary transition-colors" />
                          <span className="text-xs font-semibold text-text-main line-clamp-1 mt-1">
                            {asset.title}
                          </span>
                        </div>
                      )}
                      <div className="p-1.5 text-xs text-text-muted truncate">
                        {asset.title}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
