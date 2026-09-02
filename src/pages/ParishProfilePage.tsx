import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  Award,
  Building2,
  CalendarDays,
  Download,
  ExternalLink,
  FileClock,
  History,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { PageHeader } from '../components/common/PageHeader'
import { EmptyState, ErrorState, SkeletonCardGrid } from '../components/common/StateFeedback'
import { Button, Surface, TabPanel, Tabs } from '../components/common/ui'
import { ParishProfileEditorModal, type ParishEditorRequest } from '../components/parish/ParishProfileEditorModal'
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
      {person.holyName && <span className="font-bold text-amber-950 dark:text-amber-400 mr-1.5">{person.holyName}</span>}
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
  const fetchSnapshot = useParishProfileStore(state => state.fetchSnapshot)
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const { askConfirm, dialog } = useConfirmDialog()
  const [activeTab, setActiveTab] = useState<ProfileTab>('history')
  const [editor, setEditor] = useState<ParishEditorRequest | null>(null)

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
      URL.revokeObjectURL(url)
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
    setIsSyncing(true)
    let createdCount = 0
    for (const acc of unlinkedAccounts) {
      const ok = await store.createPerson({
        linkedUserId: acc.id,
        holyName: acc.holyName || null,
        fullName: acc.fullName,
        birthYear: null,
        biography: null,
        serviceStatus: 'ACTIVE',
        visibility: 'STAFF',
      })
      if (ok) createdCount++
    }
    setIsSyncing(false)
    addToast(`Đã đồng bộ thành công ${createdCount} hồ sơ nhân sự từ tài khoản GLV`, 'success')
  }

  if (isLoading && !snapshot) {
    return <DesktopAppShell width="wide"><SkeletonCardGrid count={6} /></DesktopAppShell>
  }
  if (!snapshot) {
    return <DesktopAppShell width="wide"><ErrorState message={error || undefined} onRetry={() => void fetchSnapshot()} /></DesktopAppShell>
  }

  const milestones = snapshot.records.filter(item => item.recordType === 'MILESTONE')
  const activities = snapshot.records.filter(item => item.recordType === 'ACTIVITY')
  const achievements = snapshot.records.filter(item => item.recordType === 'ACHIEVEMENT')
  const canManage = snapshot.permissions.canManage
  const personnelCount = snapshot.people.length > 0 ? snapshot.people.length : (snapshot.accounts?.length || 0)

  return (
    <DesktopAppShell width="wide" className="space-y-4">
      <PageHeader
        title={snapshot.profile.displayName}
        description={snapshot.profile.patronName ? `Bổn mạng ${snapshot.profile.patronName}` : 'Hồ sơ lịch sử và đời sống Xứ đoàn'}
        icon={<Landmark aria-hidden="true" className="h-5 w-5" />}
        actions={canManage ? <Button size="sm" variant="secondary" leadingIcon={<Pencil aria-hidden="true" className="h-4 w-4" />} onClick={() => setEditor({ kind: 'profile' })}>Cập nhật</Button> : undefined}
      />

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
        <SectionHeading title="Lịch sử Xứ đoàn" description="Ngày thành lập, các đời Ban Trị Sự, cột mốc và sự kiện quan trọng." action={canManage ? () => setEditor({ kind: 'record', recordType: 'MILESTONE' }) : undefined} />
        <RecordList records={milestones} empty="Chưa có cột mốc lịch sử" canManage={canManage} onEdit={value => setEditor({ kind: 'record', value })} onDelete={value => void remove('record', value.id, value.title)} peopleById={peopleById} />
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="organization" activeValue={activeTab}>
        <SectionHeading title="Cơ cấu tổ chức" description="Ban Trị Sự, các ban, ngành, chi đoàn và nhiệm kỳ phụ trách." action={canManage ? () => setEditor({ kind: 'unit' }) : undefined} actionLabel="Thêm đơn vị" secondaryAction={canManage && snapshot.people.length ? () => setEditor({ kind: 'term' }) : undefined} secondaryLabel="Thêm nhiệm kỳ" />
        {snapshot.units.length === 0 ? <EmptyState icon={Building2} title="Chưa có cơ cấu tổ chức" description="Tạo Ban Trị Sự hoặc một đơn vị đầu tiên để bắt đầu." /> : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {snapshot.units.map(unit => <UnitCard key={unit.id} unit={unit} terms={snapshot.terms.filter(term => term.unitId === unit.id)} peopleById={peopleById} unitsById={unitsById} canManage={canManage} onEdit={() => setEditor({ kind: 'unit', value: unit })} onDelete={() => void remove('unit', unit.id, unit.name)} onEditTerm={term => setEditor({ kind: 'term', value: term })} onDeleteTerm={term => void remove('term', term.id, term.positionTitle)} />)}
          </div>
        )}
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="people" activeValue={activeTab}>
        <SectionHeading title="Hồ sơ Huynh trưởng / GLV" description="Quá trình phục vụ, nhiệm vụ, cấp bậc, thời gian hoạt động và thành tích liên quan." action={canManage ? () => setEditor({ kind: 'person' }) : undefined} actionLabel="Thêm hồ sơ" />

        {unlinkedAccounts.length > 0 && canManage && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-sky-500/10 border border-sky-500/30 rounded-xl mb-4">
            <div className="text-xs text-sky-950 dark:text-sky-200">
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

        {snapshot.people.length === 0 ? <EmptyState icon={UserRound} title="Chưa có hồ sơ nhân sự" description="Tạo hồ sơ Huynh trưởng / GLV hoặc bấm đồng bộ từ các tài khoản GLV hiện có." /> : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {snapshot.people.map(person => <PersonCard key={person.id} person={person} terms={snapshot.terms.filter(term => term.personId === person.id)} unitsById={unitsById} canManage={canManage} onEdit={() => setEditor({ kind: 'person', value: person })} onDelete={() => void remove('person', person.id, person.fullName)} onAddTerm={() => setEditor({ kind: 'term', personId: person.id })} onEditTerm={term => setEditor({ kind: 'term', value: term })} />)}
          </div>
        )}
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="activities" activeValue={activeTab}>
        <SectionHeading title="Nhật ký hoạt động" description="Trại, lễ bổn mạng, khai giảng, tổng kết, diễn nguyện và chương trình lớn." action={canManage ? () => setEditor({ kind: 'record', recordType: 'ACTIVITY' }) : undefined} />
        <RecordList records={activities} empty="Chưa có hoạt động được ghi nhận" canManage={canManage} onEdit={value => setEditor({ kind: 'record', value })} onDelete={value => void remove('record', value.id, value.title)} peopleById={peopleById} />
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="archive" activeValue={activeTab}>
        <SectionHeading title="Kho tư liệu" description="Ảnh, video, poster, tài liệu, biên bản, chương trình và giấy khen." action={canManage ? () => setEditor({ kind: 'asset' }) : undefined} actionLabel="Thêm tư liệu" />
        {snapshot.assets.length === 0 ? <EmptyState icon={Archive} title="Kho tư liệu đang trống" /> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {snapshot.assets.map(asset => <AssetCard key={asset.id} asset={asset} canManage={canManage} onOpen={() => void downloadAsset(asset)} onEdit={() => setEditor({ kind: 'asset', value: asset })} onDelete={() => void remove('asset', asset.id, asset.title)} />)}
          </div>
        )}
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="achievements" activeValue={activeTab}>
        <SectionHeading title="Khen thưởng & thành tích" description="Ghi nhận cá nhân, tập thể và những mốc đáng nhớ." action={canManage ? () => setEditor({ kind: 'record', recordType: 'ACHIEVEMENT' }) : undefined} />
        <RecordList records={achievements} empty="Chưa có thành tích được ghi nhận" canManage={canManage} onEdit={value => setEditor({ kind: 'record', value })} onDelete={value => void remove('record', value.id, value.title)} peopleById={peopleById} />
      </TabPanel>

      <TabPanel tabsId="parish-profile-tabs" value="timeline" activeValue={activeTab}>
        <SectionHeading title="Timeline Xứ đoàn" description="Dòng thời gian được tổng hợp từ ngày thành lập, nhiệm kỳ và các bản ghi được chọn hiển thị." />
        <Timeline items={snapshot.timeline} />
      </TabPanel>

      {editor && <ParishProfileEditorModal editor={editor} snapshot={snapshot} onClose={() => setEditor(null)} />}
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
  return <div className="space-y-3">{records.map(record => <Surface as="article" variant="entity" key={record.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="badge badge-info">{recordLabels[record.recordType]}</span>{record.status !== 'PUBLISHED' && <span className="badge badge-warning">{statusLabels[record.status]}</span>}{record.visibility === 'ADMIN' && <span className="badge badge-neutral">Chỉ Admin</span>}</div><h3 className="mt-2 typography-card-title">{record.title}</h3><p className="mt-1 text-xs font-semibold text-text-muted">{formatDate(record.occurredOn)}{record.endedOn ? ` – ${formatDate(record.endedOn)}` : ''}{record.location ? ` · ${record.location}` : ''}</p></div>{canManage && <ActionButtons label={record.title} onEdit={() => onEdit(record)} onDelete={() => onDelete(record)} />}</div>{record.summary && <p className="mt-3 typography-body text-text-secondary">{record.summary}</p>}{record.content && <p className="mt-2 whitespace-pre-wrap typography-body-sm text-text-muted">{record.content}</p>}{record.personIds.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{record.personIds.map(id => <span key={id} className="badge badge-neutral"><PersonName person={peopleById.get(id)} /></span>)}</div>}</Surface>)}</div>
}

function UnitCard({ unit, terms, peopleById, unitsById, canManage, onEdit, onDelete, onEditTerm, onDeleteTerm }: { unit: ParishOrganizationUnit; terms: ParishServiceTerm[]; peopleById: Map<string, ParishPerson>; unitsById: Map<string, ParishOrganizationUnit>; canManage: boolean; onEdit: () => void; onDelete: () => void; onEditTerm: (term: ParishServiceTerm) => void; onDeleteTerm: (term: ParishServiceTerm) => void }) {
  return <Surface as="article" variant="entity" className="p-4"><div className="flex items-start justify-between gap-3"><div><span className="badge badge-info">{unitLabels[unit.unitType]}</span><h3 className="mt-2 typography-card-title">{unit.name}</h3>{unit.parentId && <p className="mt-1 typography-caption text-text-muted">Trực thuộc {unitsById.get(unit.parentId)?.name || 'đơn vị cấp trên'}</p>}</div>{canManage && <ActionButtons label={unit.name} onEdit={onEdit} onDelete={onDelete} />}</div>{unit.description && <p className="mt-3 typography-body-sm text-text-secondary">{unit.description}</p>}<div className="mt-3 border-t border-surface-border pt-3"><div className="text-xs font-bold uppercase tracking-wide text-text-muted">Nhiệm kỳ</div>{terms.length === 0 ? <p className="mt-2 typography-body-sm text-text-muted">Chưa có người giữ chức vụ.</p> : <div className="mt-2 space-y-2">{terms.map(term => <div key={term.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface-sunken p-3"><div><div className="text-sm font-bold text-text-main"><PersonName person={peopleById.get(term.personId)} /></div><div className="mt-0.5 text-xs text-text-muted">{term.positionTitle}{term.rankTitle ? ` · ${term.rankTitle}` : ''} · {formatDate(term.startDate)} – {term.endDate ? formatDate(term.endDate) : 'nay'}</div></div>{canManage && <ActionButtons label={term.positionTitle} onEdit={() => onEditTerm(term)} onDelete={() => onDeleteTerm(term)} />}</div>)}</div>}</div></Surface>
}

function PersonCard({ person, terms, unitsById, canManage, onEdit, onDelete, onAddTerm, onEditTerm }: { person: ParishPerson; terms: ParishServiceTerm[]; unitsById: Map<string, ParishOrganizationUnit>; canManage: boolean; onEdit: () => void; onDelete: () => void; onAddTerm: () => void; onEditTerm: (term: ParishServiceTerm) => void }) {
  return <Surface as="article" variant="entity" className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><span className={`badge ${person.serviceStatus === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}`}>{person.serviceStatus === 'ACTIVE' ? 'Đang phục vụ' : person.serviceStatus === 'FORMER' ? 'Đã mãn nhiệm' : 'Đã qua đời'}</span>{person.visibility === 'ADMIN' && <span className="badge badge-warning">Chỉ Admin</span>}</div><h3 className="mt-2 typography-card-title"><PersonName person={person} /></h3>{person.birthYear && <p className="typography-caption text-text-muted">Sinh năm {person.birthYear}</p>}</div>{canManage && <ActionButtons label={person.fullName} onEdit={onEdit} onDelete={onDelete} />}</div>{person.biography && <p className="mt-3 whitespace-pre-wrap typography-body-sm text-text-secondary">{person.biography}</p>}<div className="mt-3 border-t border-surface-border pt-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-text-muted">Quá trình phục vụ</span>{canManage && <Button size="sm" variant="quiet" onClick={onAddTerm}>Thêm nhiệm kỳ</Button>}</div>{terms.length === 0 ? <p className="mt-2 typography-body-sm text-text-muted">Chưa có nhiệm kỳ.</p> : <div className="mt-2 space-y-2">{terms.map(term => <button key={term.id} type="button" disabled={!canManage} onClick={() => canManage && onEditTerm(term)} className="block min-h-11 w-full rounded-lg bg-surface-sunken p-3 text-left disabled:cursor-default"><span className="block text-sm font-bold text-text-main">{term.positionTitle}{term.rankTitle ? ` · ${term.rankTitle}` : ''}</span><span className="block text-xs text-text-muted">{term.unitId ? unitsById.get(term.unitId)?.name : 'Toàn Xứ đoàn'} · {formatDate(term.startDate)} – {term.endDate ? formatDate(term.endDate) : 'nay'}</span></button>)}</div>}</div></Surface>
}

function AssetCard({ asset, canManage, onOpen, onEdit, onDelete }: { asset: ParishArchiveAsset; canManage: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  return <Surface as="article" variant="entity" className="flex flex-col p-4"><div className="flex items-start justify-between gap-2"><span className="badge badge-info">{assetLabels[asset.assetType]}</span>{canManage && <ActionButtons label={asset.title} onEdit={onEdit} onDelete={onDelete} />}</div><h3 className="mt-3 typography-card-title">{asset.title}</h3>{asset.capturedOn && <p className="mt-1 typography-caption text-text-muted">{formatDate(asset.capturedOn)}</p>}{asset.description && <p className="mt-2 flex-1 typography-body-sm text-text-secondary">{asset.description}</p>}<Button className="mt-4" size="sm" variant="secondary" leadingIcon={asset.externalUrl ? <ExternalLink aria-hidden="true" className="h-4 w-4" /> : <Download aria-hidden="true" className="h-4 w-4" />} onClick={onOpen}>{asset.externalUrl ? 'Mở liên kết' : 'Tải xuống'}</Button></Surface>
}

function Timeline({ items }: { items: ParishTimelineItem[] }) {
  if (items.length === 0) return <EmptyState icon={History} title="Timeline chưa có dữ liệu" description="Cập nhật ngày thành lập, nhiệm kỳ hoặc chọn hiển thị một bản ghi trên timeline." />
  return <ol className="relative ml-3 border-l-2 border-parish-primary/30 pl-6">{items.map(item => <li key={`${item.kind}-${item.id}`} className="relative pb-6 last:pb-0"><span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-surface-card bg-parish-primary" aria-hidden="true" /><Surface as="article" variant="entity" className="p-4"><div className="flex flex-wrap items-center gap-2"><time className="text-xs font-extrabold text-parish-primary">{formatDate(item.date)}</time>{item.recordType && <span className="badge badge-neutral">{recordLabels[item.recordType]}</span>}</div><h3 className="mt-1 typography-card-title">{item.title}</h3>{item.summary && <p className="mt-1 typography-body-sm text-text-secondary">{item.summary}</p>}</Surface></li>)}</ol>
}
