import { useId, useMemo, useState } from 'react'
import {
  Calendar,
  Check,
  CheckCircle2,
  FileText,
  GraduationCap,
  Info,
  Search,
  Sparkles,
  UserCheck,
  UserRound,
  Users,
} from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Badge, Button, Surface, TextArea, TextInput } from '../common/ui'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type {
  ParishAccountOption,
  ParishPerson,
  ParishPersonInput,
  ParishPersonStatus,
  ParishProfileSnapshot,
  ParishVisibility,
} from '../../types/parishProfile'

export interface ParishPersonModalProps {
  person?: ParishPerson
  snapshot: ParishProfileSnapshot
  onClose: () => void
  onSuccess?: () => void
}

const COMMON_HOLY_NAMES = [
  'Giuse',
  'Maria',
  'Têrêsa',
  'Gioan Baotixita',
  'Phaolô',
  'Phêrô',
  'Phanxicô Xaviê',
  'Đaminh',
  'Antôn',
  'Anrê',
  'Matta',
  'Anna',
  'Catarina',
  'Luxia',
  'Micae',
  'Giacôbê',
  'Inhaxiô',
  'Gioan Bosco',
  'Cecilia',
  'Agata',
] as const

const BIOGRAPHY_PRESETS = [
  'Giáo lý viên phụ trách ngành Ấu Nhi.',
  'Giáo lý viên phụ trách ngành Thiếu Nhi.',
  'Huynh trưởng ngành Nghĩa Sĩ.',
  'Tuyên hứa Huynh trưởng năm 2020.',
  'Đã hoàn thành Sa mạc Huấn luyện Horeb.',
  'Cựu Ban Điều Hành Xứ đoàn.',
] as const

const STATUS_CONFIG: Record<
  ParishPersonStatus,
  { label: string; desc: string; tone: 'success' | 'neutral'; icon: typeof UserCheck }
> = {
  ACTIVE: {
    label: 'Đang phục vụ',
    desc: 'Đang tham gia sinh hoạt, điều hành hoặc giảng dạy tại Xứ đoàn.',
    tone: 'success',
    icon: UserCheck,
  },
  FORMER: {
    label: 'Đã mãn nhiệm',
    desc: 'Cựu huynh trưởng/GLV tiền bối đã hoàn tất sứ vụ hoặc chuyển nơi ở.',
    tone: 'neutral',
    icon: UserRound,
  },
  DECEASED: {
    label: 'Đã qua đời',
    desc: 'Tưởng nhớ và tri ân những hy sinh cống hiến cho Xứ đoàn.',
    tone: 'neutral',
    icon: Sparkles,
  },
}

const normalize = (value: string) => value.trim() || null

export function ParishPersonModal({
  person,
  snapshot,
  onClose,
  onSuccess,
}: ParishPersonModalProps) {
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const isEditing = Boolean(person?.id)
  const holyNameListId = useId()
  const currentYear = new Date().getFullYear()

  // Form State
  const [holyName, setHolyName] = useState(person?.holyName ?? '')
  const [fullName, setFullName] = useState(person?.fullName ?? '')
  const [birthYear, setBirthYear] = useState(person?.birthYear?.toString() ?? '')
  const [linkedUserId, setLinkedUserId] = useState(person?.linkedUserId ?? '')
  const [serviceStatus, setServiceStatus] = useState<ParishPersonStatus>(person?.serviceStatus ?? 'ACTIVE')
  const [visibility, setVisibility] = useState<ParishVisibility>(person?.visibility ?? 'STAFF')
  const [biography, setBiography] = useState(person?.biography ?? '')

  // Account selector & search state
  const [accountSearch, setAccountSearch] = useState('')
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false)
  const [autoFilledNotice, setAutoFilledNotice] = useState<string | null>(null)

  // Map of users who already have a profile linked
  const linkedUserIdsMap = useMemo(() => {
    const map = new Map<string, ParishPerson>()
    for (const p of snapshot.people) {
      if (p.linkedUserId && p.id !== person?.id) {
        map.set(p.linkedUserId, p)
      }
    }
    return map
  }, [snapshot.people, person?.id])

  // Current selected account
  const selectedAccount = useMemo(() => {
    if (!linkedUserId) return null
    return snapshot.accounts.find(a => a.id === linkedUserId) ?? null
  }, [snapshot.accounts, linkedUserId])

  // Filtered accounts list
  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase()
    if (!q) return snapshot.accounts
    return snapshot.accounts.filter(a => {
      const full = `${a.holyName ?? ''} ${a.fullName}`.toLowerCase()
      const role = a.role.toLowerCase()
      return full.includes(q) || role.includes(q)
    })
  }, [snapshot.accounts, accountSearch])

  // Handle selecting an account
  const handleSelectAccount = (account: ParishAccountOption | null) => {
    if (!account) {
      setLinkedUserId('')
      setIsAccountPickerOpen(false)
      setAutoFilledNotice(null)
      return
    }

    setLinkedUserId(account.id)
    setIsAccountPickerOpen(false)

    // Auto-fill names if empty
    let filled = false
    if (!holyName.trim() && account.holyName) {
      setHolyName(account.holyName)
      filled = true
    }
    if (!fullName.trim() && account.fullName) {
      setFullName(account.fullName)
      filled = true
    }
    if (filled) {
      setAutoFilledNotice(`Đã tự động điền Tên thánh & Họ tên từ tài khoản ${account.fullName}`)
    }
  }

  // Age calculation
  const calculatedAge = useMemo(() => {
    const yearNum = Number.parseInt(birthYear, 10)
    if (!yearNum || Number.isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear) return null
    return currentYear - yearNum
  }, [birthYear, currentYear])

  // Avatar Initials
  const avatarInitials = useMemo(() => {
    if (holyName.trim() && fullName.trim()) {
      return `${holyName.trim().charAt(0)}${fullName.trim().charAt(0)}`.toUpperCase()
    }
    if (fullName.trim()) {
      const parts = fullName.trim().split(/\s+/)
      if (parts.length >= 2) {
        return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
      }
      return fullName.trim().slice(0, 2).toUpperCase()
    }
    return 'HT'
  }, [holyName, fullName])

  // Form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedFullName = fullName.trim()
    if (!trimmedFullName) {
      addToast('Vui lòng nhập Họ và tên nhân sự', 'error')
      return
    }

    let parsedBirthYear: number | null = null
    if (birthYear.trim()) {
      const num = Number.parseInt(birthYear.trim(), 10)
      if (Number.isNaN(num) || num < 1900 || num > currentYear) {
        addToast(`Năm sinh không hợp lệ (phải từ 1900 đến ${currentYear})`, 'error')
        return
      }
      parsedBirthYear = num
    }

    const payload: ParishPersonInput = {
      linkedUserId: normalize(linkedUserId),
      holyName: normalize(holyName),
      fullName: trimmedFullName,
      birthYear: parsedBirthYear,
      biography: normalize(biography),
      serviceStatus,
      visibility,
    }

    let ok = false
    if (isEditing && person) {
      ok = await store.updatePerson(person.id, payload)
    } else {
      ok = await store.createPerson(payload)
    }

    if (ok) {
      addToast(
        isEditing
          ? `Đã cập nhật hồ sơ của ${trimmedFullName}`
          : `Đã thêm hồ sơ Huynh trưởng / GLV cho ${trimmedFullName}`,
        'success',
      )
      onSuccess?.()
      onClose()
    } else {
      addToast(useParishProfileStore.getState().error || 'Không thể lưu hồ sơ nhân sự', 'error')
    }
  }

  // Preset addition to biography
  const handleAddPreset = (text: string) => {
    setBiography(prev => {
      const trimmed = prev.trim()
      if (!trimmed) return text
      return `${trimmed}\n• ${text}`
    })
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={isEditing ? 'Cập Nhật Hồ Sơ Huynh Trưởng / GLV' : 'Thêm Hồ Sơ Huynh Trưởng / GLV Mới'}
      subtitle={
        isEditing
          ? `Mã hồ sơ: ${person?.id}`
          : 'Khởi tạo thông tin căn tính Kitô giáo, cấp bậc và liên kết tài khoản hệ thống'
      }
      icon={<UserRound className="w-5 h-5 text-parish-primary" />}
      maxWidth="760px"
      closeOnOverlay={!store.isSaving}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between w-full gap-2.5">
          <div className="text-xs text-text-muted">
            <span className="text-parish-danger font-bold">*</span> Trường thông tin bắt buộc
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={store.isSaving}
              className="min-h-10"
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              form="parish-person-form"
              loading={store.isSaving}
              loadingLabel="Đang lưu hồ sơ…"
              className="min-h-10 px-5"
            >
              {isEditing ? 'Lưu cập nhật' : 'Tạo hồ sơ nhân sự'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="parish-person-form" noValidate onSubmit={handleSubmit} className="space-y-5">
        {/* KHỐI 1: CĂN TÍNH KITÔ GIÁO & THÔNG TIN CÁ NHÂN */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-parish-primary" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
                1. Căn Tính Kitô Giáo &amp; Thông Tin Cá Nhân
              </h3>
            </div>
            <Badge tone="primary">Căn bản</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
            {/* Avatar & Huy hiệu nhận diện */}
            <div className="sm:col-span-3 flex flex-col items-center justify-center p-3 rounded-2xl bg-surface-sunken border border-surface-border text-center">
              <div
                className="w-16 h-16 rounded-2xl bg-parish-primary/15 text-parish-primary font-black text-2xl flex items-center justify-center border-2 border-parish-primary/30 shadow-sm"
                aria-hidden="true"
              >
                {avatarInitials}
              </div>
              <span className="text-xs font-bold text-text-main mt-2 block truncate max-w-[120px]">
                {holyName ? `${holyName} ` : ''}{fullName || 'Họ và tên'}
              </span>
              <span className="text-xs text-text-muted mt-0.5">
                {calculatedAge !== null ? `${calculatedAge} tuổi` : 'Chưa rõ tuổi'}
              </span>
            </div>

            {/* Form Fields */}
            <div className="sm:col-span-9 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Tên Thánh */}
                <div>
                  <label htmlFor="holyName-input" className="text-xs font-bold text-text-main block mb-1">
                    Tên Thánh (Bổn mạng)
                  </label>
                  <TextInput
                    id="holyName-input"
                    list={holyNameListId}
                    placeholder="VD: Giuse, Maria, Têrêsa..."
                    maxLength={100}
                    value={holyName}
                    onChange={e => setHolyName(e.target.value)}
                    disabled={store.isSaving}
                    autoComplete="off"
                  />
                  <datalist id={holyNameListId}>
                    {COMMON_HOLY_NAMES.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>

                {/* Họ và Tên */}
                <div>
                  <label htmlFor="fullName-input" className="text-xs font-bold text-text-main block mb-1">
                    Họ và tên <span className="text-parish-danger">*</span>
                  </label>
                  <TextInput
                    id="fullName-input"
                    required
                    placeholder="VD: Nguyễn Văn An"
                    maxLength={200}
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    disabled={store.isSaving}
                  />
                </div>
              </div>

              {/* Năm sinh & tính tuổi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="birthYear-input" className="text-xs font-bold text-text-main block mb-1">
                    Năm sinh
                  </label>
                  <TextInput
                    id="birthYear-input"
                    type="number"
                    min={1900}
                    max={currentYear}
                    placeholder={`1900 – ${currentYear}`}
                    value={birthYear}
                    onChange={e => setBirthYear(e.target.value)}
                    disabled={store.isSaving}
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <div className="p-2.5 rounded-xl bg-surface-sunken border border-surface-border text-xs text-text-muted flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-parish-primary shrink-0" />
                    <span>
                      {calculatedAge !== null
                        ? `Sinh năm ${birthYear} · Hiện khoảng ${calculatedAge} tuổi`
                        : 'Nhập năm sinh để hệ thống tự tính tuổi'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Surface>

        {/* KHỐI 2: LIÊN KẾT TÀI KHOẢN HỆ THỐNG */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-parish-primary" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
                2. Liên Kết Tài Khoản Hệ Thống (Staff Account)
              </h3>
            </div>
            {selectedAccount ? (
              <Badge tone="success">Đã liên kết</Badge>
            ) : (
              <Badge tone="neutral">Chưa liên kết</Badge>
            )}
          </div>

          <p className="text-xs text-text-muted m-0 leading-relaxed">
            Liên kết hồ sơ này với tài khoản đăng nhập để Huynh trưởng / GLV có thể nhận nhiệm vụ, điểm danh và truy cập các phân hệ điều hành của Xứ đoàn.
          </p>

          {/* Account card or trigger button */}
          <div className="space-y-2">
            {selectedAccount ? (
              <div className="p-3 rounded-xl bg-surface-sunken border border-surface-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-parish-success-bg text-parish-success flex items-center justify-center font-bold text-sm shrink-0 border border-parish-success/30">
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-text-main truncate">
                        {selectedAccount.holyName ? `${selectedAccount.holyName} ` : ''}
                        {selectedAccount.fullName}
                      </span>
                      <Badge tone="primary" className="text-xs">
                        {selectedAccount.role === 'admin'
                          ? 'Ban Quản trị'
                          : selectedAccount.role === 'chunhiem'
                            ? 'Chủ nhiệm'
                            : 'Phụ tá'}
                      </Badge>
                    </div>
                    <span className="text-xs text-text-muted block truncate mt-0.5">
                      Mã tài khoản: <code className="font-mono">{selectedAccount.id}</code>
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsAccountPickerOpen(true)}
                  disabled={store.isSaving}
                  className="shrink-0"
                >
                  Thay đổi
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-dashed border-surface-border bg-surface-sunken/60">
                <div className="flex items-center gap-2.5 text-xs text-text-muted">
                  <Info size={16} className="text-parish-primary shrink-0" />
                  <span>
                    Chưa liên kết tài khoản (Hồ sơ nhân vật tiền bối / lịch sử hoặc tài khoản chưa cấp).
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsAccountPickerOpen(true)}
                  disabled={store.isSaving}
                  className="shrink-0"
                >
                  Chọn tài khoản liên kết
                </Button>
              </div>
            )}

            {autoFilledNotice && (
              <p className="text-xs text-parish-success font-semibold m-0 flex items-center gap-1.5">
                <Check size={13} /> {autoFilledNotice}
              </p>
            )}
          </div>

          {/* Account Picker Area */}
          {isAccountPickerOpen && (
            <div className="p-3.5 rounded-xl border border-parish-primary/30 bg-surface-card space-y-3 mt-2 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-main uppercase tracking-wider">
                  Chọn tài khoản từ hệ thống
                </span>
                <button
                  type="button"
                  onClick={() => setIsAccountPickerOpen(false)}
                  className="text-xs text-text-muted hover:text-text-main cursor-pointer"
                >
                  Đóng lại
                </button>
              </div>

              {/* Search in accounts */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="search"
                  value={accountSearch}
                  onChange={e => setAccountSearch(e.target.value)}
                  placeholder="Tìm tài khoản theo tên, tên thánh hoặc vai trò..."
                  className="w-full h-9 pl-8 pr-3 text-xs bg-surface-sunken border border-surface-border rounded-lg text-text-main focus:outline-none focus:border-parish-primary"
                />
              </div>

              {/* Option: No account (Historic person) */}
              <button
                type="button"
                onClick={() => handleSelectAccount(null)}
                className={`w-full p-2.5 text-left text-xs rounded-lg border transition-colors flex items-center justify-between ${
                  !linkedUserId
                    ? 'border-parish-primary bg-parish-primary/10 text-parish-primary font-bold'
                    : 'border-surface-border bg-surface-app hover:bg-surface-sunken text-text-main'
                }`}
              >
                <div>
                  <span className="block font-bold">Không liên kết tài khoản</span>
                  <span className="text-text-muted text-xs">Dành cho nhân vật lịch sử, cựu huynh trưởng tiền bối.</span>
                </div>
                {!linkedUserId && <Check size={14} />}
              </button>

              {/* Accounts list */}
              <div className="max-h-48 overflow-y-auto divide-y divide-surface-border border border-surface-border rounded-lg bg-surface-app">
                {filteredAccounts.length === 0 ? (
                  <p className="p-3 text-xs text-text-muted text-center m-0">
                    Không tìm thấy tài khoản nào phù hợp với từ khóa.
                  </p>
                ) : (
                  filteredAccounts.map(acc => {
                    const isSelected = acc.id === linkedUserId
                    const alreadyLinkedPerson = linkedUserIdsMap.get(acc.id)
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => handleSelectAccount(acc)}
                        className={`w-full p-2.5 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-parish-primary/10 text-parish-primary font-bold'
                            : 'hover:bg-surface-sunken text-text-main'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold truncate">
                              {acc.holyName ? `${acc.holyName} ` : ''}{acc.fullName}
                            </span>
                            <span className="text-text-muted">({acc.role})</span>
                            {alreadyLinkedPerson && (
                              <span className="text-xs text-parish-warning font-semibold">
                                · Đã liên kết với {alreadyLinkedPerson.fullName}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-text-muted block truncate font-mono">
                            {acc.id}
                          </span>
                        </div>

                        {isSelected && <Check size={14} className="shrink-0 text-parish-primary" />}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </Surface>

        {/* KHỐI 3: TRẠNG THÁI PHỤC VỤ & BẢO MẬT */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-parish-primary" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
                3. Trạng Thái Phục Vụ &amp; Phạm Vi Hiển Thị
              </h3>
            </div>
            <Badge tone="primary">Quản lý</Badge>
          </div>

          {/* Trạng thái phục vụ (3 Lựa chọn trực quan) */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-text-main block">
              Trạng thái phục vụ hiện tại <span className="text-parish-danger">*</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(['ACTIVE', 'FORMER', 'DECEASED'] as const).map(statusKey => {
                const cfg = STATUS_CONFIG[statusKey]
                const IconComponent = cfg.icon
                const isSelected = serviceStatus === statusKey
                return (
                  <button
                    key={statusKey}
                    type="button"
                    onClick={() => setServiceStatus(statusKey)}
                    className={`p-3 rounded-xl border text-left transition-colors flex flex-col justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'border-parish-primary bg-parish-primary/10 shadow-sm ring-1 ring-parish-primary'
                        : 'border-surface-border bg-surface-sunken hover:bg-surface-hover text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5">
                        <IconComponent size={15} className={isSelected ? 'text-parish-primary' : 'text-text-muted'} />
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

          {/* Phạm vi xem (Visibility) */}
          <div className="pt-2 border-t border-surface-border">
            <label htmlFor="visibility-select" className="text-xs font-bold text-text-main block mb-1">
              Phạm vi xem hồ sơ
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                  visibility === 'STAFF'
                    ? 'border-parish-primary bg-parish-primary/10'
                    : 'border-surface-border bg-surface-sunken'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="STAFF"
                  checked={visibility === 'STAFF'}
                  onChange={() => setVisibility('STAFF')}
                  className="sr-only"
                />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-text-main block">
                    Nội bộ Xứ đoàn (Khuyên dùng)
                  </span>
                  <span className="text-xs text-text-muted block">
                    Các Huynh trưởng và GLV khác có thể xem thông tin phục vụ.
                  </span>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                  visibility === 'ADMIN'
                    ? 'border-parish-primary bg-parish-primary/10'
                    : 'border-surface-border bg-surface-sunken'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="ADMIN"
                  checked={visibility === 'ADMIN'}
                  onChange={() => setVisibility('ADMIN')}
                  className="sr-only"
                />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-text-main block">
                    Chỉ Ban Quản trị
                  </span>
                  <span className="text-xs text-text-muted block">
                    Chỉ Admin hoặc Ban Điều Hành cấp cao có quyền xem hồ sơ này.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </Surface>

        {/* KHỐI 4: TIỂU SỬ & QUÁ TRÌNH DẤN THÂN */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-3">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-parish-primary" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
                4. Tiểu Sử &amp; Quá Trình Dấn Thân
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              {biography.length}/5000 ký tự
            </span>
          </div>

          {/* Quick preset chips */}
          <div>
            <span className="text-xs font-semibold text-text-muted block mb-1.5">
              Gợi ý mẫu nhanh (nhấp để thêm vào tiểu sử):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {BIOGRAPHY_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddPreset(preset)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface-sunken hover:bg-surface-hover border border-surface-border text-text-secondary transition-colors cursor-pointer"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="biography-textarea" className="sr-only">
              Tiểu sử phục vụ
            </label>
            <TextArea
              id="biography-textarea"
              rows={4}
              maxLength={5000}
              placeholder="Ghi nhận quá trình phục vụ, các khóa sa mạc huấn luyện, châm ngôn sống hoặc thông tin liên lạc..."
              value={biography}
              onChange={e => setBiography(e.target.value)}
              disabled={store.isSaving}
            />
          </div>
        </Surface>

        {/* THẺ XEM TRƯỚC THỜI GIAN THỰC (LIVE PREVIEW) */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted block">
            Xem trước thẻ hồ sơ (Live Preview):
          </span>
          <Surface variant="card" className="p-3.5 border border-surface-border flex items-start gap-3 bg-surface-app/70">
            <div className="w-11 h-11 rounded-xl bg-parish-primary/15 text-parish-primary font-black text-base flex items-center justify-center shrink-0 border border-parish-primary/20">
              {avatarInitials}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={STATUS_CONFIG[serviceStatus].tone}>
                  {STATUS_CONFIG[serviceStatus].label}
                </Badge>
                {visibility === 'ADMIN' && <Badge tone="neutral">Chỉ Admin</Badge>}
                {birthYear && (
                  <span className="text-xs text-text-muted">
                    Sinh năm {birthYear} {calculatedAge !== null ? `(${calculatedAge} tuổi)` : ''}
                  </span>
                )}
                {selectedAccount && (
                  <span className="text-xs font-semibold text-parish-success">
                    ✓ Đã liên kết tài khoản
                  </span>
                )}
              </div>
              <h4 className="text-sm font-black text-text-main m-0">
                {holyName && <span className="text-parish-primary mr-1">{holyName}</span>}
                {fullName || 'Chưa nhập họ tên'}
              </h4>
              {biography && (
                <p className="text-xs text-text-secondary line-clamp-2 m-0 leading-relaxed whitespace-pre-line">
                  {biography}
                </p>
              )}
            </div>
          </Surface>
        </div>
      </form>
    </ModalShell>
  )
}
