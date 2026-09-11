import { useMemo, useState } from 'react'
import {
  Award,
  Calendar,
  CalendarDays,
  Check,
  FileClock,
  FileText,
  Image as ImageIcon,
  Landmark,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Badge, Button, Surface, TextArea, TextInput } from '../common/ui'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type {
  ParishArchiveAsset,
  ParishPerson,
  ParishProfileSnapshot,
  ParishRecord,
  ParishRecordInput,
  ParishRecordStatus,
  ParishRecordType,
  ParishVisibility,
} from '../../types/parishProfile'

export interface ParishRecordModalProps {
  record?: ParishRecord
  initialRecordType?: ParishRecordType
  snapshot: ParishProfileSnapshot
  onClose: () => void
  onSuccess?: () => void
}

const today = () => new Date().toISOString().slice(0, 10)
const normalize = (value: string) => value.trim() || null

const RECORD_TYPE_CONFIG: Record<
  ParishRecordType,
  {
    label: string
    shortLabel: string
    desc: string
    icon: typeof Award
    suggestions: readonly string[]
  }
> = {
  MILESTONE: {
    label: 'Cột mốc lịch sử',
    shortLabel: 'Cột mốc',
    desc: 'Ngày thành lập, bổ nhiệm cha xứ, khánh thành, kỷ niệm, sự kiện trọng đại.',
    icon: Landmark,
    suggestions: [
      'Thành lập Xứ đoàn Đức Mẹ Fatima',
      'Cung hiến và khánh thành Thánh đường',
      'Đại lễ Bổn mạng Xứ đoàn',
      'Kỷ niệm 20 năm thành lập Xứ đoàn',
    ],
  },
  ACTIVITY: {
    label: 'Hoạt động tiêu biểu',
    shortLabel: 'Hoạt động',
    desc: 'Trại hè, sa mạc huấn luyện, hội chợ, đại hội, tĩnh tâm, giao lưu phong trào.',
    icon: CalendarDays,
    suggestions: [
      'Sa mạc Huấn luyện Vươn Lên 2026',
      'Hội chợ Ẩm thực & Truyền giáo',
      'Tĩnh tâm Mùa Chay Huynh Trưởng & GLV',
      'Hành hương Năm Thánh Xứ đoàn',
    ],
  },
  ACHIEVEMENT: {
    label: 'Khen thưởng & Thành tích',
    shortLabel: 'Thành tích',
    desc: 'Bảng vàng vinh danh, giải thi đua giáo lý, bằng khen Giáo phận / Giáo hạt.',
    icon: Trophy,
    suggestions: [
      'Giải Nhất Hội thi Giáo lý Toàn Giáo hạt',
      'Cờ Thi đua Xuất sắc Phong trào TNTT Giáo phận',
      'Tuyên dương Huynh trưởng Cống hiến Tiêu biểu',
      'Giải Nhất Nghi thức Thiếu Nhi Thánh Thể',
    ],
  },
}

const STATUS_CONFIG: Record<
  ParishRecordStatus,
  { label: string; desc: string; tone: 'success' | 'warning' | 'neutral' }
> = {
  PUBLISHED: {
    label: 'Đã xuất bản',
    desc: 'Công khai trên Hồ sơ Xứ đoàn và Dòng thời gian Timeline.',
    tone: 'success',
  },
  DRAFT: {
    label: 'Bản nháp',
    desc: 'Chỉ hiển thị với ban quản lý, đang trong quá trình biên tập.',
    tone: 'warning',
  },
  ARCHIVED: {
    label: 'Lưu trữ số',
    desc: 'Bản ghi cũ đã hoàn tất chuyển sang trạng thái lưu trữ.',
    tone: 'neutral',
  },
}

function formatDateDisplay(value: string | null | undefined) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
  } catch {
    return value
  }
}

export function ParishRecordModal({
  record,
  initialRecordType,
  snapshot,
  onClose,
  onSuccess,
}: ParishRecordModalProps) {
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const isEditing = Boolean(record?.id)

  // Form State
  const [recordType, setRecordType] = useState<ParishRecordType>(
    record?.recordType ?? initialRecordType ?? 'MILESTONE',
  )
  const [title, setTitle] = useState(record?.title ?? '')
  const [occurredOn, setOccurredOn] = useState(record?.occurredOn ?? today())
  const [endedOn, setEndedOn] = useState(record?.endedOn ?? '')
  const [location, setLocation] = useState(record?.location ?? '')
  const [summary, setSummary] = useState(record?.summary ?? '')
  const [content, setContent] = useState(record?.content ?? '')
  const [status, setStatus] = useState<ParishRecordStatus>(record?.status ?? 'DRAFT')
  const [visibility, setVisibility] = useState<ParishVisibility>(record?.visibility ?? 'STAFF')
  const [showOnTimeline, setShowOnTimeline] = useState(record?.showOnTimeline ?? true)
  const [sourceEventId, setSourceEventId] = useState(record?.sourceEventId ?? '')
  const [personIds, setPersonIds] = useState<string[]>(record?.personIds ?? [])
  const [assetIds, setAssetIds] = useState<string[]>(record?.assetIds ?? [])

  // Smart Pickers State
  const [personSearch, setPersonSearch] = useState('')
  const [isPersonPickerOpen, setIsPersonPickerOpen] = useState(false)
  const [assetSearch, setAssetSearch] = useState('')
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false)

  // Lookup maps
  const peopleById = useMemo(
    () => new Map<string, ParishPerson>(snapshot.people.map(p => [p.id, p])),
    [snapshot.people],
  )
  const assetsById = useMemo(
    () => new Map<string, ParishArchiveAsset>(snapshot.assets.map(a => [a.id, a])),
    [snapshot.assets],
  )

  // Filtered available people for tagging
  const availablePeople = useMemo(() => {
    const q = personSearch.trim().toLowerCase()
    return snapshot.people
      .filter(p => !personIds.includes(p.id))
      .filter(p => {
        if (!q) return true
        const full = `${p.holyName ?? ''} ${p.fullName}`.toLowerCase()
        return full.includes(q)
      })
  }, [snapshot.people, personIds, personSearch])

  // Filtered available assets for tagging
  const availableAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase()
    return snapshot.assets
      .filter(a => !assetIds.includes(a.id))
      .filter(a => {
        if (!q) return true
        return a.title.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q)
      })
  }, [snapshot.assets, assetIds, assetSearch])

  // Toggle helpers
  const handleAddPerson = (id: string) => {
    if (!personIds.includes(id)) {
      setPersonIds(prev => [...prev, id])
    }
  }

  const handleRemovePerson = (id: string) => {
    setPersonIds(prev => prev.filter(item => item !== id))
  }

  const handleAddAsset = (id: string) => {
    if (!assetIds.includes(id)) {
      setAssetIds(prev => [...prev, id])
    }
  }

  const handleRemoveAsset = (id: string) => {
    setAssetIds(prev => prev.filter(item => item !== id))
  }

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      addToast('Vui lòng nhập tiêu đề bản ghi', 'error')
      return
    }

    if (!occurredOn) {
      addToast('Vui lòng chọn ngày bắt đầu diễn ra sự kiện/cột mốc', 'error')
      return
    }

    if (endedOn && endedOn < occurredOn) {
      addToast('Ngày kết thúc không được trước ngày bắt đầu', 'error')
      return
    }

    const payload: ParishRecordInput = {
      recordType,
      title: trimmedTitle,
      summary: normalize(summary),
      content: normalize(content),
      occurredOn,
      endedOn: endedOn || null,
      location: normalize(location),
      status,
      visibility,
      showOnTimeline,
      sourceEventId: normalize(sourceEventId),
      personIds,
      assetIds,
    }

    let ok = false
    if (isEditing && record) {
      ok = await store.updateRecord(record.id, payload)
    } else {
      ok = await store.createRecord(payload)
    }

    if (ok) {
      addToast(
        isEditing
          ? `Đã cập nhật bản ghi “${trimmedTitle}”`
          : `Đã lưu bản ghi “${trimmedTitle}” vào Hồ sơ Xứ đoàn`,
        'success',
      )
      onSuccess?.()
      onClose()
    } else {
      addToast(useParishProfileStore.getState().error || 'Không thể lưu bản ghi', 'error')
    }
  }

  const typeConfig = RECORD_TYPE_CONFIG[recordType]
  const TypeIcon = typeConfig.icon

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={
        isEditing
          ? 'Cập Nhật Bản Ghi Xứ Đoàn'
          : recordType === 'ACHIEVEMENT'
            ? 'Ghi Nhận Thành Tích & Khen Thưởng'
            : recordType === 'MILESTONE'
              ? 'Thêm Cột Mốc Lịch Sử Mới'
              : 'Thêm Hoạt Động Xứ Đoàn Mới'
      }
      subtitle={
        isEditing
          ? `Mã bản ghi: ${record?.id}`
          : 'Lưu giữ ký ức, thành tựu và mốc son vào bộ nhớ số của Xứ đoàn'
      }
      icon={<TypeIcon className="w-5 h-5 text-parish-primary" />}
      maxWidth="780px"
      closeOnOverlay={!store.isSaving}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between w-full gap-2.5">
          <div className="text-xs text-text-muted">
            <span className="text-parish-danger font-bold">*</span> Trường thông tin bắt buộc
          </div>
          <div className="flex items-center gap-2 justify-end w-full sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={store.isSaving}
              className="min-h-10 flex-1 sm:flex-initial"
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              form="parish-record-form"
              loading={store.isSaving}
              loadingLabel="Đang lưu bản ghi…"
              className="min-h-10 px-5 flex-1 sm:flex-initial"
            >
              {isEditing ? 'Lưu cập nhật' : 'Lưu bản ghi'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="parish-record-form" noValidate onSubmit={handleSubmit} className="space-y-5">
        {/* KHỐI 1: PHÂN LOẠI & THÔNG TIN CỐT LÕI */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-parish-primary" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
                1. Phân Loại &amp; Thông Tin Cốt Lõi
              </h3>
            </div>
            <Badge tone="primary">{typeConfig.shortLabel}</Badge>
          </div>

          {/* Bộ chọn 3 loại bản ghi trực quan */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-text-main block">
              Loại bản ghi <span className="text-parish-danger">*</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(['MILESTONE', 'ACTIVITY', 'ACHIEVEMENT'] as const).map(typeKey => {
                const cfg = RECORD_TYPE_CONFIG[typeKey]
                const IconComp = cfg.icon
                const isSelected = recordType === typeKey
                return (
                  <button
                    key={typeKey}
                    type="button"
                    onClick={() => setRecordType(typeKey)}
                    className={`p-3 rounded-xl border text-left transition-colors flex flex-col justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'border-parish-primary bg-parish-primary/10 shadow-sm ring-1 ring-parish-primary'
                        : 'border-surface-border bg-surface-sunken hover:bg-surface-hover text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5">
                        <IconComp size={15} className={isSelected ? 'text-parish-primary' : 'text-text-muted'} />
                        <span className={`text-xs font-bold ${isSelected ? 'text-text-main' : 'text-text-secondary'}`}>
                          {cfg.label}
                        </span>
                      </div>
                      {isSelected && <Check size={14} className="text-parish-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-text-muted m-0 line-clamp-2 leading-tight">
                      {cfg.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tiêu đề bản ghi */}
          <div className="space-y-1.5">
            <label htmlFor="record-title-input" className="text-xs font-bold text-text-main block">
              Tiêu đề bản ghi <span className="text-parish-danger">*</span>
            </label>
            <TextInput
              id="record-title-input"
              required
              placeholder="VD: Thành lập Xứ đoàn, Trại hè Vươn Lên, Giải Nhất Hội thi Giáo lý..."
              maxLength={250}
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={store.isSaving}
            />

            {/* Suggestions */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-xs text-text-muted">Gợi ý mẫu:</span>
              {typeConfig.suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTitle(suggestion)}
                  className="px-2 py-0.5 text-xs font-medium rounded-md bg-surface-sunken hover:bg-surface-hover border border-surface-border text-text-secondary transition-colors cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Ngày tháng & Địa điểm */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="occurredOn-input" className="text-xs font-bold text-text-main block mb-1">
                Ngày bắt đầu <span className="text-parish-danger">*</span>
              </label>
              <TextInput
                id="occurredOn-input"
                type="date"
                required
                value={occurredOn}
                onChange={e => setOccurredOn(e.target.value)}
                disabled={store.isSaving}
              />
            </div>

            <div>
              <label htmlFor="endedOn-input" className="text-xs font-bold text-text-main block mb-1">
                Ngày kết thúc <span className="text-text-muted font-normal">(nếu kéo dài)</span>
              </label>
              <TextInput
                id="endedOn-input"
                type="date"
                min={occurredOn}
                value={endedOn}
                onChange={e => setEndedOn(e.target.value)}
                disabled={store.isSaving}
              />
            </div>

            <div>
              <label htmlFor="location-input" className="text-xs font-bold text-text-main block mb-1">
                Địa điểm tổ chức
              </label>
              <TextInput
                id="location-input"
                placeholder="VD: Hoa viên Giáo xứ, Đất trại..."
                maxLength={300}
                value={location}
                onChange={e => setLocation(e.target.value)}
                disabled={store.isSaving}
              />
            </div>
          </div>
        </Surface>

        {/* KHỐI 2: NỘI DUNG CHI TIẾT & TÓM TẮT */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-3">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-parish-primary" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
                2. Nội Dung &amp; Tóm Tắt Bản Ghi
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              {content.length}/20,000 ký tự
            </span>
          </div>

          <div>
            <label htmlFor="summary-textarea" className="text-xs font-bold text-text-main block mb-1">
              Tóm tắt ngắn gọn <span className="text-text-muted font-normal">(hiển thị trên thẻ danh sách)</span>
            </label>
            <TextArea
              id="summary-textarea"
              rows={2}
              maxLength={1000}
              placeholder="Tóm tắt 1-2 câu điểm nhấn nổi bật của sự kiện hoặc ý nghĩa thành tích..."
              value={summary}
              onChange={e => setSummary(e.target.value)}
              disabled={store.isSaving}
            />
          </div>

          <div>
            <label htmlFor="content-textarea" className="text-xs font-bold text-text-main block mb-1">
              Nội dung chi tiết
            </label>
            <TextArea
              id="content-textarea"
              rows={5}
              maxLength={20000}
              placeholder="Diễn biến sự kiện, danh sách khen thưởng, thông điệp mục vụ, bài học kinh nghiệm..."
              value={content}
              onChange={e => setContent(e.target.value)}
              disabled={store.isSaving}
            />
          </div>
        </Surface>

        {/* KHỐI 3: GẮN THẺ NHÂN SỰ & TƯ LIỆU SỐ LIÊN QUAN */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-parish-primary" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
                3. Gắn Thẻ Nhân Sự &amp; Tư Liệu Số Liên Quan
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              {personIds.length} nhân sự · {assetIds.length} tư liệu
            </span>
          </div>

          {/* Gắn thẻ Huynh trưởng / GLV */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-main">
                Huynh trưởng &amp; GLV liên quan ({personIds.length})
              </span>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setIsPersonPickerOpen(prev => !prev)}
              >
                {isPersonPickerOpen ? 'Đóng bộ chọn' : '+ Gắn thẻ nhân sự'}
              </Button>
            </div>

            {/* Selected people chips */}
            {personIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {personIds.map(id => {
                  const p = peopleById.get(id)
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-sunken border border-surface-border text-xs text-text-main font-semibold"
                    >
                      <UserRound size={12} className="text-parish-primary" />
                      <span>{p ? `${p.holyName ? `${p.holyName} ` : ''}${p.fullName}` : id}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePerson(id)}
                        className="hover:text-parish-danger transition-colors cursor-pointer ml-0.5"
                        aria-label={`Gỡ thẻ ${p?.fullName || id}`}
                      >
                        <X size={13} />
                      </button>
                    </span>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted m-0 italic">
                Chưa có nhân sự nào được gắn thẻ cho bản ghi này.
              </p>
            )}

            {/* Person Picker Dropdown */}
            {isPersonPickerOpen && (
              <div className="p-3 rounded-xl border border-parish-primary/30 bg-surface-card space-y-2.5 shadow-card">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="search"
                    value={personSearch}
                    onChange={e => setPersonSearch(e.target.value)}
                    placeholder="Tìm theo tên thánh hoặc họ tên Huynh trưởng..."
                    className="w-full h-8 pl-8 pr-3 text-xs bg-surface-sunken border border-surface-border rounded-lg text-text-main focus:outline-none focus:border-parish-primary"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto divide-y divide-surface-border border border-surface-border rounded-lg bg-surface-app">
                  {availablePeople.length === 0 ? (
                    <p className="p-2.5 text-xs text-text-muted text-center m-0">
                      {snapshot.people.length === personIds.length
                        ? 'Đã gắn thẻ toàn bộ nhân sự'
                        : 'Không tìm thấy nhân sự phù hợp'}
                    </p>
                  ) : (
                    availablePeople.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleAddPerson(p.id)}
                        aria-label={`Thêm ${p.holyName ? `${p.holyName} ` : ''}${p.fullName}`}
                        className="w-full p-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-surface-sunken text-text-main transition-colors cursor-pointer"
                      >
                        <span className="font-bold truncate">
                          {p.holyName && <span className="text-parish-primary mr-1">{p.holyName}</span>}
                          {p.fullName}
                        </span>
                        <Plus size={13} className="text-parish-primary shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Gắn thẻ Tư liệu số */}
          <div className="space-y-2 pt-2 border-t border-surface-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-main">
                Tư liệu ảnh / video / văn kiện liên quan ({assetIds.length})
              </span>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setIsAssetPickerOpen(prev => !prev)}
              >
                {isAssetPickerOpen ? 'Đóng bộ chọn' : '+ Gắn thẻ tư liệu'}
              </Button>
            </div>

            {/* Selected assets chips */}
            {assetIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {assetIds.map(id => {
                  const a = assetsById.get(id)
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-sunken border border-surface-border text-xs text-text-main font-semibold"
                    >
                      <ImageIcon size={12} className="text-parish-primary" />
                      <span className="truncate max-w-[160px]">{a?.title || id}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAsset(id)}
                        className="hover:text-parish-danger transition-colors cursor-pointer ml-0.5"
                        aria-label={`Gỡ thẻ ${a?.title || id}`}
                      >
                        <X size={13} />
                      </button>
                    </span>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted m-0 italic">
                Chưa có tư liệu nào được gắn thẻ cho bản ghi này.
              </p>
            )}

            {/* Asset Picker Dropdown */}
            {isAssetPickerOpen && (
              <div className="p-3 rounded-xl border border-parish-primary/30 bg-surface-card space-y-2.5 shadow-card">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="search"
                    value={assetSearch}
                    onChange={e => setAssetSearch(e.target.value)}
                    placeholder="Tìm theo tên tư liệu, ảnh hoặc tài liệu..."
                    className="w-full h-8 pl-8 pr-3 text-xs bg-surface-sunken border border-surface-border rounded-lg text-text-main focus:outline-none focus:border-parish-primary"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto divide-y divide-surface-border border border-surface-border rounded-lg bg-surface-app">
                  {availableAssets.length === 0 ? (
                    <p className="p-2.5 text-xs text-text-muted text-center m-0">
                      {snapshot.assets.length === assetIds.length
                        ? 'Đã gắn thẻ toàn bộ tư liệu'
                        : 'Không tìm thấy tư liệu phù hợp'}
                    </p>
                  ) : (
                    availableAssets.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleAddAsset(a.id)}
                        aria-label={`Thêm ${a.title}`}
                        className="w-full p-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-surface-sunken text-text-main transition-colors cursor-pointer"
                      >
                        <span className="font-bold truncate">{a.title}</span>
                        <Plus size={13} className="text-parish-primary shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </Surface>

        {/* KHỐI 4: TRẠNG THÁI XUẤT BẢN & PHẠM VI HIỂN THỊ */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <FileClock className="w-4 h-4 text-parish-primary" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
                4. Trạng Thái Xuất Bản &amp; Dòng Thời Gian
              </h3>
            </div>
            <Badge tone={STATUS_CONFIG[status].tone}>{STATUS_CONFIG[status].label}</Badge>
          </div>

          {/* Status selector (3 Segmented Cards) */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-text-main block">
              Trạng thái bản ghi <span className="text-parish-danger">*</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(['PUBLISHED', 'DRAFT', 'ARCHIVED'] as const).map(stKey => {
                const cfg = STATUS_CONFIG[stKey]
                const isSelected = status === stKey
                return (
                  <button
                    key={stKey}
                    type="button"
                    onClick={() => setStatus(stKey)}
                    className={`p-3 rounded-xl border text-left transition-colors flex flex-col justify-between gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'border-parish-primary bg-parish-primary/10 shadow-sm ring-1 ring-parish-primary'
                        : 'border-surface-border bg-surface-sunken hover:bg-surface-hover text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-xs font-bold ${isSelected ? 'text-text-main' : 'text-text-secondary'}`}>
                        {cfg.label}
                      </span>
                      {isSelected && <Check size={14} className="text-parish-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-text-muted m-0 line-clamp-2 leading-tight">
                      {cfg.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Visibility & Timeline Checkbox */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-surface-border">
            {/* Show on Timeline toggle */}
            <label className="flex items-start gap-3 p-3 rounded-xl border border-surface-border bg-surface-sunken cursor-pointer hover:bg-surface-hover transition-colors">
              <input
                type="checkbox"
                checked={showOnTimeline}
                onChange={e => setShowOnTimeline(e.target.checked)}
                className="mt-0.5 rounded border-surface-border text-parish-primary focus:ring-parish-primary"
              />
              <div className="min-w-0">
                <span className="text-xs font-bold text-text-main block">
                  Hiển thị trên Timeline Xứ đoàn
                </span>
                <span className="text-xs text-text-muted block mt-0.5">
                  Ghim cột mốc này vào dòng thời gian lịch sử tổng quan.
                </span>
              </div>
            </label>

            {/* Visibility radio */}
            <label className="flex items-start gap-3 p-3 rounded-xl border border-surface-border bg-surface-sunken cursor-pointer hover:bg-surface-hover transition-colors">
              <input
                type="checkbox"
                checked={visibility === 'ADMIN'}
                onChange={e => setVisibility(e.target.checked ? 'ADMIN' : 'STAFF')}
                className="mt-0.5 rounded border-surface-border text-parish-primary focus:ring-parish-primary"
              />
              <div className="min-w-0">
                <span className="text-xs font-bold text-text-main block">
                  Chỉ hiển thị cho Ban Quản trị
                </span>
                <span className="text-xs text-text-muted block mt-0.5">
                  Bảo mật nội bộ, Huynh trưởng thường sẽ không thấy bản ghi này.
                </span>
              </div>
            </label>
          </div>

          {/* Mã sự kiện nguồn (optional) */}
          <div className="pt-1">
            <label htmlFor="sourceEventId-input" className="text-xs font-semibold text-text-muted block mb-1">
              Mã sự kiện nguồn liên kết (nếu phát sinh từ Lịch sự kiện Xứ đoàn):
            </label>
            <TextInput
              id="sourceEventId-input"
              placeholder="VD: EVT-2026-CHAY..."
              maxLength={80}
              value={sourceEventId}
              onChange={e => setSourceEventId(e.target.value)}
              disabled={store.isSaving}
            />
          </div>
        </Surface>

        {/* THẺ XEM TRƯỚC THỜI GIAN THỰC (LIVE PREVIEW) */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted block">
            Xem trước thẻ bản ghi (Live Preview):
          </span>
          <Surface variant="entity" className="p-4 border border-surface-border space-y-2 bg-surface-app/70">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge tone="primary">{typeConfig.shortLabel}</Badge>
                  {status !== 'PUBLISHED' && (
                    <Badge tone={STATUS_CONFIG[status].tone}>{STATUS_CONFIG[status].label}</Badge>
                  )}
                  {visibility === 'ADMIN' && <Badge tone="neutral">Chỉ Admin</Badge>}
                  {showOnTimeline && <Badge tone="teal">Ghim Timeline</Badge>}
                </div>
                <h4 className="text-sm font-black text-text-main m-0 mt-1">
                  {title || 'Chưa nhập tiêu đề bản ghi'}
                </h4>
                <p className="text-xs text-text-muted m-0 flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDateDisplay(occurredOn)}
                    {endedOn ? ` – ${formatDateDisplay(endedOn)}` : ''}
                  </span>
                  {location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {location}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {summary && (
              <p className="text-xs text-text-secondary m-0 line-clamp-2 leading-relaxed pt-1 border-t border-surface-border/60">
                {summary}
              </p>
            )}

            {personIds.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {personIds.map(id => {
                  const p = peopleById.get(id)
                  return (
                    <span key={id} className="badge badge-neutral text-xs">
                      {p ? `${p.holyName ? `${p.holyName} ` : ''}${p.fullName}` : id}
                    </span>
                  )
                })}
              </div>
            )}
          </Surface>
        </div>
      </form>
    </ModalShell>
  )
}
