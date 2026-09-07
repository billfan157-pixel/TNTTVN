import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowUpDown,
  Award,
  Building2,
  CalendarDays,
  Download,
  ExternalLink,
  Eye,
  FileClock,
  FileText,
  History,
  Image as ImageIcon,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  Video,
} from 'lucide-react'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { PageHeader } from '../components/common/PageHeader'
import { EmptyState, ErrorState, SkeletonCardGrid } from '../components/common/StateFeedback'
import { Button, Surface, TabPanel, Tabs } from '../components/common/ui'
import { ParishProfileEditorModal, type ParishEditorRequest } from '../components/parish/ParishProfileEditorModal'
import { ParishAssetLightboxModal } from '../components/parish/ParishAssetLightboxModal'
import { ParishPersonDetailModal } from '../components/parish/ParishPersonDetailModal'
import { ParishOrgChart } from '../components/parish/ParishOrgChart'
import { ParishBulkImportModal } from '../components/parish/ParishBulkImportModal'
import { ParishLogoModal } from '../components/parish/ParishLogoModal'
import { PARISH_LOGO_MEANING } from '../constants/parishLogoMeaning'
import parishLogo from '../assets/logo-gia-ton.png'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { api } from '../lib/api'
import { useParishProfileStore } from '../stores/parishProfileStore'
import { useToastStore } from '../stores/toastStore'
import type {
  ParishArchiveAsset,
  ParishOrganizationUnit,
  ParishPerson,
  ParishRecord,
  ParishServiceTerm,
  ParishTimelineItem,
} from '../types/parishProfile'

type ProfileTab = 'history' | 'organization' | 'people' | 'activities' | 'archive' | 'achievements' | 'timeline'
type AssetSortOption = 'newest' | 'oldest' | 'title_asc' | 'title_desc'

const tabs = [
  { value: 'history', label: 'Lịch sử', icon: <History aria-hidden="true" className="h-4 w-4" /> },
  { value: 'organization', label: 'Cơ cấu', icon: <Building2 aria-hidden="true" className="h-4 w-4" /> },
  { value: 'people', label: 'Huynh trưởng / GLV', icon: <UserRound aria-hidden="true" className="h-4 w-4" /> },
  { value: 'activities', label: 'Hoạt động', icon: <CalendarDays aria-hidden="true" className="h-4 w-4" /> },
  { value: 'archive', label: 'Kho tư liệu', icon: <Archive aria-hidden="true" className="h-4 w-4" /> },
  { value: 'achievements', label: 'Thành tích', icon: <Award aria-hidden="true" className="h-4 w-4" /> },
  { value: 'timeline', label: 'Timeline', icon: <FileClock aria-hidden="true" className="h-4 w-4" /> },
] as const

const recordLabels: Record<ParishRecord['recordType'], string> = {
  MILESTONE: 'Cột mốc', ACTIVITY: 'Hoạt động', ACHIEVEMENT: 'Thành tích',
}
const statusLabels: Record<ParishRecord['status'], string> = {
  DRAFT: 'Bản nháp', PUBLISHED: 'Đã xuất bản', ARCHIVED: 'Lưu trữ',
}
const unitLabels: Record<ParishOrganizationUnit['unitType'], string> = {
  BOARD: 'Ban Trị Sự', COMMITTEE: 'Ban chuyên môn', BRANCH: 'Ngành', CHAPTER: 'Chi đoàn', OTHER: 'Khác',
}
const assetLabels: Record<ParishArchiveAsset['assetType'], string> = {
  IMAGE: 'Ảnh', VIDEO: 'Video', POSTER: 'Poster', DOCUMENT: 'Tài liệu', MINUTES: 'Biên bản', CERTIFICATE: 'Giấy khen', OTHER: 'Khác',
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

function PersonName({ person }: { person?: ParishPerson }) {
  if (!person) return <span>Nhân sự không xác định</span>
  return (
    <span>
      {person.holyName && <span className="font-bold text-parish-primary mr-1.5">{person.holyName}</span>}
      <span className="font-extrabold text-text-main">{person.fullName}</span>
    </span>
  )
}

function ActionButtons({ onEdit, onDelete, label }: { onEdit: () => void; onDelete: () => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" size="sm" aria-label={`Sửa ${label}`} onClick={onEdit} className="min-h-11 min-w-11 px-2">
        <Pencil aria-hidden="true" className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" aria-label={`Xóa ${label}`} onClick={onDelete} className="min-h-11 min-w-11 px-2 text-parish-danger">
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  )
}

export default function ParishProfilePage() {
  const snapshot = useParishProfileStore(state => state.snapshot)
  const isLoading = useParishProfileStore(state => state.isLoading)
  const error = useParishProfileStore(state => state.error)
  const isStale = useParishProfileStore(state => state.isStale)
  const fetchSnapshot = useParishProfileStore(state => state.fetchSnapshot)
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const { askConfirm, dialog } = useConfirmDialog()
  const [activeTab, setActiveTab] = useState<ProfileTab>('history')
  const [editor, setEditor] = useState<ParishEditorRequest | null>(null)

  // Modals mở rộng nâng cao
  const [selectedPerson, setSelectedPerson] = useState<ParishPerson | null>(null)
  const [viewingAsset, setViewingAsset] = useState<ParishArchiveAsset | null>(null)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [showLogoModal, setShowLogoModal] = useState(false)
  const [orgViewMode, setOrgViewMode] = useState<'grid' | 'tree'>('grid')

  // Bộ lọc Tab Nhân sự
  const [peopleQuery, setPeopleQuery] = useState('')
  const [peopleStatus, setPeopleStatus] = useState<'ALL' | 'ACTIVE' | 'FORMER' | 'DECEASED'>('ALL')

  // Bộ lọc Tab Hoạt động & Cột mốc & Thành tích
  const [recordQuery, setRecordQuery] = useState('')

  // Bộ lọc Tab Tư liệu
  const [assetQuery, setAssetQuery] = useState('')
  const [assetTypeFilter, setAssetTypeFilter] = useState<'ALL' | ParishArchiveAsset['assetType']>('ALL')
  const [assetSort, setAssetSort] = useState<AssetSortOption>('newest')

  useEffect(() => { void fetchSnapshot() }, [fetchSnapshot])

  const peopleById = useMemo(() => new Map(snapshot?.people.map(item => [item.id, item]) ?? []), [snapshot?.people])
  const unitsById = useMemo(() => new Map(snapshot?.units.map(item => [item.id, item]) ?? []), [snapshot?.units])

  const remove = async (kind: 'person' | 'unit' | 'term' | 'record' | 'asset', id: string, label: string) => {
    const accepted = await askConfirm({
      title: `Xóa ${label}`,
      message: `Bản ghi “${label}” sẽ được ẩn khỏi Hồ sơ Xứ đoàn. Thao tác bị chặn nếu dữ liệu vẫn đang được liên kết.`,
      confirmText: 'Xóa bản ghi', variant: 'danger',
    })
    if (!accepted) return
    const ok = kind === 'person' ? await store.deletePerson(id)
      : kind === 'unit' ? await store.deleteUnit(id)
        : kind === 'term' ? await store.deleteTerm(id)
          : kind === 'record' ? await store.deleteRecord(id)
            : await store.deleteAsset(id)
    addToast(ok ? 'Đã xóa bản ghi khỏi Hồ sơ Xứ đoàn' : useParishProfileStore.getState().error || 'Không thể xóa bản ghi', ok ? 'success' : 'error')
  }

  const downloadAsset = async (asset: ParishArchiveAsset) => {
    if (asset.externalUrl) {
      window.open(asset.externalUrl, '_blank', 'noopener,noreferrer')
      return
    }
    try {
      const blob = await api.parishProfile.downloadAsset(asset.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = asset.originalFilename || asset.title
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (downloadError) {
      addToast(downloadError instanceof Error ? downloadError.message : 'Không thể tải tư liệu', 'error')
    }
  }

  const [isSyncing, setIsSyncing] = useState(false)
  const unlinkedAccounts = useMemo(() => {
    if (!snapshot?.accounts) return []
    const linkedUserIds = new Set(snapshot.people.map(p => p.linkedUserId).filter(Boolean))
    return snapshot.accounts.filter(acc => !linkedUserIds.has(acc.id))
  }, [snapshot?.accounts, snapshot?.people])

  const handleSyncAccounts = async () => {
    if (!unlinkedAccounts.length) return
    if (unlinkedAccounts.length > 100) {
      addToast('Mỗi lần chỉ đồng bộ tối đa 100 tài khoản. Hãy liên hệ quản trị kỹ thuật để chia đợt dữ liệu.', 'error')
      return
    }
    setIsSyncing(true)
    const ok = await store.createPeople(unlinkedAccounts.map(acc => ({
        linkedUserId: acc.id,
        holyName: acc.holyName || null,
        fullName: acc.fullName,
        birthYear: null,
        biography: null,
        serviceStatus: 'ACTIVE',
        visibility: 'STAFF',
      })))
    setIsSyncing(false)
    addToast(ok ? `Đã đồng bộ thành công ${unlinkedAccounts.length} hồ sơ nhân sự từ tài khoản GLV` : useParishProfileStore.getState().error || 'Không thể đồng bộ hồ sơ nhân sự', ok ? 'success' : 'error')
  }

  // Dữ liệu lọc cho Tab Huynh trưởng / GLV
  const filteredPeople = useMemo(() => {
    if (!snapshot) return []
    return snapshot.people.filter(person => {
      if (peopleStatus !== 'ALL' && person.serviceStatus !== peopleStatus) return false
      if (peopleQuery.trim()) {
        const q = peopleQuery.toLowerCase().trim()
        const matchName = person.fullName.toLowerCase().includes(q)
        const matchHoly = (person.holyName || '').toLowerCase().includes(q)
        const matchBio = (person.biography || '').toLowerCase().includes(q)
        if (!matchName && !matchHoly && !matchBio) return false
      }
      return true
    })
  }, [snapshot, peopleStatus, peopleQuery])

  // Dữ liệu lọc cho các tab bản ghi
  const milestones = useMemo(() => snapshot?.records.filter(item => item.recordType === 'MILESTONE') ?? [], [snapshot?.records])
  const activities = useMemo(() => snapshot?.records.filter(item => item.recordType === 'ACTIVITY') ?? [], [snapshot?.records])
  const achievements = useMemo(() => snapshot?.records.filter(item => item.recordType === 'ACHIEVEMENT') ?? [], [snapshot?.records])

  const filteredMilestones = useMemo(() => {
    return milestones.filter(item => {
      if (!recordQuery.trim()) return true
      const q = recordQuery.toLowerCase().trim()
      return item.title.toLowerCase().includes(q) || (item.summary || '').toLowerCase().includes(q)
    })
  }, [milestones, recordQuery])

  const filteredActivities = useMemo(() => {
    return activities.filter(item => {
      if (!recordQuery.trim()) return true
      const q = recordQuery.toLowerCase().trim()
      return item.title.toLowerCase().includes(q) || (item.summary || '').toLowerCase().includes(q)
    })
  }, [activities, recordQuery])

  const filteredAchievements = useMemo(() => {
    return achievements.filter(item => {
      if (!recordQuery.trim()) return true
      const q = recordQuery.toLowerCase().trim()
      return item.title.toLowerCase().includes(q) || (item.summary || '').toLowerCase().includes(q)
    })
  }, [achievements, recordQuery])

  const filteredAssets = useMemo(() => {
    if (!snapshot) return []
    const list = snapshot.assets.filter(asset => {
      if (assetTypeFilter !== 'ALL' && asset.assetType !== assetTypeFilter) return false
      if (assetQuery.trim()) {
        const q = assetQuery.toLowerCase().trim()
        const matchTitle = asset.title.toLowerCase().includes(q)
        const matchDesc = (asset.description || '').toLowerCase().includes(q)
        if (!matchTitle && !matchDesc) return false
      }
      return true
    })

    return [...list].sort((a, b) => {
      if (assetSort === 'newest') {
        const dateA = a.capturedOn || a.createdAt || ''
        const dateB = b.capturedOn || b.createdAt || ''
        return dateB.localeCompare(dateA)
      }
      if (assetSort === 'oldest') {
        const dateA = a.capturedOn || a.createdAt || ''
        const dateB = b.capturedOn || b.createdAt || ''
        return dateA.localeCompare(dateB)
      }
      if (assetSort === 'title_asc') {
        return a.title.localeCompare(b.title, 'vi')
      }
      if (assetSort === 'title_desc') {
        return b.title.localeCompare(a.title, 'vi')
      }
      return 0
    })
  }, [snapshot, assetTypeFilter, assetQuery, assetSort])

  if (isLoading && !snapshot) {
    return <DesktopAppShell width="wide"><SkeletonCardGrid count={6} /></DesktopAppShell>
  }
  if (!snapshot) {
    return <DesktopAppShell width="wide"><ErrorState message={error || undefined} onRetry={() => void fetchSnapshot()} /></DesktopAppShell>
  }

  const canManage = snapshot.permissions.canManage
  const personnelCount = snapshot.people.length > 0 ? snapshot.people.length : (snapshot.accounts?.length || 0)

  return (
    <DesktopAppShell width="wide" className="space-y-4">
      <PageHeader
        title={snapshot.profile.displayName}
        description={snapshot.profile.patronName ? `Bổn mạng ${snapshot.profile.patronName}` : 'Hồ sơ lịch sử và đời sống Xứ đoàn'}
        icon={<Landmark aria-hidden="true" className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Sparkles aria-hidden="true" className="h-4 w-4 text-parish-secondary" />}
              onClick={() => setShowLogoModal(true)}
            >
              Ý Nghĩa Logo
            </Button>
            {canManage && (
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<Pencil aria-hidden="true" className="h-4 w-4" />}
                onClick={() => setEditor({ kind: 'profile' })}
              >
                Cập nhật
              </Button>
            )}
          </div>
        }
      />

      {isStale && (
        <Surface role="status" className="flex flex-wrap items-center justify-between gap-3 border-parish-warning/40 bg-parish-warning-bg p-3">
          <p className="m-0 text-sm font-semibold text-text-main">
            Thay đổi đã được lưu trên máy chủ nhưng dữ liệu hiển thị chưa tải lại được. Không thực hiện lại thao tác vừa rồi.
          </p>
          <Button size="sm" variant="secondary" onClick={() => void fetchSnapshot()}>Tải lại dữ liệu</Button>
        </Surface>
      )}

      <section aria-label="Tổng quan Xứ đoàn" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Thành lập" value={snapshot.profile.foundedDate ? formatDate(snapshot.profile.foundedDate) : 'Chưa cập nhật'} />
        <StatCard label="Nhân sự" value={`${personnelCount} ${snapshot.people.length > 0 ? 'hồ sơ' : 'tài khoản'}`} />
        <StatCard label="Đơn vị" value={`${snapshot.units.filter(item => item.isActive).length} đang hoạt động`} />
        <StatCard label="Tư liệu" value={`${snapshot.assets.length} mục`} />
      </section>

      {(snapshot.profile.motto || snapshot.profile.description) && (
        <Surface as="section" variant="panel" className="p-4 sm:p-5" aria-label="Giới thiệu Xứ đoàn">
          {snapshot.profile.motto && <p className="text-base font-extrabold text-parish-primary">“{snapshot.profile.motto}”</p>}
          {snapshot.profile.description && <p className="mt-2 whitespace-pre-wrap typography-body text-text-secondary">{snapshot.profile.description}</p>}
        </Surface>
      )}

      <div className="overflow-x-auto pb-1">
        <Tabs id="parish-profile-tabs" ariaLabel="Các phần của Hồ sơ Xứ đoàn" items={tabs} value={activeTab} onValueChange={setActiveTab} activation="automatic" className="min-w-max" />
      </div>

      <TabPanel tabsId="parish-profile-tabs" value="history" activeValue={activeTab}>
        {/* Khối Tôn Vinh Căn Tính: Logo & Ý Nghĩa Logo Xứ Đoàn */}
        <Surface variant="card" className="p-4 sm:p-5 mb-4 border border-surface-border flex flex-col sm:flex-row items-center gap-4 sm:gap-5 bg-surface-app/50">
          <div className="flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center rounded-2xl border border-surface-border bg-surface-card p-2 shadow-card">
            <img
              src={parishLogo}
              alt="Logo Xứ Đoàn Đức Mẹ Fatima"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap mb-1.5">
              <span className="badge badge-primary">
                Logo Xứ Đoàn
              </span>
              <span className="typography-caption text-text-muted">Con Thuyền Đức Tin · 04 biểu tượng · 05 ngành</span>
            </div>
            <h3 className="text-base font-extrabold text-text-main m-0 mb-1.5">
              Ý Nghĩa Logo Xứ Đoàn Đức Mẹ Fatima
            </h3>
            <p className="typography-body-sm text-text-secondary leading-relaxed line-clamp-2 m-0 mb-3">
              {PARISH_LOGO_MEANING.overview}
            </p>
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <Button
                size="sm"
                variant="primary"
                leadingIcon={<Sparkles className="h-3.5 w-3.5" />}
                onClick={() => setShowLogoModal(true)}
              >
                Khám phá ý nghĩa biểu tượng
              </Button>
            </div>
          </div>
        </Surface>

        <SectionHeading title="Lịch sử Xứ đoàn" description="Ngày thành lập, các đời Ban Trị Sự, cột mốc và sự kiện quan trọng." action={canManage ? () => setEditor({ kind: 'record', recordType: 'MILESTONE' }) : undefined} />
        {milestones.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={recordQuery}
                onChange={e => setRecordQuery(e.target.value)}
                placeholder="Tìm cột mốc lịch sử..."
                className="h-9 pl-8 pr-3 text-xs bg-surface-card border border-surface-border rounded-lg text-text-main focus:outline-none focus:border-parish-primary"
              />
            </div>
            {recordQuery && (
              <Button variant="ghost" size="sm" onClick={() => setRecordQuery('')} className="text-xs text-text-muted">
                Xóa tìm kiếm
              </Button>
            )}
          </div>
        )}
        <RecordList records={filteredMilestones} empty="Chưa có cột mốc lịch sử" canManage={canManage} onEdit={value => setEditor({ kind: 'record', value })} onDelete={value => void remove('record', value.id, value.title)} peopleById={peopleById} />
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="organization" activeValue={activeTab}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <SectionHeading
            title="Cơ cấu tổ chức"
            description="Ban Trị Sự, các ban, ngành, chi đoàn và nhiệm kỳ phụ trách."
            action={canManage ? () => setEditor({ kind: 'unit' }) : undefined}
            actionLabel="Thêm đơn vị"
            secondaryAction={canManage && snapshot.people.length ? () => setEditor({ kind: 'term' }) : undefined}
            secondaryLabel="Thêm nhiệm kỳ"
          />

          {snapshot.units.length > 0 && (
            <div className="flex items-center gap-1 bg-surface-sunken p-0.5 rounded-lg border border-surface-border shrink-0 self-start sm:self-center">
              <button
                type="button"
                onClick={() => setOrgViewMode('grid')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                  orgViewMode === 'grid'
                    ? 'bg-surface-card text-parish-primary shadow-sm'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                Dạng thẻ
              </button>
              <button
                type="button"
                onClick={() => setOrgViewMode('tree')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                  orgViewMode === 'tree'
                    ? 'bg-surface-card text-parish-primary shadow-sm'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                Sơ đồ phân cấp
              </button>
            </div>
          )}
        </div>

        {snapshot.units.length === 0 ? (
          <EmptyState icon={Building2} title="Chưa có cơ cấu tổ chức" description="Tạo Ban Trị Sự hoặc một đơn vị đầu tiên để bắt đầu." />
        ) : orgViewMode === 'tree' ? (
          <ParishOrgChart
            units={snapshot.units}
            terms={snapshot.terms}
            peopleById={peopleById}
            unitsById={unitsById}
            canManage={canManage}
            onEdit={unit => setEditor({ kind: 'unit', value: unit })}
            onDelete={unit => void remove('unit', unit.id, unit.name)}
            onEditTerm={term => setEditor({ kind: 'term', value: term })}
            onDeleteTerm={term => void remove('term', term.id, term.positionTitle)}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {snapshot.units.map(unit => (
              <UnitCard
                key={unit.id}
                unit={unit}
                terms={snapshot.terms.filter(term => term.unitId === unit.id)}
                peopleById={peopleById}
                unitsById={unitsById}
                canManage={canManage}
                onEdit={() => setEditor({ kind: 'unit', value: unit })}
                onDelete={() => void remove('unit', unit.id, unit.name)}
                onEditTerm={term => setEditor({ kind: 'term', value: term })}
                onDeleteTerm={term => void remove('term', term.id, term.positionTitle)}
              />
            ))}
          </div>
        )}
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="people" activeValue={activeTab}>
        <SectionHeading
          title="Hồ sơ Huynh trưởng / GLV"
          description="Quá trình phục vụ, nhiệm vụ, cấp bậc, thời gian hoạt động và thành tích liên quan."
          action={canManage ? () => setEditor({ kind: 'person' }) : undefined}
          actionLabel="Thêm hồ sơ"
          secondaryAction={canManage ? () => setShowBulkImport(true) : undefined}
          secondaryLabel="Nhập từ Excel"
        />

        {unlinkedAccounts.length > 0 && canManage && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-parish-info-bg border border-parish-info/30 rounded-xl mb-4">
            <div className="text-xs text-parish-info">
              <p className="font-bold">Tìm thấy {unlinkedAccounts.length} tài khoản Huynh trưởng / GLV chưa có trong Hồ sơ nhân sự.</p>
              <p className="text-text-muted mt-0.5">Tự động khởi tạo hồ sơ nhân sự cho các tài khoản này chỉ với 1 click.</p>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSyncAccounts}
              loading={isSyncing}
              loadingLabel="Đang đồng bộ..."
            >
              Đồng bộ {unlinkedAccounts.length} tài khoản
            </Button>
          </div>
        )}

        {snapshot.people.length > 0 && (
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="search"
                  value={peopleQuery}
                  onChange={e => setPeopleQuery(e.target.value)}
                  placeholder="Tìm theo tên, tên thánh..."
                  className="h-9 pl-8 pr-3 text-xs bg-surface-card border border-surface-border rounded-lg text-text-main focus:outline-none focus:border-parish-primary"
                />
              </div>
              <div className="flex items-center gap-1 bg-surface-sunken p-0.5 rounded-lg border border-surface-border">
                {(['ALL', 'ACTIVE', 'FORMER', 'DECEASED'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setPeopleStatus(st)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                      peopleStatus === st
                        ? 'bg-surface-card text-parish-primary shadow-sm'
                        : 'text-text-muted hover:text-text-main'
                    }`}
                  >
                    {st === 'ALL' ? 'Tất cả' : st === 'ACTIVE' ? 'Đang phục vụ' : st === 'FORMER' ? 'Mãn nhiệm' : 'Qua đời'}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-text-muted">
              Hiển thị {filteredPeople.length}/{snapshot.people.length} hồ sơ
            </span>
          </div>
        )}

        {snapshot.people.length === 0 ? (
          <EmptyState icon={UserRound} title="Chưa có hồ sơ nhân sự" description="Tạo hồ sơ Huynh trưởng / GLV hoặc bấm đồng bộ từ các tài khoản GLV hiện có." />
        ) : filteredPeople.length === 0 ? (
          <EmptyState icon={UserRound} title="Không tìm thấy nhân sự phù hợp" description="Thử thay đổi từ khóa tìm kiếm hoặc bỏ chọn bộ lọc trạng thái." />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filteredPeople.map(person => (
              <PersonCard
                key={person.id}
                person={person}
                terms={snapshot.terms.filter(term => term.personId === person.id)}
                unitsById={unitsById}
                canManage={canManage}
                onSelect={() => setSelectedPerson(person)}
                onEdit={() => setEditor({ kind: 'person', value: person })}
                onDelete={() => void remove('person', person.id, person.fullName)}
                onAddTerm={() => setEditor({ kind: 'term', personId: person.id })}
                onEditTerm={term => setEditor({ kind: 'term', value: term })}
              />
            ))}
          </div>
        )}
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="activities" activeValue={activeTab}>
        <SectionHeading title="Nhật ký hoạt động" description="Trại, lễ bổn mạng, khai giảng, tổng kết, diễn nguyện và chương trình lớn." action={canManage ? () => setEditor({ kind: 'record', recordType: 'ACTIVITY' }) : undefined} />
        {activities.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={recordQuery}
                onChange={e => setRecordQuery(e.target.value)}
                placeholder="Tìm kiếm hoạt động..."
                className="h-9 pl-8 pr-3 text-xs bg-surface-card border border-surface-border rounded-lg text-text-main focus:outline-none focus:border-parish-primary"
              />
            </div>
            {recordQuery && (
              <Button variant="ghost" size="sm" onClick={() => setRecordQuery('')} className="text-xs text-text-muted">
                Xóa tìm kiếm
              </Button>
            )}
          </div>
        )}
        <RecordList records={filteredActivities} empty="Chưa có hoạt động được ghi nhận" canManage={canManage} onEdit={value => setEditor({ kind: 'record', value })} onDelete={value => void remove('record', value.id, value.title)} peopleById={peopleById} />
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="archive" activeValue={activeTab}>
        <SectionHeading title="Kho tư liệu" description="Ảnh, video, poster, tài liệu, biên bản, chương trình và giấy khen." action={canManage ? () => setEditor({ kind: 'asset' }) : undefined} actionLabel="Thêm tư liệu" />
        {snapshot.assets.length > 0 && (
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="search"
                  value={assetQuery}
                  onChange={e => setAssetQuery(e.target.value)}
                  placeholder="Tìm tư liệu..."
                  className="h-9 pl-8 pr-3 text-xs bg-surface-card border border-surface-border rounded-lg text-text-main focus:outline-none focus:border-parish-primary"
                />
              </div>
              <div className="flex items-center gap-1 bg-surface-sunken p-0.5 rounded-lg border border-surface-border overflow-x-auto">
                {(['ALL', 'IMAGE', 'DOCUMENT', 'VIDEO', 'CERTIFICATE'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAssetTypeFilter(type)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 ${
                      assetTypeFilter === type
                        ? 'bg-surface-card text-parish-primary shadow-sm'
                        : 'text-text-muted hover:text-text-main'
                    }`}
                  >
                    {type === 'ALL' ? 'Tất cả' : assetLabels[type] || type}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 h-9 px-2.5 bg-surface-card border border-surface-border rounded-lg">
                <ArrowUpDown className="h-3.5 w-3.5 text-text-muted shrink-0" />
                <label htmlFor="archive-sort-select" className="sr-only">Sắp xếp tư liệu</label>
                <select
                  id="archive-sort-select"
                  value={assetSort}
                  onChange={e => setAssetSort(e.target.value as AssetSortOption)}
                  className="bg-transparent text-xs font-semibold text-text-main focus:outline-none cursor-pointer"
                  aria-label="Sắp xếp tư liệu"
                >
                  <option value="newest">Mới nhất</option>
                  <option value="oldest">Cũ nhất</option>
                  <option value="title_asc">Tên (A–Z)</option>
                  <option value="title_desc">Tên (Z–A)</option>
                </select>
              </div>
            </div>
            <span className="text-xs text-text-muted">
              Hiển thị {filteredAssets.length}/{snapshot.assets.length} tư liệu
            </span>
          </div>
        )}
        {snapshot.assets.length === 0 ? (
          <EmptyState icon={Archive} title="Kho tư liệu đang trống" />
        ) : filteredAssets.length === 0 ? (
          <EmptyState icon={Archive} title="Không tìm thấy tư liệu phù hợp" description="Thử thay đổi từ khóa hoặc loại tư liệu lọc." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAssets.map(asset => (
              <AssetCard
                key={asset.id}
                asset={asset}
                canManage={canManage}
                onOpen={() => {
                  if (asset.assetType === 'IMAGE' || asset.assetType === 'POSTER') {
                    setViewingAsset(asset)
                  } else {
                    void downloadAsset(asset)
                  }
                }}
                onEdit={() => setEditor({ kind: 'asset', value: asset })}
                onDelete={() => void remove('asset', asset.id, asset.title)}
              />
            ))}
          </div>
        )}
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="achievements" activeValue={activeTab}>
        <SectionHeading title="Khen thưởng & thành tích" description="Ghi nhận cá nhân, tập thể và những mốc đáng nhớ." action={canManage ? () => setEditor({ kind: 'record', recordType: 'ACHIEVEMENT' }) : undefined} />
        {achievements.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={recordQuery}
                onChange={e => setRecordQuery(e.target.value)}
                placeholder="Tìm thành tích..."
                className="h-9 pl-8 pr-3 text-xs bg-surface-card border border-surface-border rounded-lg text-text-main focus:outline-none focus:border-parish-primary"
              />
            </div>
            {recordQuery && (
              <Button variant="ghost" size="sm" onClick={() => setRecordQuery('')} className="text-xs text-text-muted">
                Xóa tìm kiếm
              </Button>
            )}
          </div>
        )}
        <RecordList records={filteredAchievements} empty="Chưa có thành tích được ghi nhận" canManage={canManage} onEdit={value => setEditor({ kind: 'record', value })} onDelete={value => void remove('record', value.id, value.title)} peopleById={peopleById} />
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="timeline" activeValue={activeTab}>
        <SectionHeading title="Timeline Xứ đoàn" description="Dòng thời gian được tổng hợp từ ngày thành lập, nhiệm kỳ và các bản ghi được chọn hiển thị." />
        <Timeline items={snapshot.timeline} />
      </TabPanel>

      {editor && <ParishProfileEditorModal editor={editor} snapshot={snapshot} onClose={() => setEditor(null)} />}
      {viewingAsset && <ParishAssetLightboxModal asset={viewingAsset} onClose={() => setViewingAsset(null)} />}
      {selectedPerson && (
        <ParishPersonDetailModal
          person={selectedPerson}
          terms={snapshot.terms.filter(t => t.personId === selectedPerson.id)}
          records={snapshot.records}
          unitsById={unitsById}
          onClose={() => setSelectedPerson(null)}
          onEdit={canManage ? () => { setEditor({ kind: 'person', value: selectedPerson }); setSelectedPerson(null); } : undefined}
        />
      )}
      {showBulkImport && <ParishBulkImportModal onClose={() => setShowBulkImport(false)} />}
      <ParishLogoModal isOpen={showLogoModal} onClose={() => setShowLogoModal(false)} />
      {dialog}
    </DesktopAppShell>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <Surface variant="card" className="p-3 sm:p-4"><div className="text-xs font-bold uppercase tracking-wide text-text-muted">{label}</div><div className="mt-1 text-sm font-extrabold text-text-main sm:text-base">{value}</div></Surface>
}

function SectionHeading({ title, description, action, actionLabel = 'Thêm bản ghi', secondaryAction, secondaryLabel }: { title: string; description: string; action?: () => void; actionLabel?: string; secondaryAction?: (() => void) | false; secondaryLabel?: string }) {
  return <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="typography-section-title">{title}</h2><p className="mt-1 typography-body-sm text-text-muted">{description}</p></div>{(action || secondaryAction) && <div className="flex flex-wrap gap-2">{secondaryAction && <Button size="sm" variant="secondary" leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={secondaryAction}>{secondaryLabel}</Button>}{action && <Button size="sm" leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={action}>{actionLabel}</Button>}</div>}</div>
}

function RecordList({ records, empty, canManage, onEdit, onDelete, peopleById }: { records: ParishRecord[]; empty: string; canManage: boolean; onEdit: (item: ParishRecord) => void; onDelete: (item: ParishRecord) => void; peopleById: Map<string, ParishPerson> }) {
  if (records.length === 0) return <EmptyState icon={FileClock} title={empty} />
  return (
    <div className="space-y-3">
      {records.map(record => (
        <Surface as="article" variant="entity" key={record.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-info">{recordLabels[record.recordType]}</span>
                {record.status !== 'PUBLISHED' && <span className="badge badge-warning">{statusLabels[record.status]}</span>}
                {record.visibility === 'ADMIN' && <span className="badge badge-neutral">Chỉ Admin</span>}
              </div>
              <h3 className="mt-2 typography-card-title">{record.title}</h3>
              <p className="mt-1 text-xs font-semibold text-text-muted">
                {formatDate(record.occurredOn)}
                {record.endedOn ? ` – ${formatDate(record.endedOn)}` : ''}
                {record.location ? ` · ${record.location}` : ''}
              </p>
            </div>
            {canManage && <ActionButtons label={record.title} onEdit={() => onEdit(record)} onDelete={() => onDelete(record)} />}
          </div>
          {record.summary && <p className="mt-3 typography-body text-text-secondary">{record.summary}</p>}
          {record.content && <p className="mt-2 whitespace-pre-wrap typography-body-sm text-text-muted">{record.content}</p>}
          {record.personIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {record.personIds.map(id => (
                <span key={id} className="badge badge-neutral"><PersonName person={peopleById.get(id)} /></span>
              ))}
            </div>
          )}
        </Surface>
      ))}
    </div>
  )
}

function UnitCard({ unit, terms, peopleById, unitsById, canManage, onEdit, onDelete, onEditTerm, onDeleteTerm }: { unit: ParishOrganizationUnit; terms: ParishServiceTerm[]; peopleById: Map<string, ParishPerson>; unitsById: Map<string, ParishOrganizationUnit>; canManage: boolean; onEdit: () => void; onDelete: () => void; onEditTerm: (term: ParishServiceTerm) => void; onDeleteTerm: (term: ParishServiceTerm) => void }) {
  return (
    <Surface as="article" variant="entity" className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="badge badge-info">{unitLabels[unit.unitType]}</span>
          <h3 className="mt-2 typography-card-title">{unit.name}</h3>
          {unit.parentId && <p className="mt-1 typography-caption text-text-muted">Trực thuộc {unitsById.get(unit.parentId)?.name || 'đơn vị cấp trên'}</p>}
        </div>
        {canManage && <ActionButtons label={unit.name} onEdit={onEdit} onDelete={onDelete} />}
      </div>
      {unit.description && <p className="mt-3 typography-body-sm text-text-secondary">{unit.description}</p>}
      <div className="mt-3 border-t border-surface-border pt-3">
        <div className="text-xs font-bold uppercase tracking-wide text-text-muted">Nhiệm kỳ</div>
        {terms.length === 0 ? (
          <p className="mt-2 typography-body-sm text-text-muted">Chưa có người giữ chức vụ.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {terms.map(term => (
              <div key={term.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface-sunken p-3">
                <div>
                  <div className="text-sm font-bold text-text-main"><PersonName person={peopleById.get(term.personId)} /></div>
                  <div className="mt-0.5 text-xs text-text-muted">{term.positionTitle}{term.rankTitle ? ` · ${term.rankTitle}` : ''} · {formatDate(term.startDate)} – {term.endDate ? formatDate(term.endDate) : 'nay'}</div>
                </div>
                {canManage && <ActionButtons label={term.positionTitle} onEdit={() => onEditTerm(term)} onDelete={() => onDeleteTerm(term)} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </Surface>
  )
}

function PersonCard({ person, terms, unitsById, canManage, onSelect, onEdit, onDelete, onAddTerm, onEditTerm: _onEditTerm }: { person: ParishPerson; terms: ParishServiceTerm[]; unitsById: Map<string, ParishOrganizationUnit>; canManage: boolean; onSelect?: () => void; onEdit: () => void; onDelete: () => void; onAddTerm: () => void; onEditTerm: (term: ParishServiceTerm) => void }) {
  return (
    <Surface as="article" variant="entity" className="p-4 flex flex-col justify-between gap-3">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className={`badge ${person.serviceStatus === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}`}>
                {person.serviceStatus === 'ACTIVE' ? 'Đang phục vụ' : person.serviceStatus === 'FORMER' ? 'Đã mãn nhiệm' : 'Đã qua đời'}
              </span>
              {person.visibility === 'ADMIN' && <span className="badge badge-warning">Chỉ Admin</span>}
            </div>
            <h3
              className="mt-2 typography-card-title hover:text-parish-primary transition-colors cursor-pointer"
              onClick={onSelect}
              title="Xem chi tiết tiểu sử"
            >
              <PersonName person={person} />
            </h3>
            {person.birthYear && <p className="typography-caption text-text-muted">Sinh năm {person.birthYear}</p>}
          </div>
          {canManage && <ActionButtons label={person.fullName} onEdit={onEdit} onDelete={onDelete} />}
        </div>
        {person.biography && <p className="mt-3 whitespace-pre-wrap typography-body-sm text-text-secondary line-clamp-2">{person.biography}</p>}
      </div>

      <div className="border-t border-surface-border pt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-text-muted">Quá trình phục vụ</span>
          <div className="flex items-center gap-1">
            {onSelect && (
              <Button size="sm" variant="quiet" className="h-7 text-xs" onClick={onSelect}>
                Xem chi tiết
              </Button>
            )}
            {canManage && <Button size="sm" variant="quiet" className="h-7 text-xs" onClick={onAddTerm}>Thêm nhiệm kỳ</Button>}
          </div>
        </div>
        {terms.length === 0 ? <p className="typography-body-sm text-text-muted m-0">Chưa có nhiệm kỳ.</p> : (
          <div className="space-y-1.5">
            {terms.slice(0, 2).map(term => (
              <div key={term.id} className="block rounded-lg bg-surface-sunken p-2 text-left">
                <span className="block text-xs font-bold text-text-main">{term.positionTitle}{term.rankTitle ? ` · ${term.rankTitle}` : ''}</span>
                <span className="block text-xs text-text-muted">{term.unitId ? unitsById.get(term.unitId)?.name : 'Toàn Xứ đoàn'} · {formatDate(term.startDate)} – {term.endDate ? formatDate(term.endDate) : 'nay'}</span>
              </div>
            ))}
            {terms.length > 2 && (
              <button
                type="button"
                onClick={onSelect}
                className="text-xs font-bold text-parish-primary hover:underline block pt-0.5"
              >
                + Xem thêm {terms.length - 2} nhiệm kỳ khác…
              </button>
            )}
          </div>
        )}
      </div>
    </Surface>
  )
}

function AssetThumbnail({ asset, onClick }: { asset: ParishArchiveAsset; onClick: () => void }) {
  const isImage = asset.assetType === 'IMAGE' || asset.assetType === 'POSTER'
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(isImage && asset.storageType === 'UPLOAD')
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!isImage || asset.storageType !== 'UPLOAD') return
    let active = true
    let createdUrl: string | null = null

    setLoading(true)
    setHasError(false)

    api.parishProfile.downloadAsset(asset.id)
      .then(blob => {
        if (active) {
          createdUrl = URL.createObjectURL(blob)
          setBlobUrl(createdUrl)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setHasError(true)
          setLoading(false)
        }
      })

    return () => {
      active = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [asset.id, asset.storageType, isImage])

  if (isImage) {
    if (loading) {
      return (
        <div className="w-full h-36 bg-surface-sunken rounded-lg border border-surface-border flex flex-col items-center justify-center gap-2 text-text-muted">
          <Loader2 className="h-6 w-6 animate-spin text-parish-primary" />
          <span className="text-xs">Đang tải ảnh...</span>
        </div>
      )
    }

    const src = asset.storageType === 'EXTERNAL' ? asset.externalUrl : blobUrl

    if (!hasError && src) {
      return (
        <div
          className="relative w-full h-36 bg-surface-sunken rounded-lg overflow-hidden border border-surface-border cursor-pointer group"
          onClick={onClick}
          title="Bấm để xem ảnh phóng to"
        >
          <img
            src={src}
            alt={asset.title}
            loading="lazy"
            referrerPolicy={asset.storageType === 'EXTERNAL' ? 'no-referrer' : undefined}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onError={() => setHasError(true)}
          />
          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
            <Eye className="h-6 w-6 drop-shadow-md" />
          </div>
        </div>
      )
    }

    return (
      <div
        className="w-full h-36 bg-surface-sunken rounded-lg border border-surface-border flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-surface-app transition-colors text-text-muted"
        onClick={onClick}
        title="Bấm để xem ảnh phóng to"
      >
        <ImageIcon className="h-6 w-6 text-parish-primary" />
        <span className="text-xs font-semibold">Bản xem trước hình ảnh</span>
      </div>
    )
  }

  const isVideo = asset.assetType === 'VIDEO'
  const isCert = asset.assetType === 'CERTIFICATE'
  return (
    <div
      className="w-full h-28 bg-surface-sunken rounded-lg border border-surface-border flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-surface-app transition-colors text-text-muted group p-3 text-center"
      onClick={onClick}
      title={asset.externalUrl ? 'Bấm để mở liên kết' : 'Bấm để tải xuống'}
    >
      {isVideo ? (
        <Video className="h-7 w-7 text-parish-primary group-hover:scale-110 transition-transform" />
      ) : isCert ? (
        <Award className="h-7 w-7 text-parish-primary group-hover:scale-110 transition-transform" />
      ) : (
        <FileText className="h-7 w-7 text-parish-primary group-hover:scale-110 transition-transform" />
      )}
      <span className="text-xs font-semibold text-text-secondary truncate max-w-[90%]">
        {asset.originalFilename || assetLabels[asset.assetType] || 'Tài liệu'}
      </span>
      {asset.sizeBytes ? (
        <span className="text-xs text-text-muted">
          {(asset.sizeBytes / 1024).toFixed(0)} KB
        </span>
      ) : null}
    </div>
  )
}

function AssetCard({ asset, canManage, onOpen, onEdit, onDelete }: { asset: ParishArchiveAsset; canManage: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const isImage = asset.assetType === 'IMAGE' || asset.assetType === 'POSTER'
  return (
    <Surface as="article" variant="entity" className="flex flex-col justify-between p-4">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="badge badge-info">{assetLabels[asset.assetType]}</span>
          {canManage && <ActionButtons label={asset.title} onEdit={onEdit} onDelete={onDelete} />}
        </div>

        <AssetThumbnail asset={asset} onClick={onOpen} />

        <h3 className="typography-card-title m-0 mt-1 cursor-pointer hover:text-parish-primary transition-colors" onClick={onOpen}>
          {asset.title}
        </h3>

        {asset.capturedOn && <p className="typography-caption text-text-muted m-0">{formatDate(asset.capturedOn)}</p>}
        {asset.description && <p className="typography-body-sm text-text-secondary line-clamp-2 m-0">{asset.description}</p>}
      </div>

      <Button
        className="mt-3"
        size="sm"
        variant="secondary"
        leadingIcon={isImage ? <Eye aria-hidden="true" className="h-4 w-4" /> : asset.externalUrl ? <ExternalLink aria-hidden="true" className="h-4 w-4" /> : <Download aria-hidden="true" className="h-4 w-4" />}
        onClick={onOpen}
      >
        {isImage ? 'Xem phóng to' : asset.externalUrl ? 'Mở liên kết' : 'Tải xuống'}
      </Button>
    </Surface>
  )
}

function Timeline({ items }: { items: ParishTimelineItem[] }) {
  if (items.length === 0) return <EmptyState icon={History} title="Timeline chưa có dữ liệu" description="Cập nhật ngày thành lập, nhiệm kỳ hoặc chọn hiển thị một bản ghi trên timeline." />
  return (
    <ol className="relative ml-3 border-l-2 border-parish-primary/30 pl-6">
      {items.map(item => (
        <li key={`${item.kind}-${item.id}`} className="relative pb-6 last:pb-0">
          <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-surface-card bg-parish-primary" aria-hidden="true" />
          <Surface as="article" variant="entity" className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <time className="text-xs font-extrabold text-parish-primary">{formatDate(item.date)}</time>
              {item.recordType && <span className="badge badge-neutral">{recordLabels[item.recordType]}</span>}
            </div>
            <h3 className="mt-1 typography-card-title">{item.title}</h3>
            {item.summary && <p className="mt-1 typography-body-sm text-text-secondary">{item.summary}</p>}
          </Surface>
        </li>
      ))}
    </ol>
  )
}
