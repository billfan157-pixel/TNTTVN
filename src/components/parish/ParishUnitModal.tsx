import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookmarkCheck,
  Boxes,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Crown,
  FileText,
  FolderTree,
  Info,
  Landmark,
  Layers,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Badge, Button, Select, Surface, TextArea, TextInput } from '../common/ui'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type {
  ParishOrganizationUnit,
  ParishProfileSnapshot,
  ParishUnitInput,
  ParishUnitType,
} from '../../types/parishProfile'

export interface ParishUnitModalProps {
  unit?: ParishOrganizationUnit
  initialParentId?: string
  snapshot: ParishProfileSnapshot
  onClose: () => void
  onSuccess?: () => void
}

interface UnitTypeDefinition {
  type: ParishUnitType
  label: string
  shortLabel: string
  levelLabel: string
  description: string
  badgeTone: 'primary' | 'teal' | 'violet' | 'orange' | 'neutral'
  icon: React.ComponentType<{ className?: string }>
  presets: Array<{ name: string; description: string }>
}

const UNIT_TYPE_DEFINITIONS: Record<ParishUnitType, UnitTypeDefinition> = {
  BOARD: {
    type: 'BOARD',
    label: 'Ban Điều Hành',
    shortLabel: 'BĐH',
    levelLabel: 'Cấp 1 — Toàn xứ',
    description: 'Cơ quan lãnh đạo cao nhất của Xứ đoàn, hoạch định đường hướng và điều hành chung',
    badgeTone: 'primary',
    icon: Landmark,
    presets: [
      {
        name: 'Ban Điều Hành Xứ Đoàn',
        description: 'Cơ quan điều hành cao nhất của Xứ đoàn, chịu trách nhiệm trước Cha Tuyên úy về mọi hoạt động tông đồ, nhân sự và tổ chức.',
      },
      {
        name: 'Ban Quản Trị Xứ Đoàn',
        description: 'Ban điều hành và quản trị các công tác hành chính, cơ sở vật chất và điều phối sinh hoạt chung của Xứ đoàn.',
      },
    ],
  },
  BRANCH: {
    type: 'BRANCH',
    label: 'Ngành (Khối lứa tuổi)',
    shortLabel: 'Ngành',
    levelLabel: 'Cấp 2 — Trực thuộc BĐH',
    description: 'Khối ngành lứa tuổi đoàn sinh (Chiên Con, Ấu, Thiếu, Nghĩa, Hiệp), đồng cấp với Ban chuyên môn',
    badgeTone: 'teal',
    icon: Users,
    presets: [
      {
        name: 'Ngành Ấu Nhi',
        description: 'Khối đoàn sinh lứa tuổi 7 - 9 tuổi (khăn quàng xanh lá). Châm ngôn: “Ngoan” — vâng lời, ngoan ngoãn, dễ dạy.',
      },
      {
        name: 'Ngành Thiếu Nhi',
        description: 'Khối đoàn sinh lứa tuổi 10 - 12 tuổi (khăn quàng xanh biển). Châm ngôn: “Hy sinh” — nhiệt thành tham dự Thánh lễ.',
      },
      {
        name: 'Ngành Nghĩa Sĩ',
        description: 'Khối đoàn sinh lứa tuổi 13 - 15 tuổi (khăn quàng vàng). Châm ngôn: “Chinh phục” — bình minh vào đời, làm tông đồ.',
      },
      {
        name: 'Ngành Hiệp Sĩ',
        description: 'Khối đoàn sinh lứa tuổi 16 - 18 tuổi (khăn quàng nâu). Châm ngôn: “Dấn thân” — nên muối men, ánh sáng giữa đời.',
      },
      {
        name: 'Ngành Chiên Con',
        description: 'Khối đoàn sinh mầm non 4 - 6 tuổi (khăn quàng hồng). Châm ngôn: “Hiền lành” — làm quen nhà thờ và việc đạo đức.',
      },
    ],
  },
  COMMITTEE: {
    type: 'COMMITTEE',
    label: 'Ban Chuyên Môn',
    shortLabel: 'Ban',
    levelLabel: 'Cấp 2 — Trực thuộc BĐH',
    description: 'Phụ trách các mảng nghiệp vụ chuyên sâu (Phụng vụ, Kỹ thuật, Trật tự...), đồng cấp với Khối Ngành',
    badgeTone: 'violet',
    icon: Briefcase,
    presets: [
      {
        name: 'Ban Phụng Vụ',
        description: 'Phụ trách thánh lễ, nghi thức phụng vụ, tập dâng lễ, đội kiệu, lễ sinh và đời sống thiêng liêng.',
      },
      {
        name: 'Ban Kỹ Thuật & Âm Thanh',
        description: 'Quản lý, vận hành hệ thống âm thanh, ánh sáng, máy chiếu và hỗ trợ kỹ thuật các buổi sinh hoạt, đại lễ.',
      },
      {
        name: 'Ban Trật Tự & Kỷ Luật',
        description: 'Phụ trách an ninh, trật tự trước và sau Thánh lễ, nề nếp sinh hoạt và bảo vệ khuôn viên sa mạc.',
      },
      {
        name: 'Ban Ẩm Thực',
        description: 'Chăm lo dinh dưỡng, bếp ăn, giải khát trong các dịp lễ bổn mạng, trại huấn luyện và sinh hoạt Xứ đoàn.',
      },
      {
        name: 'Ban Truyền Thông',
        description: 'Chụp ảnh tư liệu, quay phim, viết bài phóng sự, quản lý trang tin và thiết kế ấn phẩm truyền thông.',
      },
      {
        name: 'Ban Sinh Hoạt & Trò Chơi',
        description: 'Soạn thảo và điều phối các bài hát sinh hoạt, băng reo, cử điệu, trò chơi lớn và văn nghệ thiếu nhi.',
      },
      {
        name: 'Ban Học Tập & Giáo Lý',
        description: 'Hỗ trợ giáo trình giảng dạy giáo lý, khảo khóa, soạn đề thi và tổ chức các kỳ thi giáo lý cấp Xứ đoàn.',
      },
      {
        name: 'Ban Y Tế',
        description: 'Tủ thuốc sơ cấp cứu, chăm sóc y tế và hỗ trợ sức khỏe khẩn cấp trong các buổi sinh hoạt và cắm trại.',
      },
    ],
  },
  CHAPTER: {
    type: 'CHAPTER',
    label: 'Chi Đoàn',
    shortLabel: 'Chi đoàn',
    levelLabel: 'Cấp 3 — Trực thuộc Ngành',
    description: 'Đơn vị sinh hoạt cơ sở trực thuộc Ngành hoặc phân đoàn theo từng lứa tuổi cụ thể',
    badgeTone: 'orange',
    icon: BookmarkCheck,
    presets: [
      {
        name: 'Chi đoàn Ấu 1',
        description: 'Chi đoàn cơ sở thuộc Ngành Ấu Nhi, dành cho các em lớp Khai Tâm / Rước Lễ 1.',
      },
      {
        name: 'Chi đoàn Ấu 2',
        description: 'Chi đoàn cơ sở thuộc Ngành Ấu Nhi, dành cho các em lớp Rước Lễ 2.',
      },
      {
        name: 'Chi đoàn Thiếu 1',
        description: 'Chi đoàn cơ sở thuộc Ngành Thiếu Nhi, dành cho các em lớp Thêm Sức 1.',
      },
      {
        name: 'Chi đoàn Thiếu 2',
        description: 'Chi đoàn cơ sở thuộc Ngành Thiếu Nhi, dành cho các em lớp Thêm Sức 2.',
      },
      {
        name: 'Chi đoàn Nghĩa 1',
        description: 'Chi đoàn cơ sở thuộc Ngành Nghĩa Sĩ, dành cho các em lớp Bao Đồng 1.',
      },
      {
        name: 'Chi đoàn Nghĩa 2',
        description: 'Chi đoàn cơ sở thuộc Ngành Nghĩa Sĩ, dành cho các em lớp Bao Đồng 2.',
      },
    ],
  },
  OTHER: {
    type: 'OTHER',
    label: 'Đơn Vị Khác',
    shortLabel: 'Khác',
    levelLabel: 'Khối hỗ trợ & Dự án',
    description: 'Ban đại diện phụ huynh, ban cố vấn, ban dự án đặc biệt hoặc nhóm hỗ trợ lâm thời',
    badgeTone: 'neutral',
    icon: Boxes,
    presets: [
      {
        name: 'Ban Phụ Huynh',
        description: 'Hội đồng phụ huynh cộng tác, đồng hành và hỗ trợ Xứ đoàn trong các hoạt động lớn.',
      },
      {
        name: 'Ban Cố Vấn Tiền Bối',
        description: 'Các cựu huynh trưởng tiền bối đồng hành chia sẻ kinh nghiệm xây dựng và phát triển Xứ đoàn.',
      },
      {
        name: 'Ban Dự Án Cơ Sở Vật Chất',
        description: 'Tiểu ban phụ trách chỉnh trang phòng học giáo lý, kho dụng cụ và khuôn viên sinh hoạt.',
      },
    ],
  },
}

const UNIT_TYPES: ParishUnitType[] = ['BOARD', 'BRANCH', 'COMMITTEE', 'CHAPTER', 'OTHER']

const normalize = (val: string) => val.trim() || null

export function ParishUnitModal({
  unit,
  initialParentId,
  snapshot,
  onClose,
  onSuccess,
}: ParishUnitModalProps) {
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const isEditing = Boolean(unit?.id)

  // Form State
  const [unitType, setUnitType] = useState<ParishUnitType>(unit?.unitType ?? 'COMMITTEE')
  const [parentId, setParentId] = useState<string>(() => {
    if (unit?.parentId) return unit.parentId
    if (initialParentId) return initialParentId
    if (unit?.unitType === 'BOARD') return ''
    // Default to first active BOARD if creating a BRANCH or COMMITTEE
    const activeBoard = snapshot.units.find(u => u.unitType === 'BOARD' && u.isActive)
    return activeBoard?.id ?? ''
  })
  const [name, setName] = useState(unit?.name ?? '')
  const [sortOrder, setSortOrder] = useState(unit?.sortOrder?.toString() ?? '0')
  const [description, setDescription] = useState(unit?.description ?? '')
  const [isActive, setIsActive] = useState(unit?.isActive ?? true)

  const typeConfig = UNIT_TYPE_DEFINITIONS[unitType]

  // Descendants of current unit (to prevent cyclic hierarchy)
  const descendantIds = useMemo(() => {
    if (!unit?.id) return new Set<string>()
    const set = new Set<string>()
    const queue = [unit.id]
    while (queue.length > 0) {
      const curr = queue.shift()!
      for (const u of snapshot.units) {
        if (u.parentId === curr && !set.has(u.id)) {
          set.add(u.id)
          queue.push(u.id)
        }
      }
    }
    return set
  }, [snapshot.units, unit?.id])

  // Active Board detection in the parish
  const activeBoardInParish = useMemo(() => {
    return snapshot.units.find(u => u.unitType === 'BOARD' && u.isActive)
  }, [snapshot.units])

  // Conflict check: Active Board already exists in Parish
  const existingActiveBoardConflict = useMemo(() => {
    if (unitType !== 'BOARD' || !isActive) return null
    if (activeBoardInParish && activeBoardInParish.id !== unit?.id) {
      return activeBoardInParish
    }
    return null
  }, [unitType, isActive, activeBoardInParish, unit?.id])

  // Child units attached to this unit (relevant when editing)
  const childUnits = useMemo(() => {
    if (!unit?.id) return []
    return snapshot.units.filter(u => u.parentId === unit.id)
  }, [snapshot.units, unit?.id])

  // Child branches or committees directly under this unit
  const childBranchesOrCommittees = useMemo(() => {
    return childUnits.filter(u => u.unitType === 'BRANCH' || u.unitType === 'COMMITTEE')
  }, [childUnits])

  // Warning when changing BOARD with existing child units
  const boardHasChildrenRisk = useMemo(() => {
    if (!isEditing || unit?.unitType !== 'BOARD') return false
    if (childBranchesOrCommittees.length === 0) return false
    return unitType !== 'BOARD' || !isActive
  }, [isEditing, unit?.unitType, childBranchesOrCommittees.length, unitType, isActive])

  // Terms currently active in this unit
  const unitTerms = useMemo(() => {
    if (!unit?.id) return []
    return snapshot.terms.filter(t => t.unitId === unit.id)
  }, [snapshot.terms, unit?.id])

  // Eligible parent units based on selected unitType and cycle protection
  const eligibleParents = useMemo(() => {
    if (unitType === 'BOARD') return []

    return snapshot.units.filter(u => {
      // Cannot be self
      if (unit?.id && u.id === unit.id) return false
      // Cannot be any descendant
      if (descendantIds.has(u.id)) return false

      if (unitType === 'BRANCH' || unitType === 'COMMITTEE') {
        // Backend invariant: BRANCH and COMMITTEE MUST be under an active BOARD
        return u.unitType === 'BOARD' && u.isActive
      }

      if (unitType === 'CHAPTER') return u.unitType === 'BRANCH' && u.isActive
      // Other units retain their existing hierarchy policy.
      return true
    })
  }, [unitType, snapshot.units, unit?.id, descendantIds])

  // Handle switching unit type
  const handleUnitTypeChange = (newType: ParishUnitType) => {
    setUnitType(newType)

    if (newType === 'BOARD') {
      setParentId('')
      return
    }

    if (newType === 'CHAPTER') {
      const currentParent = snapshot.units.find(u => u.id === parentId)
      const branches = snapshot.units.filter(u => u.unitType === 'BRANCH' && u.isActive && u.id !== unit?.id && !descendantIds.has(u.id))
      setParentId(currentParent && branches.some(u => u.id === currentParent.id)
        ? currentParent.id : branches.length === 1 ? branches[0].id : '')
      return
    }

    if (newType === 'BRANCH' || newType === 'COMMITTEE') {
      // If current parent is not an active BOARD, auto-select the active BOARD
      const currentParent = snapshot.units.find(u => u.id === parentId)
      if (!currentParent || currentParent.unitType !== 'BOARD' || !currentParent.isActive) {
        const board = snapshot.units.find(u => u.unitType === 'BOARD' && u.isActive && u.id !== unit?.id)
        setParentId(board?.id ?? '')
      }
    }
  }

  // Handle applying a quick preset
  const handleApplyPreset = (preset: { name: string; description: string }) => {
    setName(preset.name)
    if (!description.trim()) {
      setDescription(preset.description)
    }
  }

  // Handle auto-calculating next sort order
  const handleCalculateNextSortOrder = () => {
    const siblings = snapshot.units.filter(u => u.parentId === (parentId || null) && u.id !== unit?.id)
    if (siblings.length === 0) {
      setSortOrder('0')
      return
    }
    const maxOrder = Math.max(...siblings.map(s => s.sortOrder), 0)
    setSortOrder(String(maxOrder + 1))
  }

  // Breadcrumb path for visual hierarchy preview
  const hierarchyBreadcrumbs = useMemo(() => {
    const path: Array<{ id: string; name: string; type: ParishUnitType }> = []
    let currId: string | null = parentId || null
    const visited = new Set<string>()

    while (currId && !visited.has(currId)) {
      visited.add(currId)
      const parent = snapshot.units.find(u => u.id === currId)
      if (!parent) break
      path.unshift({ id: parent.id, name: parent.name, type: parent.unitType })
      currId = parent.parentId
    }

    return path
  }, [parentId, snapshot.units])

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      addToast('Vui lòng nhập tên đơn vị', 'error')
      return
    }

    if (unitType === 'BOARD' && parentId) {
      addToast('Ban Điều Hành phải là cấp cao nhất, không được có đơn vị cấp trên', 'error')
      return
    }

    if ((unitType === 'BRANCH' || unitType === 'COMMITTEE') && !parentId) {
      addToast('Ngành và Ban chuyên môn bắt buộc phải trực thuộc một Ban Điều Hành đang hoạt động', 'error')
      return
    }

    if (existingActiveBoardConflict) {
      addToast(
        `Mỗi Xứ đoàn chỉ có một Ban Điều Hành đang hoạt động (hiện tại: ${existingActiveBoardConflict.name}). Vui lòng chọn trạng thái Lưu trữ hoặc cập nhật Ban Điều Hành hiện có.`,
        'error',
      )
      return
    }

    if (boardHasChildrenRisk) {
      addToast(
        `Không thể đổi loại hoặc ngừng hoạt động Ban Điều Hành khi vẫn còn ${childBranchesOrCommittees.length} Ngành / Ban chuyên môn trực thuộc`,
        'error',
      )
      return
    }

    const parsedSortOrder = Number.parseInt(sortOrder, 10)
    if (Number.isNaN(parsedSortOrder) || parsedSortOrder < 0 || parsedSortOrder > 10000) {
      addToast('Thứ tự sắp xếp phải là số nguyên từ 0 đến 10,000', 'error')
      return
    }

    const payload: ParishUnitInput = {
      parentId: normalize(parentId),
      name: trimmedName,
      unitType,
      description: normalize(description),
      sortOrder: parsedSortOrder,
      isActive,
    }

    let ok = false
    if (isEditing && unit) {
      ok = await store.updateUnit(unit.id, payload)
    } else {
      ok = await store.createUnit(payload)
    }

    if (ok) {
      addToast(
        isEditing
          ? `Đã cập nhật đơn vị: ${trimmedName}`
          : `Đã tạo đơn vị tổ chức mới: ${trimmedName}`,
        'success',
      )
      onSuccess?.()
      onClose()
    } else {
      addToast(useParishProfileStore.getState().error || 'Không thể lưu đơn vị tổ chức', 'error')
    }
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={isEditing ? 'Cập Nhật Đơn Vị Tổ Chức' : 'Thêm Đơn Vị Tổ Chức Mới'}
      subtitle={
        isEditing
          ? `Mã đơn vị: ${unit?.id} • Phân cấp: ${typeConfig.label}`
          : 'Thiết lập danh xưng, cấp bậc phân cấp và phạm vi hoạt động trong Xứ đoàn'
      }
      icon={<Building2 className="w-5 h-5 text-parish-primary" />}
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
              form="parish-unit-form"
              loading={store.isSaving}
              loadingLabel="Đang lưu đơn vị…"
              className="min-h-10 px-5"
            >
              {isEditing ? 'Lưu cập nhật' : 'Tạo đơn vị'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="parish-unit-form" noValidate onSubmit={handleSubmit} className="space-y-5">
        {/* KHỐI 1: PHÂN LOẠI & PHÂN CẤP TỔ CHỨC */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-parish-primary" />
              <h3 className="typography-card-title text-text-main m-0">
                1. Phân Loại & Cấu Trúc Tổ Chức
              </h3>
            </div>
            <span className="typography-caption text-text-muted">
              Bắt buộc
            </span>
          </div>

          {/* Type Selector Cards */}
          <div>
            <label className="form-label block mb-2">
              Loại đơn vị <span className="text-parish-danger">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {UNIT_TYPES.filter(type => isEditing || type === 'COMMITTEE' || type === 'OTHER').map(type => {
                const config = UNIT_TYPE_DEFINITIONS[type]
                const IconComponent = config.icon
                const isSelected = unitType === type

                return (
                  <button
                    key={type}
                    type="button"
                    aria-label={`Loại đơn vị: ${config.label}`}
                    onClick={() => handleUnitTypeChange(type)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-parish-primary bg-parish-primary-light/50 dark:bg-parish-primary/15 shadow-sm ring-2 ring-parish-primary/20'
                        : 'border-surface-border bg-surface-card hover:bg-surface-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-parish-primary text-text-inverse'
                              : 'bg-surface-sunken text-text-muted'
                          }`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <span className="typography-label text-text-main">
                          {config.label}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-parish-primary shrink-0" />
                      )}
                    </div>
                    <p className="typography-body-sm text-text-muted line-clamp-2 m-0 text-xs">
                      {config.description}
                    </p>
                    <div className="mt-2 pt-1.5 border-t border-surface-border/50 flex items-center justify-between">
                      <Badge tone={config.badgeTone} className="typography-caption py-0 px-1.5">
                        {config.levelLabel}
                      </Badge>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Parent Unit Selection */}
          <div className="pt-2">
            <label className="form-label block mb-1">
              Đơn vị cấp trên trực thuộc
              {(unitType === 'BRANCH' || unitType === 'COMMITTEE') && (
                <span className="text-parish-danger"> *</span>
              )}
            </label>

            {unitType === 'BOARD' ? (
              <div className="flex items-center gap-2.5 p-3 rounded-xl border border-surface-border bg-surface-sunken text-text-secondary">
                <Crown className="w-5 h-5 text-parish-primary shrink-0" />
                <div className="text-xs">
                  <p className="font-bold text-text-main m-0">Ban Điều Hành là cấp cao nhất</p>
                  <p className="text-text-muted m-0 mt-0.5">
                    Ban Điều Hành không có đơn vị cấp trên. Mọi Ngành và Ban chuyên môn sẽ trực thuộc Ban Điều Hành này.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Select
                  value={parentId}
                  onChange={e => setParentId(e.target.value)}
                  required={unitType === 'BRANCH' || unitType === 'COMMITTEE' || unitType === 'CHAPTER'}
                  aria-label="Chọn đơn vị cấp trên"
                >
                  <option value="">
                    {unitType === 'BRANCH' || unitType === 'COMMITTEE'
                      ? '--- Chọn Ban Điều Hành cấp trên (bắt buộc) ---'
                      : unitType === 'CHAPTER' ? '--- Chọn Ngành cấp trên (bắt buộc) ---' : '--- Không có (Đơn vị cấp cao) ---'}
                  </option>
                  {eligibleParents.map(parent => (
                    <option key={parent.id} value={parent.id}>
                      {parent.name} [{UNIT_TYPE_DEFINITIONS[parent.unitType]?.shortLabel || parent.unitType}]
                      {!parent.isActive ? ' (Lưu trữ)' : ''}
                    </option>
                  ))}
                </Select>

                {/* Parent validation hints */}
                {(unitType === 'BRANCH' || unitType === 'COMMITTEE') && (
                  <p className="text-xs text-text-muted m-0 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-parish-primary shrink-0" />
                    <span>
                      Quy chuẩn TNTT: Ngành và Ban chuyên môn bắt buộc phải trực thuộc một <strong>Ban Điều Hành đang hoạt động</strong>.
                    </span>
                  </p>
                )}

                {eligibleParents.length === 0 && (unitType === 'BRANCH' || unitType === 'COMMITTEE') && (
                  <div className="p-3 rounded-xl border border-parish-warning/40 bg-parish-warning-bg text-text-main flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-parish-warning shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-bold m-0">Xứ đoàn chưa có Ban Điều Hành đang hoạt động</p>
                      <p className="m-0 mt-0.5 text-text-muted">
                        Vui lòng tạo một <strong>Ban Điều Hành</strong> trước khi khởi tạo Ngành hoặc Ban chuyên môn.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Breadcrumbs Preview */}
          <div className="p-2.5 rounded-lg bg-surface-sunken border border-surface-border text-xs flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-text-muted shrink-0 flex items-center gap-1">
              <FolderTree className="w-3.5 h-3.5 text-parish-primary" />
              Sơ đồ phân cấp:
            </span>
            <span className="text-text-muted">Giáo xứ</span>
            <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />

            {hierarchyBreadcrumbs.map(crumb => (
              <span key={crumb.id} className="flex items-center gap-1.5">
                <span className="font-semibold text-text-main">{crumb.name}</span>
                <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
              </span>
            ))}

            <Badge tone={typeConfig.badgeTone} className="font-bold">
              {name.trim() || `(Đang tạo ${typeConfig.shortLabel})`}
            </Badge>
          </div>
        </Surface>

        {/* KHỐI 2: THÔNG TIN ĐỊNH DANH & GỢI Ý NHANH */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-parish-primary" />
              <h3 className="typography-card-title text-text-main m-0">
                2. Thông Tin Định Danh & Tên Gọi
              </h3>
            </div>
            <span className="typography-caption text-text-muted">
              Định danh
            </span>
          </div>

          {/* Presets Chips */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="typography-caption text-text-muted flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-parish-secondary" />
                Gợi ý danh xưng chuẩn TNTT:
              </span>
              <span className="typography-caption text-text-muted">Bấm để điền nhanh</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {typeConfig.presets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="btn btn-secondary btn-sm rounded-full text-xs min-h-8 py-1 px-3 text-text-secondary hover:text-text-main hover:border-parish-primary/50 transition-colors"
                >
                  + {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Unit Name & Sort Order */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="form-label block mb-1">
                Tên đơn vị <span className="text-parish-danger">*</span>
              </label>
              <TextInput
                required
                maxLength={200}
                placeholder="Ví dụ: Ngành Thiếu Nhi, Ban Phụng Vụ..."
                value={name}
                onChange={e => setName(e.target.value)}
                aria-label="Tên đơn vị"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="form-label block m-0">
                  Thứ tự sắp xếp
                </label>
                <button
                  type="button"
                  onClick={handleCalculateNextSortOrder}
                  className="typography-caption text-parish-primary font-semibold hover:underline"
                  title="Tự động tính thứ tự kế tiếp sau các đơn vị đồng cấp"
                >
                  +1 Kế tiếp
                </button>
              </div>
              <TextInput
                type="number"
                min={0}
                max={10000}
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value)}
                aria-label="Thứ tự sắp xếp"
              />
              <span className="typography-caption text-text-muted mt-0.5 block">
                Số nhỏ hơn xếp trước
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="form-label block m-0">
                Mô tả chức năng & phạm vi nhiệm vụ
              </label>
              <span className="typography-caption text-text-muted">
                {description.length} / 3000 ký tự
              </span>
            </div>
            <TextArea
              rows={4}
              maxLength={3000}
              placeholder="Ghi chú phạm vi sứ vụ, các sự kiện phụ trách hoặc phân công chi tiết của đơn vị..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              aria-label="Mô tả chức năng đơn vị"
            />
          </div>
        </Surface>

        {/* KHỐI 3: TRẠNG THÁI HOẠT ĐỘNG & CẢNH BÁO AN TOÀN */}
        <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-parish-primary" />
              <h3 className="typography-card-title text-text-main m-0">
                3. Trạng Thái Hoạt Động
              </h3>
            </div>
            <Badge tone={isActive ? 'success' : 'neutral'}>
              {isActive ? 'Đang hoạt động' : 'Tạm ngưng / Lưu trữ'}
            </Badge>
          </div>

          {/* Activity State Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                isActive
                  ? 'border-parish-success bg-parish-success-bg/40 dark:bg-parish-success/15 ring-2 ring-parish-success/20'
                  : 'border-surface-border bg-surface-card hover:bg-surface-hover'
              }`}
            >
              <input
                type="radio"
                name="unit-status"
                checked={isActive}
                onChange={() => setIsActive(true)}
                className="mt-1"
              />
              <div>
                <span className="typography-label text-text-main block">
                  Đang hoạt động (Active)
                </span>
                <span className="typography-body-sm text-text-muted block text-xs mt-0.5">
                  Đơn vị đang vận hành chính thức, hiển thị trên sơ đồ tổ chức và cho phép bổ nhiệm nhiệm kỳ nhân sự.
                </span>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                !isActive
                  ? 'border-surface-border bg-surface-sunken ring-2 ring-surface-border/50'
                  : 'border-surface-border bg-surface-card hover:bg-surface-hover'
              }`}
            >
              <input
                type="radio"
                name="unit-status"
                checked={!isActive}
                onChange={() => setIsActive(false)}
                className="mt-1"
              />
              <div>
                <span className="typography-label text-text-main block">
                  Ngừng hoạt động / Lưu trữ (Inactive)
                </span>
                <span className="typography-body-sm text-text-muted block text-xs mt-0.5">
                  Đơn vị tiền nhiệm hoặc tạm thời sáp nhập/giải thể. Dữ liệu lịch sử và các nhiệm kỳ cũ vẫn được bảo lưu.
                </span>
              </div>
            </label>
          </div>

          {/* Conflict Alert: Active Board already exists */}
          {existingActiveBoardConflict && (
            <div className="p-3.5 rounded-xl border border-parish-warning/40 bg-parish-warning-bg text-text-main flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-parish-warning shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold m-0 text-text-main">
                  Xứ đoàn đã có Ban Điều Hành đang hoạt động
                </p>
                <p className="m-0 text-text-secondary leading-relaxed">
                  Đơn vị <strong>“{existingActiveBoardConflict.name}”</strong> đang là Ban Điều Hành hiện hành. Quy định của hệ thống chỉ cho phép <strong>duy nhất 1 Ban Điều Hành hoạt động</strong> tại một thời điểm.
                </p>
                <p className="m-0 text-text-muted">
                  Nếu bạn đang tạo Ban Điều Hành nhiệm kỳ mới hoặc lưu trữ Ban Điều Hành tiền nhiệm, vui lòng chọn trạng thái <strong>“Ngừng hoạt động / Lưu trữ”</strong> trước khi lưu.
                </p>
              </div>
            </div>
          )}

          {/* Risk Alert: Board has child branches or committees */}
          {boardHasChildrenRisk && (
            <div className="p-3.5 rounded-xl border border-parish-danger/40 bg-parish-danger-bg text-text-main flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-parish-danger shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold m-0 text-text-main">
                  Không thể thay đổi loại hoặc ngưng hoạt động Ban Điều Hành
                </p>
                <p className="m-0 text-text-secondary leading-relaxed">
                  Ban Điều Hành này hiện đang có <strong>{childBranchesOrCommittees.length} Ngành / Ban chuyên môn trực thuộc</strong>.
                </p>
                <p className="m-0 text-text-muted">
                  Hệ thống yêu cầu bạn phải di dời hoặc tái phân bổ các đơn vị con sang Ban Điều Hành khác trước khi thay đổi loại đơn vị hoặc chuyển sang lưu trữ.
                </p>
              </div>
            </div>
          )}
        </Surface>

        {/* KHỐI 4: NGỮ CẢNH NHÂN SỰ & ĐƠN VỊ CON (CHỈ HIỂN THỊ KHI CHỈNH SỬA) */}
        {isEditing && (
          <Surface variant="card" className="p-4 sm:p-5 border border-surface-border space-y-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-parish-primary" />
                <h3 className="typography-card-title text-text-main m-0">
                  4. Nhân Sự & Đơn Vị Liên Kết Hiện Tại
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="primary">
                  {unitTerms.length} nhiệm kỳ
                </Badge>
                {childUnits.length > 0 && (
                  <Badge tone="teal">
                    {childUnits.length} đơn vị con
                  </Badge>
                )}
              </div>
            </div>

            {/* Child Units Summary */}
            {childUnits.length > 0 && (
              <div>
                <span className="typography-label text-text-muted block text-xs mb-2">
                  Đơn vị trực thuộc ({childUnits.length}):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {childUnits.map(child => (
                    <div
                      key={child.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-surface-sunken border border-surface-border text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Badge tone={UNIT_TYPE_DEFINITIONS[child.unitType]?.badgeTone ?? 'neutral'} className="text-xs py-0 px-1.5">
                          {UNIT_TYPE_DEFINITIONS[child.unitType]?.shortLabel ?? child.unitType}
                        </Badge>
                        <span className="font-semibold text-text-main truncate">{child.name}</span>
                      </div>
                      <span className="text-xs text-text-muted shrink-0">
                        {child.isActive ? 'Đang hoạt động' : 'Lưu trữ'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Terms Summary */}
            <div>
              <span className="typography-label text-text-muted block text-xs mb-2">
                Nhân sự đang giữ chức vụ trong đơn vị ({unitTerms.length}):
              </span>
              {unitTerms.length === 0 ? (
                <p className="typography-body-sm text-text-muted text-xs m-0 italic">
                  Chưa có nhân sự nào được bổ nhiệm nhiệm kỳ trong đơn vị này.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {unitTerms.map(term => {
                    const person = snapshot.people.find(p => p.id === term.personId)
                    return (
                      <div
                        key={term.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-surface-sunken border border-surface-border text-xs"
                      >
                        <div>
                          <span className="font-bold text-text-main">
                            {person?.holyName ? `${person.holyName} ` : ''}{person?.fullName || 'Nhân sự'}
                          </span>
                          <span className="text-text-muted ml-2">
                            • {term.positionTitle}
                            {term.rankTitle ? ` (${term.rankTitle})` : ''}
                          </span>
                        </div>
                        <span className="text-xs text-text-muted shrink-0">
                          {term.startDate} → {term.endDate || 'Hiện tại'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Surface>
        )}
      </form>
    </ModalShell>
  )
}
