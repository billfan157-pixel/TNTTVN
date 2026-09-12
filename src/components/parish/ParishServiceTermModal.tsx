import { useId, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Award,
  Building2,
  Calendar,
  CalendarRange,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserRound,
} from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { NoResultState } from '../common/StateFeedback'
import { Badge, Button, Select, Surface, TextArea, TextInput } from '../common/ui'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import {
  PARISH_POSITION_TITLE_OPTIONS,
  PARISH_RANK_TITLE_SUGGESTIONS,
  isTermActiveOn,
} from '../../utils/parishTerms'
import type {
  ParishOperationsPositionCode,
  ParishProfileSnapshot,
  ParishServiceTerm,
  ParishUnitType,
} from '../../types/parishProfile'

export interface ParishServiceTermModalProps {
  term?: ParishServiceTerm
  initialPersonId?: string
  initialUnitId?: string
  snapshot: ParishProfileSnapshot
  onClose: () => void
  onSuccess?: () => void
}

const today = () => new Date().toISOString().slice(0, 10)
const normalize = (value: string) => value.trim() || null

type TermPositionCode = ParishOperationsPositionCode | ''

const POSITION_CODE_DETAILS: Record<
  ParishOperationsPositionCode,
  { label: string; scopeLabel: string; description: string; badgeTone: 'primary' | 'violet' | 'teal' }
> = {
  PARISH_LEADER: {
    label: 'Trưởng Xứ đoàn (Toàn xứ)',
    scopeLabel: 'Thẩm quyền toàn Xứ đoàn',
    description: 'Có toàn quyền tạo, điều phối và phê chuẩn mọi Event, Workstream và Task trên toàn Giáo xứ.',
    badgeTone: 'primary',
  },
  PARISH_SECRETARY: {
    label: 'Thư ký Xứ đoàn (Toàn xứ)',
    scopeLabel: 'Thẩm quyền toàn Xứ đoàn (theo ủy quyền)',
    description: 'Được tạo sự kiện Xứ đoàn thay mặt Trưởng Xứ đoàn (Organizer luôn là Trưởng Xứ đoàn) và hỗ trợ cấu hình Event/Field.',
    badgeTone: 'primary',
  },
  PARISH_DEPUTY: {
    label: 'Phó Xứ đoàn (Toàn xứ)',
    scopeLabel: 'Thẩm quyền toàn Xứ đoàn (theo ủy quyền)',
    description: 'Được tạo sự kiện Xứ đoàn với Organizer là Trưởng Xứ đoàn. Không tự trở thành Organizer.',
    badgeTone: 'primary',
  },
  BRANCH_LEADER: {
    label: 'Trưởng ngành (Khối Ngành)',
    scopeLabel: 'Thẩm quyền trong Ngành',
    description: 'Có quyền tạo và điều phối các sự kiện, chỉ định Organizer và giao task cho nhân sự thuộc Ngành phụ trách.',
    badgeTone: 'teal',
  },
  BRANCH_DEPUTY: {
    label: 'Phó Ngành (Khối Ngành)',
    scopeLabel: 'Thẩm quyền trong Ngành (không làm Field Lead)',
    description: 'Được tạo sự kiện chuyên môn và Task trong Ngành với Organizer là Trưởng Ngành. Không được làm Trưởng Field.',
    badgeTone: 'teal',
  },
  COMMITTEE_LEADER: {
    label: 'Trưởng ban (Khối Chuyên môn)',
    scopeLabel: 'Thẩm quyền trong Ban',
    description: 'Có quyền tạo và điều phối các sự kiện chuyên môn, chỉ định Workstream Lead và điều động nhân sự trong Ban.',
    badgeTone: 'violet',
  },
  COMMITTEE_DEPUTY: {
    label: 'Phó Ban (Khối Chuyên môn)',
    scopeLabel: 'Thẩm quyền trong Ban (không làm Field Lead)',
    description: 'Được tạo sự kiện chuyên môn và Task trong Ban với Organizer là Trưởng Ban. Không được làm Trưởng Field.',
    badgeTone: 'violet',
  },
}

const codeDetails = (code: TermPositionCode) => (code ? POSITION_CODE_DETAILS[code as ParishOperationsPositionCode] : undefined)

const AUTHORITY_REASON_PRESETS = [
  'Bổ nhiệm đầu niên khóa mới',
  'Kiện toàn nhân sự Ban Điều Hành',
  'Thay thế nhân sự chuyển xứ / xin nghỉ',
  'Bổ nhiệm nhiệm kỳ bổ sung',
] as const

function isPositionCodeValidForUnitType(
  positionCode: TermPositionCode,
  unitType: ParishUnitType | null,
): boolean {
  if (!positionCode) return true
  if (positionCode === 'PARISH_LEADER' || positionCode === 'PARISH_SECRETARY' || positionCode === 'PARISH_DEPUTY') {
    return unitType === null || unitType === 'BOARD'
  }
  if (positionCode === 'BRANCH_LEADER' || positionCode === 'BRANCH_DEPUTY') return unitType === 'BRANCH'
  if (positionCode === 'COMMITTEE_LEADER' || positionCode === 'COMMITTEE_DEPUTY') return unitType === 'COMMITTEE'
  return false
}

export function ParishServiceTermModal({
  term,
  initialPersonId,
  initialUnitId,
  snapshot,
  onClose,
  onSuccess,
}: ParishServiceTermModalProps) {
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const isEditing = Boolean(term?.id)

  // Form State
  const [personId, setPersonId] = useState(term?.personId ?? initialPersonId ?? '')
  const [personSearch, setPersonSearch] = useState('')
  const [isPersonPickerOpen, setIsPersonPickerOpen] = useState(false)

  const [unitId, setUnitId] = useState(term?.unitId ?? initialUnitId ?? '')
  const [positionTitle, setPositionTitle] = useState(term?.positionTitle ?? '')
  const [positionCode, setPositionCode] = useState<TermPositionCode>(term?.positionCode ?? '')
  const [isCustomPositionCode, setIsCustomPositionCode] = useState(Boolean(term?.positionCode))

  const [rankTitle, setRankTitle] = useState(term?.rankTitle ?? '')
  const [startDate, setStartDate] = useState(term?.startDate ?? today())
  const [endDate, setEndDate] = useState(term?.endDate ?? '')
  const [notes, setNotes] = useState(term?.notes ?? '')

  const [authorityReason, setAuthorityReason] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const reasonDatalistId = useId()
  const rankDatalistId = useId()

  // Find selected person & unit
  const selectedPerson = useMemo(
    () => snapshot.people.find(p => p.id === personId),
    [snapshot.people, personId],
  )
  const selectedUnit = useMemo(
    () => snapshot.units.find(u => u.id === unitId),
    [snapshot.units, unitId],
  )

  // Filtered people for picker
  const filteredPeople = useMemo(() => {
    const q = personSearch.trim().toLowerCase()
    if (!q) return snapshot.people
    return snapshot.people.filter(p => {
      const full = `${p.holyName ?? ''} ${p.fullName}`.toLowerCase()
      return full.includes(q)
    })
  }, [snapshot.people, personSearch])

  // Person linked account status
  const linkedAccount = useMemo(() => {
    if (!selectedPerson?.linkedUserId) return null
    return snapshot.accounts.find(a => a.id === selectedPerson.linkedUserId)
  }, [snapshot.accounts, selectedPerson])

  // Active terms of the selected person
  const personActiveTerms = useMemo(() => {
    if (!selectedPerson) return []
    const now = today()
    return snapshot.terms.filter(
      t => t.personId === selectedPerson.id && (!term || t.id !== term.id) && isTermActiveOn(t, now),
    )
  }, [snapshot.terms, selectedPerson, term])

  // Title suggestions based on selected unit
  const positionTitleSuggestions = useMemo(() => {
    const type = selectedUnit ? selectedUnit.unitType : 'BOARD'
    return PARISH_POSITION_TITLE_OPTIONS[type] || []
  }, [selectedUnit])

  // Unit compatibility check
  const isCodeUnitCompatible = useMemo(() => {
    const type = selectedUnit ? selectedUnit.unitType : null
    return isPositionCodeValidForUnitType(positionCode, type)
  }, [positionCode, selectedUnit])

  // Handle position title selection / change with smart positionCode suggestion
  const handleSelectPositionTitle = (title: string) => {
    setPositionTitle(title)
    if (!isCustomPositionCode) {
      const normalized = title.trim().toLocaleLowerCase('vi')
      if (title.includes('Trưởng Xứ đoàn') || title.includes('Xứ đoàn trưởng')) {
        setPositionCode('PARISH_LEADER')
      } else if (normalized.includes('thư ký')) {
        setPositionCode('PARISH_SECRETARY')
      } else if (normalized.includes('phó xứ')) {
        setPositionCode('PARISH_DEPUTY')
      } else if (title.includes('Trưởng ngành')) {
        setPositionCode('BRANCH_LEADER')
      } else if (normalized.includes('phó ngành') || normalized.includes('phó trưởng ngành')) {
        setPositionCode('BRANCH_DEPUTY')
      } else if (title.includes('Trưởng ban')) {
        setPositionCode('COMMITTEE_LEADER')
      } else if (normalized.includes('phó ban') || normalized.includes('phó trưởng ban')) {
        setPositionCode('COMMITTEE_DEPUTY')
      } else {
        setPositionCode('')
      }
    }
  }

  // Quick preset dates
  const handlePresetDate = (preset: 'SCHOOL_YEAR' | 'TRIENNIUM' | 'INDEFINITE') => {
    if (preset === 'INDEFINITE') {
      setEndDate('')
      return
    }
    const start = new Date(startDate || today())
    const startYear = start.getFullYear()
    if (preset === 'SCHOOL_YEAR') {
      const endYear = start.getMonth() < 8 ? startYear : startYear + 1
      setEndDate(`${endYear}-08-31`)
    } else if (preset === 'TRIENNIUM') {
      const end = new Date(start)
      end.setFullYear(end.getFullYear() + 3)
      end.setDate(end.getDate() - 1)
      setEndDate(end.toISOString().slice(0, 10))
    }
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!personId) {
      addToast('Vui lòng chọn nhân sự đảm nhận nhiệm kỳ', 'error')
      return
    }
    if (!positionTitle.trim()) {
      addToast('Vui lòng nhập tên chức vụ bổ nhiệm', 'error')
      return
    }
    if (!startDate) {
      addToast('Vui lòng chọn ngày bắt đầu nhiệm kỳ', 'error')
      return
    }
    if (endDate && endDate < startDate) {
      addToast('Ngày kết thúc không được trước ngày bắt đầu', 'error')
      return
    }
    if (!isCodeUnitCompatible) {
      addToast(`Vai trò điều phối đã chọn không hợp với loại đơn vị “${selectedUnit?.name}”. Vui lòng đổi đơn vị hoặc vai trò.`, 'error')
      return
    }
    if (authorityReason.trim().length < 3 || !adminPassword) {
      addToast('Vui lòng nhập lý do (ít nhất 3 ký tự) và mật khẩu Admin để xác nhận', 'error')
      return
    }

    const payload = {
      personId,
      unitId: normalize(unitId),
      positionTitle: positionTitle.trim(),
      positionCode: (positionCode || null) as ParishServiceTerm['positionCode'],
      rankTitle: normalize(rankTitle),
      startDate,
      endDate: normalize(endDate),
      notes: normalize(notes),
      authorityReason: authorityReason.trim(),
      adminPassword,
    }

    const ok = isEditing && term
      ? await store.updateTerm(term.id, payload)
      : await store.createTerm(payload)

    if (ok) {
      addToast(
        isEditing ? 'Cập nhật nhiệm kỳ thành công' : 'Đã bổ nhiệm nhiệm kỳ mới thành công',
        'success',
      )
      onSuccess?.()
      onClose()
    } else {
      addToast(store.error || 'Không thể lưu nhiệm kỳ', 'error')
    }
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={isEditing ? 'Cập Nhật Nhiệm Kỳ Phục Vụ' : 'Bổ Nhiệm Nhiệm Kỳ Mới'}
      subtitle="Phân bổ nhân sự, xác lập đơn vị tổ chức và cấu hình thẩm quyền điều phối Operations."
      icon={<CalendarRange className="w-5 h-5 text-parish-primary" />}
      maxWidth="760px"
      footer={(
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-text-muted hidden sm:block">
            {isEditing ? `Mã nhiệm kỳ: ${term?.id}` : 'Xác thực bảo mật bắt buộc'}
          </div>
          <div className="flex items-center gap-2.5 ml-auto">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={store.isSaving}
              onClick={onClose}
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              form="parish-service-term-form"
              variant="primary"
              size="md"
              loading={store.isSaving}
              leadingIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              {isEditing ? 'Lưu thay đổi' : 'Xác nhận bổ nhiệm'}
            </Button>
          </div>
        </div>
      )}
    >
      <form id="parish-service-term-form" noValidate onSubmit={handleSubmit} className="space-y-6 pb-2">
        {/* KHỐI 1: CHỌN VÀ HIỂN THỊ NHÂN SỰ */}
        <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-parish-primary/10 text-parish-primary flex items-center justify-center">
                <UserRound className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-text-main m-0">1. Nhân Sự Được Bổ Nhiệm</h3>
            </div>
            {selectedPerson && (
              <Button
                type="button"
                variant="quiet"
                size="sm"
                className="h-7 text-xs text-parish-primary hover:underline"
                onClick={() => setIsPersonPickerOpen(!isPersonPickerOpen)}
              >
                {isPersonPickerOpen ? 'Đóng tìm kiếm' : 'Đổi nhân sự khác'}
              </Button>
            )}
          </div>

          {/* Search / Selector Dropdown */}
          {(!selectedPerson || isPersonPickerOpen) && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <TextInput
                  type="search"
                  value={personSearch}
                  placeholder="Gõ tên Thánh hoặc họ tên để tìm nhanh..."
                  className="pl-9 text-sm"
                  onChange={e => setPersonSearch(e.target.value)}
                  autoFocus={!selectedPerson}
                />
              </div>

              <div className="max-h-44 overflow-y-auto rounded-xl border border-surface-border bg-surface-sunken p-1.5 space-y-1">
                {filteredPeople.length === 0 ? (
                  <NoResultState
                    className="!py-4 !px-2"
                    title="Không tìm thấy nhân sự"
                    description="Vui lòng thử tìm với từ khóa hoặc tên Thánh khác."
                    resetLabel="Xóa tìm kiếm"
                    onReset={() => setPersonSearch('')}
                  />
                ) : (
                  filteredPeople.map(p => {
                    const isSelected = p.id === personId
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPersonId(p.id)
                          setIsPersonPickerOpen(false)
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors ${
                          isSelected
                            ? 'bg-parish-primary text-white font-semibold'
                            : 'hover:bg-surface-card text-text-main'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-parish-primary/10 text-parish-primary'
                            }`}
                          >
                            {p.holyName ? p.holyName.slice(0, 1) : p.fullName.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-semibold">
                              {p.holyName ? `${p.holyName} ` : ''}
                              {p.fullName}
                            </div>
                            <div className={`typography-body-sm ${isSelected ? 'text-white/80' : 'text-text-muted'}`}>
                              Sinh năm: {p.birthYear ?? 'Chưa rõ'} • Mã: {p.id}
                            </div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-white shrink-0 ml-2" />}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* Selected Person Profile Card */}
          {selectedPerson && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-surface-sunken border border-surface-border">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-parish-primary/10 text-parish-primary flex items-center justify-center font-black text-base shrink-0 border border-parish-primary/20">
                  {selectedPerson.holyName ? selectedPerson.holyName.slice(0, 2) : selectedPerson.fullName.slice(0, 2)}
                </div>
                <div>
                  <div className="font-bold text-text-main text-sm flex items-center gap-2">
                    <span>
                      {selectedPerson.holyName ? `${selectedPerson.holyName} ` : ''}
                      {selectedPerson.fullName}
                    </span>
                    <Badge tone={selectedPerson.serviceStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                      {selectedPerson.serviceStatus === 'ACTIVE' ? 'Đang phục vụ' : 'Cựu GLV'}
                    </Badge>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Năm sinh: {selectedPerson.birthYear ?? 'Chưa rõ'} • Mã định danh: <code className="font-mono">{selectedPerson.id}</code>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                {linkedAccount ? (
                  <Badge tone="teal" icon={<UserCheck className="w-3 h-3" />}>
                    Đã liên kết Staff ({linkedAccount.role})
                  </Badge>
                ) : (
                  <Badge tone="neutral" icon={<Info className="w-3 h-3" />}>
                    Chưa liên kết tài khoản
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Active terms warnings (Clean Dual-Tenure) */}
          {personActiveTerms.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-parish-primary-bg/20 border border-parish-primary/30 text-xs text-text-main">
              <Sparkles className="w-4 h-4 text-parish-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-parish-primary">Lưu ý kiêm nhiệm: </span>
                Nhân sự này hiện đang giữ {personActiveTerms.length} nhiệm kỳ còn hiệu lực (
                {personActiveTerms.map(t => t.positionTitle).join(', ')}). Bổ nhiệm này sẽ tạo thêm một nhiệm kỳ độc lập.
              </div>
            </div>
          )}
        </Surface>

        {/* KHỐI 2: ĐƠN VỊ & CHỨC VỤ BỔ NHIỆM */}
        <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-parish-teal/10 text-parish-teal flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-text-main m-0">2. Đơn Vị & Chức Vụ Tổ Chức</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Đơn vị tổ chức */}
            <label className="form-group">
              <span className="form-label">Đơn vị bổ nhiệm *</span>
              <Select
                required
                value={unitId}
                onChange={e => setUnitId(e.target.value)}
                className="w-full text-sm"
              >
                <option value="">Toàn Xứ đoàn (Ban Điều Hành chung)</option>
                {snapshot.units.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.unitType})
                  </option>
                ))}
              </Select>
            </label>

            {/* Tên chức danh bổ nhiệm */}
            <label className="form-group">
              <span className="form-label">Tên chức vụ hiển thị *</span>
              <TextInput
                required
                maxLength={200}
                value={positionTitle}
                placeholder="Ví dụ: Trưởng ngành, Phó ban, Thủ quỹ..."
                onChange={e => handleSelectPositionTitle(e.target.value)}
                className="w-full text-sm"
              />
            </label>
          </div>

          {/* Gợi ý chức vụ nhanh theo loại đơn vị */}
          {positionTitleSuggestions.length > 0 && (
            <div className="space-y-1.5">
              <span className="typography-body-sm font-semibold text-text-muted">Gợi ý chức vụ chuẩn theo đơn vị đã chọn:</span>
              <div className="flex flex-wrap gap-1.5">
                {positionTitleSuggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSelectPositionTitle(suggestion)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      positionTitle === suggestion
                        ? 'bg-parish-primary text-white border-parish-primary font-bold shadow-sm'
                        : 'bg-surface-sunken hover:bg-surface-card text-text-main border-surface-border'
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Vai trò điều phối Operations (Smart Mapping) */}
          <div className="rounded-xl border border-surface-border bg-surface-sunken p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-parish-primary" />
                <span className="text-xs font-bold text-text-main">Thẩm quyền Điều phối Operations:</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomPositionCode(!isCustomPositionCode)}
                className="typography-body-sm font-semibold text-parish-primary hover:underline"
              >
                {isCustomPositionCode ? 'Tự động theo chức danh' : 'Tùy chỉnh vai trò kỹ thuật'}
              </button>
            </div>

            {isCustomPositionCode ? (
              <Select
                value={positionCode}
                onChange={e => setPositionCode(e.target.value as TermPositionCode)}
                className="w-full text-sm"
              >
                <option value="">Không cấp quyền tự động (Theo nhiệm vụ cụ thể)</option>
                <option value="PARISH_LEADER">PARISH_LEADER — Trưởng Xứ đoàn (Toàn xứ)</option>
                <option value="PARISH_SECRETARY">PARISH_SECRETARY — Thư ký Xứ đoàn (Toàn xứ)</option>
                <option value="PARISH_DEPUTY">PARISH_DEPUTY — Phó Xứ đoàn (Toàn xứ)</option>
                <option value="BRANCH_LEADER">BRANCH_LEADER — Trưởng ngành (Khối Ngành)</option>
                <option value="BRANCH_DEPUTY">BRANCH_DEPUTY — Phó Ngành (Khối Ngành)</option>
                <option value="COMMITTEE_LEADER">COMMITTEE_LEADER — Trưởng ban (Khối Ban Chuyên môn)</option>
                <option value="COMMITTEE_DEPUTY">COMMITTEE_DEPUTY — Phó Ban (Khối Ban Chuyên môn)</option>
              </Select>
            ) : (
              <div className="flex items-center gap-2">
                {codeDetails(positionCode) ? (
                  <Badge tone={codeDetails(positionCode)!.badgeTone}>
                    {codeDetails(positionCode)!.label}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Chức vụ tổ chức thường nhật (Không tự động có quyền điều phối)</Badge>
                )}
              </div>
            )}

            {/* Giải thích quyền hạn */}
            <p className="text-xs text-text-muted m-0">
              {codeDetails(positionCode)
                ? codeDetails(positionCode)!.description
                : 'Thành viên Ban Điều Hành, Thủ quỹ, Ủy viên, Chi đoàn trưởng hoặc GLV không tự động có quyền điều phối toàn đơn vị; quyền vận hành sẽ phát sinh cụ thể khi được giao vai trò Event Organizer, Workstream Lead hoặc Task Assignee.'}
            </p>

            {/* Cảnh báo không tương thích đơn vị */}
            {!isCodeUnitCompatible && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-parish-danger/10 border border-parish-danger text-parish-danger text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Vai trò “{positionCode}” không tương thích với loại đơn vị “{selectedUnit?.name}” ({selectedUnit?.unitType}). Máy chủ sẽ từ chối lưu.
                </span>
              </div>
            )}
          </div>
        </Surface>

        {/* KHỐI 3: CẤP BẬC & THỜI HẠN NHIỆM KỲ */}
        <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-parish-orange/10 text-parish-orange flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-text-main m-0">3. Cấp Bậc & Thời Hạn Phục Vụ</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Cấp bậc */}
            <label className="form-group sm:col-span-1">
              <span className="form-label flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-text-muted" />
                Cấp bậc Huynh trưởng
              </span>
              <TextInput
                maxLength={150}
                list={rankDatalistId}
                value={rankTitle}
                placeholder="Ví dụ: Cấp II, Cấp III..."
                onChange={e => setRankTitle(e.target.value)}
                className="w-full text-sm"
              />
              <datalist id={rankDatalistId}>
                {PARISH_RANK_TITLE_SUGGESTIONS.map(rank => (
                  <option key={rank} value={rank} />
                ))}
              </datalist>
            </label>

            {/* Ngày bắt đầu */}
            <label className="form-group sm:col-span-1">
              <span className="form-label flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-text-muted" />
                Ngày bắt đầu *
              </span>
              <TextInput
                required
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full text-sm"
              />
            </label>

            {/* Ngày kết thúc */}
            <label className="form-group sm:col-span-1">
              <span className="form-label flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-text-muted" />
                Ngày kết thúc
              </span>
              <TextInput
                type="date"
                min={startDate}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full text-sm"
              />
            </label>
          </div>

          {/* Phím tắt thời hạn nhanh (Presets) */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="typography-body-sm font-semibold text-text-muted">Chọn nhanh thời hạn:</span>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="h-7 text-xs bg-surface-sunken hover:bg-surface-card border border-surface-border"
              onClick={() => handlePresetDate('SCHOOL_YEAR')}
            >
              + 1 Niên khóa Giáo lý
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="h-7 text-xs bg-surface-sunken hover:bg-surface-card border border-surface-border"
              onClick={() => handlePresetDate('TRIENNIUM')}
            >
              + 3 Năm Nhiệm kỳ BĐH
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="h-7 text-xs bg-surface-sunken hover:bg-surface-card border border-surface-border"
              onClick={() => handlePresetDate('INDEFINITE')}
            >
              Đương nhiệm (Không thời hạn)
            </Button>
          </div>

          {/* Ghi chú */}
          <label className="form-group">
            <span className="form-label">Ghi chú bổ sung (số bài sai, văn bản bổ nhiệm...)</span>
            <TextArea
              rows={2}
              maxLength={3000}
              value={notes}
              placeholder="Nhập ghi chú tùy ý..."
              onChange={e => setNotes(e.target.value)}
              className="w-full text-sm"
            />
          </label>
        </Surface>

        {/* KHỐI 4: THẺ XEM TRƯỚC QUYỀN HẠN & XÁC THỰC ADMIN */}
        <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-parish-indigo/10 text-parish-indigo flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-text-main m-0">4. Thẩm Quyền Dự Kiến & Xác Thực Bảo Mật</h3>
          </div>

          {/* Live Authority Preview Card */}
          <div className="p-3.5 rounded-xl bg-surface-sunken border border-surface-border space-y-2.5">
            <div className="text-xs font-bold text-text-main flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-parish-primary" />
              Tổng quan hiệu lực bổ nhiệm:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Nhân sự:</span>
                <span className="font-semibold text-text-main">
                  {selectedPerson ? `${selectedPerson.holyName ?? ''} ${selectedPerson.fullName}` : '(Chưa chọn)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Chức vụ:</span>
                <span className="font-semibold text-text-main">{positionTitle || '(Chưa nhập)'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Đơn vị:</span>
                <span className="font-semibold text-text-main">{selectedUnit ? selectedUnit.name : 'Toàn Xứ đoàn'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Quyền điều phối:</span>
                <span className="font-semibold text-text-main">
                  {codeDetails(positionCode)?.scopeLabel ?? 'Theo tài nguyên cụ thể'}
                </span>
              </div>
            </div>
          </div>

          {/* Khối Xác thực Admin */}
          <div className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg/20 p-4 space-y-3.5">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-parish-warning shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-text-main">Xác nhận thay đổi thẩm quyền nhân sự</div>
                <div className="typography-body-sm text-text-muted mt-0.5">
                  Thay đổi nhiệm kỳ tác động trực tiếp đến quyền phân công và điều phối của Xứ đoàn. Máy chủ sẽ xác thực mật khẩu Admin và lưu lý do vào nhật ký kiểm toán bất biến.
                </div>
              </div>
            </div>

            {/* Lý do thay đổi */}
            <label className="form-group">
              <span className="form-label">Lý do bổ nhiệm / thay đổi quyền hạn *</span>
              <TextInput
                required
                minLength={3}
                maxLength={500}
                list={reasonDatalistId}
                value={authorityReason}
                placeholder="Ví dụ: Bổ nhiệm đầu niên khóa mới..."
                onChange={e => setAuthorityReason(e.target.value)}
                className="w-full text-sm"
              />
              <datalist id={reasonDatalistId}>
                {AUTHORITY_REASON_PRESETS.map(reason => (
                  <option key={reason} value={reason} />
                ))}
              </datalist>
            </label>

            {/* Mật khẩu Admin */}
            <label className="form-group">
              <span className="form-label flex items-center justify-between">
                <span>Mật khẩu Admin hiện tại *</span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="typography-body-sm text-text-muted hover:text-text-main flex items-center gap-1"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                </button>
              </span>
              <div className="relative">
                <TextInput
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  maxLength={128}
                  value={adminPassword}
                  placeholder="Nhập mật khẩu tài khoản Admin của bạn..."
                  onChange={e => setAdminPassword(e.target.value)}
                  className="w-full text-sm font-mono pr-9"
                />
                <KeyRound className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </label>
          </div>
        </Surface>
      </form>
    </ModalShell>
  )
}
