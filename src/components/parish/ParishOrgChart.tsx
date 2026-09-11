import { useId, useMemo, useState } from 'react'
import {
  Building2,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderTree,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Badge, type BadgeTone, Button, Surface } from '../common/ui'
import { EmptyState, NoResultState } from '../common/StateFeedback'
import { hasCoordinationRole, isTermActiveOn, sortTermsByAuthority } from '../../utils/parishTerms'
import type {
  ParishOrganizationUnit,
  ParishPerson,
  ParishServiceTerm,
} from '../../types/parishProfile'

export interface ParishOrgChartProps {
  units: ParishOrganizationUnit[]
  terms: ParishServiceTerm[]
  peopleById: Map<string, ParishPerson>
  unitsById: Map<string, ParishOrganizationUnit>
  canManage: boolean
  onEdit: (unit: ParishOrganizationUnit) => void
  onDelete: (unit: ParishOrganizationUnit) => void
  onEditTerm: (term: ParishServiceTerm) => void
  onDeleteTerm: (term: ParishServiceTerm) => void
  onSelectPerson?: (person: ParishPerson) => void
  onAddSubUnit?: (parentId: string) => void
  onAddTerm?: (unitId: string) => void
}

const unitLabels: Record<ParishOrganizationUnit['unitType'], string> = {
  BOARD: 'Ban Điều Hành',
  COMMITTEE: 'Ban chuyên môn',
  BRANCH: 'Ngành',
  CHAPTER: 'Chi đoàn',
  OTHER: 'Khác',
}

const unitBadgeTones: Record<ParishOrganizationUnit['unitType'], BadgeTone> = {
  BOARD: 'primary',
  COMMITTEE: 'violet',
  BRANCH: 'teal',
  CHAPTER: 'info',
  OTHER: 'neutral',
}

function getBranchAccent(name: string): string | null {
  const n = name.toLowerCase()
  if (n.includes('chiên')) return 'border-t-[var(--color-branch-chiencon)]'
  if (n.includes('ấu')) return 'border-t-[var(--color-branch-aunhi)]'
  if (n.includes('thiếu')) return 'border-t-[var(--color-branch-thieunhi)]'
  if (n.includes('nghĩa')) return 'border-t-[var(--color-branch-nghiasi)]'
  if (n.includes('hiệp')) return 'border-t-[var(--color-branch-hiepsi)]'
  return null
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'nay'
  const dateStr = value.slice(0, 10)
  const parts = dateStr.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return dateStr
}

export function ParishOrgChart({
  units,
  terms,
  peopleById,
  unitsById,
  canManage,
  onEdit,
  onDelete,
  onEditTerm,
  onDeleteTerm,
  onSelectPerson,
  onAddSubUnit,
  onAddTerm,
}: ParishOrgChartProps) {
  const searchInputId = useId()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [collapsedUnitIds, setCollapsedUnitIds] = useState<Set<string>>(() => new Set())

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Lọc nhiệm kỳ theo trạng thái đương nhiệm
  const filteredTerms = useMemo(() => {
    if (!activeOnly) return terms
    return terms.filter(t => isTermActiveOn(t, today))
  }, [terms, activeOnly, today])

  // Lập bản đồ terms theo unitId
  const termsByUnitId = useMemo(() => {
    const map = new Map<string, ParishServiceTerm[]>()
    for (const term of filteredTerms) {
      if (!term.unitId) continue
      const list = map.get(term.unitId) || []
      list.push(term)
      map.set(term.unitId, list)
    }
    return map
  }, [filteredTerms])

  // Lập bản đồ các đơn vị con theo parentId
  const childrenByParentId = useMemo(() => {
    const map = new Map<string, ParishOrganizationUnit[]>()
    for (const u of units) {
      if (u.parentId) {
        const list = map.get(u.parentId) || []
        list.push(u)
        map.set(u.parentId, list)
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi'))
    }
    return map
  }, [units])

  // Phân loại các đơn vị theo vai trò phân cấp
  const boardUnits = useMemo(() => units.filter(u => u.unitType === 'BOARD'), [units])
  const branchUnits = useMemo(() => units.filter(u => u.unitType === 'BRANCH'), [units])
  const committeeUnits = useMemo(() => units.filter(u => u.unitType === 'COMMITTEE'), [units])

  // Các đơn vị cấp 3 không có cha là Ngành hoặc Ban
  const unparentedChildUnits = useMemo(() => {
    const branchOrCommitteeIds = new Set([...branchUnits, ...committeeUnits].map(u => u.id))
    return units.filter(u => {
      if (u.unitType !== 'CHAPTER' && u.unitType !== 'OTHER') return false
      if (!u.parentId) return true
      return !branchOrCommitteeIds.has(u.parentId)
    })
  }, [units, branchUnits, committeeUnits])

  // Tìm kiếm theo từ khóa
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const matchingUnitIds = useMemo(() => {
    if (!normalizedQuery) return null
    const matched = new Set<string>()

    for (const u of units) {
      if (u.name.toLowerCase().includes(normalizedQuery) || (u.description && u.description.toLowerCase().includes(normalizedQuery))) {
        matched.add(u.id)
        if (u.parentId) matched.add(u.parentId)
      }

      const unitTerms = termsByUnitId.get(u.id) || []
      for (const t of unitTerms) {
        if (t.positionTitle.toLowerCase().includes(normalizedQuery) || (t.rankTitle && t.rankTitle.toLowerCase().includes(normalizedQuery))) {
          matched.add(u.id)
          if (u.parentId) matched.add(u.parentId)
        }
        const person = peopleById.get(t.personId)
        if (person) {
          if (person.fullName.toLowerCase().includes(normalizedQuery) || (person.holyName && person.holyName.toLowerCase().includes(normalizedQuery))) {
            matched.add(u.id)
            if (u.parentId) matched.add(u.parentId)
          }
        }
      }
    }
    return matched
  }, [normalizedQuery, units, termsByUnitId, peopleById])

  const isUnitVisible = (unitId: string) => {
    if (!matchingUnitIds) return true
    return matchingUnitIds.has(unitId)
  }

  const toggleCollapse = (unitId: string) => {
    setCollapsedUnitIds(prev => {
      const next = new Set(prev)
      if (next.has(unitId)) {
        next.delete(unitId)
      } else {
        next.add(unitId)
      }
      return next
    })
  }

  const allParentIds = useMemo(() => {
    const ids: string[] = []
    for (const u of units) {
      const rawChildren = childrenByParentId.get(u.id) || []
      const eligibleChildren = u.unitType === 'BOARD'
        ? rawChildren.filter(c => c.unitType !== 'BRANCH' && c.unitType !== 'COMMITTEE')
        : rawChildren
      if (eligibleChildren.length > 0) ids.push(u.id)
    }
    return ids
  }, [units, childrenByParentId])

  const areAllCollapsed = allParentIds.length > 0 && allParentIds.every(id => collapsedUnitIds.has(id))

  const toggleAllCollapse = () => {
    if (areAllCollapsed) {
      setCollapsedUnitIds(new Set())
    } else {
      setCollapsedUnitIds(new Set(allParentIds))
    }
  }

  // Render thẻ nhiệm kỳ nhân sự
  const renderPersonnelItem = (term: ParishServiceTerm) => {
    const person = peopleById.get(term.personId)
    const isInteractive = Boolean(onSelectPerson && person)

    return (
      <div
        key={term.id}
        className={`p-2.5 rounded-xl bg-surface-sunken border border-surface-border flex items-center justify-between gap-2.5 transition-colors ${
          isInteractive ? 'cursor-pointer hover:border-parish-primary/40 hover:bg-surface-hover' : ''
        }`}
        onClick={() => isInteractive && person && onSelectPerson?.(person)}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && isInteractive && person) {
            e.preventDefault()
            onSelectPerson?.(person)
          }
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-text-main block truncate">
              {person?.holyName && <span className="text-parish-primary mr-1">{person.holyName}</span>}
              {person?.fullName || 'Không xác định'}
            </span>
            {hasCoordinationRole(term) && <Badge tone="primary">Điều phối</Badge>}
          </div>

          <div className="mt-0.5 text-xs text-text-muted flex items-center gap-1.5 flex-wrap">
            <span className="truncate font-medium">
              {term.positionTitle}
              {term.rankTitle ? ` · ${term.rankTitle}` : ''}
            </span>
            <span className="text-text-muted">
              ({formatDate(term.startDate)} – {formatDate(term.endDate)})
            </span>
          </div>
        </div>

        {canManage && (
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7 p-1 text-text-muted hover:text-text-main"
              onClick={() => onEditTerm(term)}
              aria-label={`Sửa ${term.positionTitle}`}
              title="Sửa nhiệm kỳ"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7 p-1 text-parish-danger"
              onClick={() => onDeleteTerm(term)}
              aria-label={`Xóa ${term.positionTitle}`}
              title="Xóa nhiệm kỳ"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Render thẻ đơn vị tổ chức
  const renderUnitCard = (unit: ParishOrganizationUnit, isChildNode = false) => {
    const rawTerms = termsByUnitId.get(unit.id) || []
    const unitTerms = sortTermsByAuthority(rawTerms)
    const rawChildren = childrenByParentId.get(unit.id) || []
    const childUnits = unit.unitType === 'BOARD'
      ? rawChildren.filter(c => c.unitType !== 'BRANCH' && c.unitType !== 'COMMITTEE')
      : rawChildren
    const hasChildren = childUnits.length > 0
    const isCollapsed = collapsedUnitIds.has(unit.id) && !normalizedQuery
    const branchAccent = unit.unitType === 'BRANCH' ? getBranchAccent(unit.name) : null

    return (
      <div key={unit.id} className="space-y-2">
        <Surface
          as="article"
          variant="card"
          className={`p-4 border border-surface-border space-y-3 relative transition-shadow hover:shadow-card ${
            branchAccent ? `border-t-4 ${branchAccent}` : ''
          } ${isChildNode ? 'bg-surface-card' : ''}`}
        >
          {/* Header đơn vị */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge tone={unitBadgeTones[unit.unitType]}>{unitLabels[unit.unitType]}</Badge>
                {unit.parentId && (
                  <span className="text-xs text-text-muted">
                    ↳ Trực thuộc {unitsById.get(unit.parentId)?.name || 'cấp trên'}
                  </span>
                )}
                {hasChildren && (
                  <button
                    type="button"
                    onClick={() => toggleCollapse(unit.id)}
                    aria-expanded={!isCollapsed}
                    className="text-xs font-semibold text-parish-primary hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
                  >
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <span>{childUnits.length} trực thuộc</span>
                  </button>
                )}
              </div>
              <h4 className="text-sm font-extrabold text-text-main m-0 mt-1.5 truncate">
                {unit.name}
              </h4>
              {unit.sourceClassId && <p className="text-xs text-text-muted mt-1">Trưởng Chi đoàn: {unit.chapterLeaderName || 'Chưa phân công chủ nhiệm'}</p>}
            </div>

            {canManage && (
              <div className="flex items-center gap-0.5 shrink-0">
                {onAddTerm && !unit.sourceClassId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 p-1.5 text-parish-primary"
                    onClick={() => onAddTerm(unit.id)}
                    aria-label={`Thêm nhân sự cho ${unit.name}`}
                    title="Thêm nhân sự phụ trách"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
                {onAddSubUnit && (unit.unitType === 'BRANCH' || unit.unitType === 'COMMITTEE' || unit.unitType === 'BOARD') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 p-1.5 text-parish-primary"
                    onClick={() => onAddSubUnit(unit.id)}
                    aria-label={`Thêm đơn vị trực thuộc ${unit.name}`}
                    title="Thêm đơn vị trực thuộc"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 p-1.5"
                  onClick={() => onEdit(unit)}
                  disabled={unit.managedByAcademic}
                  aria-label={`Sửa ${unit.name}`}
                  title="Chỉnh sửa đơn vị"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 p-1.5 text-parish-danger"
                  onClick={() => onDelete(unit)}
                  disabled={unit.managedByAcademic || unit.unitType === 'BOARD'}
                  aria-label={`Xóa ${unit.name}`}
                  title="Xóa đơn vị"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>

          {unit.description && (
            <p className="text-xs text-text-secondary m-0 line-clamp-2">
              {unit.description}
            </p>
          )}

          {/* Danh sách nhân sự phụ trách */}
          <div className="pt-2.5 border-t border-surface-border">
            <div className="flex items-center justify-between gap-1 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                Nhân sự phụ trách ({unitTerms.length})
              </span>
            </div>

            {unitTerms.length === 0 ? (
              <p className="text-xs text-text-muted m-0 italic py-1">
                {activeOnly ? 'Không có nhân sự đang đương nhiệm.' : 'Chưa có nhân sự giữ chức vụ.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {unitTerms.map(renderPersonnelItem)}
              </div>
            )}
          </div>
        </Surface>

        {/* Cấp con trực thuộc (Nested Sub-Tree với đường nối cây) */}
        {hasChildren && !isCollapsed && (
          <div className="pl-4 sm:pl-6 border-l-2 border-surface-border ml-3 sm:ml-4 mt-2 space-y-2 relative">
            <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <FolderTree className="h-3.5 w-3.5 text-parish-primary" />
              <span>Đơn vị trực thuộc ({childUnits.length})</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-1">
              {childUnits.filter(child => isUnitVisible(child.id)).map(child => renderUnitCard(child, true))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Danh sách các đơn vị hiển thị sau khi lọc
  const visibleBoardUnits = boardUnits.filter(u => isUnitVisible(u.id))
  const visibleBranchUnits = branchUnits.filter(u => isUnitVisible(u.id))
  const visibleCommitteeUnits = committeeUnits.filter(u => isUnitVisible(u.id))
  const visibleUnparentedUnits = unparentedChildUnits.filter(u => isUnitVisible(u.id))

  const totalVisibleUnits =
    visibleBoardUnits.length + visibleBranchUnits.length + visibleCommitteeUnits.length + visibleUnparentedUnits.length

  return (
    <div className="space-y-6">
      {/* Thanh công cụ tìm kiếm, lọc & thống kê */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-surface-card border border-surface-border rounded-xl">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <input
              id={searchInputId}
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm đơn vị, huynh trưởng, chức vụ..."
              className="h-10 w-full pl-9 pr-8 text-xs bg-surface-sunken border border-surface-border rounded-xl text-text-main placeholder:text-text-placeholder focus:outline-none focus:border-parish-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-1"
                aria-label="Xóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Nút lọc nhiệm kỳ đương nhiệm */}
          <Button
            variant={activeOnly ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveOnly(prev => !prev)}
            leadingIcon={activeOnly ? <UserCheck className="h-4 w-4" /> : <CalendarRange className="h-4 w-4" />}
            className="text-xs"
          >
            {activeOnly ? 'Chỉ đương nhiệm' : 'Tất cả nhiệm kỳ'}
          </Button>

          {/* Nút thu gọn / mở rộng toàn bộ */}
          {allParentIds.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleAllCollapse}
              leadingIcon={areAllCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              className="text-xs"
            >
              {areAllCollapsed ? 'Mở rộng tất cả' : 'Thu gọn nhánh'}
            </Button>
          )}
        </div>
      </div>

      {/* Hiển thị khi không có kết quả tìm kiếm */}
      {normalizedQuery && totalVisibleUnits === 0 && (
        <NoResultState
          title="Không tìm thấy đơn vị hoặc nhân sự"
          description={`Không tìm thấy dữ liệu nào phù hợp với từ khóa "${searchQuery}".`}
          resetLabel="Xóa bộ lọc"
          onReset={() => setSearchQuery('')}
        />
      )}

      {/* Cấp 1: Ban Điều Hành */}
      {(!normalizedQuery || visibleBoardUnits.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-surface-border">
            <Shield className="h-4 w-4 text-parish-primary" />
            <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
              Cấp 1 · Ban Điều hành ({visibleBoardUnits.length})
            </h3>
          </div>

          {visibleBoardUnits.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="Chưa thiết lập Ban Điều Hành"
              description="Ban Điều Hành là đơn vị lãnh đạo cao nhất của Xứ đoàn."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleBoardUnits.map(unit => renderUnitCard(unit))}
            </div>
          )}
        </div>
      )}

      {/* Cấp 2: Ngành và Ban chuyên môn là hai nhánh song song. */}
      {(!normalizedQuery || visibleBranchUnits.length > 0 || visibleCommitteeUnits.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-surface-border">
            <Building2 className="h-4 w-4 text-parish-primary" />
            <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
              Cấp 2 · Ngành &amp; Ban chuyên môn — song song ({visibleBranchUnits.length + visibleCommitteeUnits.length})
            </h3>
          </div>

          <p className="m-0 text-xs text-text-muted">
            Trưởng ngành phụ trách công tác giáo lý; Trưởng ban phụ trách công tác chuyên môn Xứ đoàn. Hai chức vụ ngang cấp và một người có thể kiêm nhiệm bằng hai nhiệm kỳ riêng.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Nhánh 1: Các Ngành */}
            <section className="space-y-3" aria-label="Các Ngành">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-parish-primary" />
                <h4 className="m-0 text-sm font-extrabold text-text-main">
                  Các Ngành ({visibleBranchUnits.length})
                </h4>
              </div>
              {visibleBranchUnits.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Chưa có Ngành nào"
                  description="Các Ngành như Chiên Con, Ấu Nhi, Thiếu Nhi, Nghĩa Sĩ, Hiệp Sĩ."
                />
              ) : (
                <div className="grid gap-3">
                  {visibleBranchUnits.map(unit => renderUnitCard(unit))}
                </div>
              )}
            </section>

            {/* Nhánh 2: Các Ban chuyên môn */}
            <section className="space-y-3" aria-label="Các Ban chuyên môn">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-parish-primary" />
                <h4 className="m-0 text-sm font-extrabold text-text-main">
                  Các Ban chuyên môn ({visibleCommitteeUnits.length})
                </h4>
              </div>
              {visibleCommitteeUnits.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title="Chưa có Ban chuyên môn nào"
                  description="Các ban chuyên môn như Phụng vụ, Kỹ thuật, Truyền thông, Sinh hoạt."
                />
              ) : (
                <div className="grid gap-3">
                  {visibleCommitteeUnits.map(unit => renderUnitCard(unit))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Cấp 3: Chi đoàn hoặc đơn vị phụ trợ độc lập (nếu có) */}
      {visibleUnparentedUnits.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-surface-border">
            <Users className="h-4 w-4 text-parish-primary" />
            <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
              Cấp 3 · Đơn vị trực thuộc khác ({visibleUnparentedUnits.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleUnparentedUnits.map(unit => renderUnitCard(unit))}
          </div>
        </div>
      )}
    </div>
  )
}
