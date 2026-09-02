import { useMemo } from 'react'
import { Building2, Pencil, Shield, Trash2, Users } from 'lucide-react'
import { Badge, Button, Surface } from '../common/ui'
import type {
  ParishOrganizationUnit,
  ParishPerson,
  ParishServiceTerm,
} from '../../types/parishProfile'

interface Props {
  units: ParishOrganizationUnit[]
  terms: ParishServiceTerm[]
  peopleById: Map<string, ParishPerson>
  unitsById: Map<string, ParishOrganizationUnit>
  canManage: boolean
  onEdit: (unit: ParishOrganizationUnit) => void
  onDelete: (unit: ParishOrganizationUnit) => void
  onEditTerm: (term: ParishServiceTerm) => void
  onDeleteTerm: (term: ParishServiceTerm) => void
}

const unitLabels: Record<ParishOrganizationUnit['unitType'], string> = {
  BOARD: 'Ban Trị Sự', COMMITTEE: 'Ban chuyên môn', BRANCH: 'Ngành', CHAPTER: 'Chi đoàn', OTHER: 'Khác',
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
}: Props) {
  const boardUnits = useMemo(() => units.filter(u => u.unitType === 'BOARD'), [units])
  const committeeUnits = useMemo(() => units.filter(u => u.unitType === 'COMMITTEE'), [units])
  const branchAndChapterUnits = useMemo(() => units.filter(u => u.unitType === 'BRANCH' || u.unitType === 'CHAPTER' || u.unitType === 'OTHER'), [units])

  const renderUnitCard = (unit: ParishOrganizationUnit) => {
    const unitTerms = terms.filter(t => t.unitId === unit.id)
    return (
      <Surface
        as="article"
        variant="card"
        key={unit.id}
        className="p-4 border border-surface-border space-y-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge tone="primary">{unitLabels[unit.unitType]}</Badge>
              {unit.parentId && (
                <span className="text-xs text-text-muted">
                  ↳ Trực thuộc {unitsById.get(unit.parentId)?.name}
                </span>
              )}
            </div>
            <h4 className="text-sm font-black text-text-main m-0 mt-1.5">
              {unit.name}
            </h4>
          </div>

          {canManage && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onEdit(unit)}
                aria-label={`Sửa ${unit.name}`}
              >
                <Pencil size={13} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-parish-danger"
                onClick={() => onDelete(unit)}
                aria-label={`Xóa ${unit.name}`}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          )}
        </div>

        {unit.description && (
          <p className="text-xs text-text-secondary m-0 line-clamp-2">
            {unit.description}
          </p>
        )}

        <div className="pt-2 border-t border-surface-border">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-1.5">
            Nhân sự phụ trách ({unitTerms.length})
          </span>

          {unitTerms.length === 0 ? (
            <p className="text-xs text-text-muted m-0 italic">Chưa có nhân sự giữ chức vụ.</p>
          ) : (
            <div className="space-y-1.5">
              {unitTerms.map(term => {
                const person = peopleById.get(term.personId)
                return (
                  <div
                    key={term.id}
                    className="p-2 rounded-lg bg-surface-sunken border border-surface-border flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-text-main block truncate">
                        {person?.holyName && <span className="text-parish-primary mr-1">{person.holyName}</span>}
                        {person?.fullName || 'Không xác định'}
                      </span>
                      <span className="text-xs text-text-muted block truncate">
                        {term.positionTitle} {term.rankTitle ? `· ${term.rankTitle}` : ''}
                      </span>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => onEditTerm(term)}
                          aria-label={`Sửa ${term.positionTitle}`}
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-parish-danger"
                          onClick={() => onDeleteTerm(term)}
                          aria-label={`Xóa ${term.positionTitle}`}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Surface>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cấp 1: Ban Điều Hành & Ban Trị Sự */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-1.5 border-b border-surface-border">
          <Shield className="h-4 w-4 text-parish-primary" />
          <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
            Cấp 1 · Ban Điều Hành & Ban Trị Sự ({boardUnits.length})
          </h3>
        </div>

        {boardUnits.length === 0 ? (
          <p className="text-xs text-text-muted py-4 text-center m-0">
            Chưa thiết lập đơn vị Ban Trị Sự.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {boardUnits.map(renderUnitCard)}
          </div>
        )}
      </div>

      {/* Cấp 2: Các Ban Chuyên Môn */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-1.5 border-b border-surface-border">
          <Building2 className="h-4 w-4 text-parish-primary" />
          <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
            Cấp 2 · Các Ban Chuyên Môn ({committeeUnits.length})
          </h3>
        </div>

        {committeeUnits.length === 0 ? (
          <p className="text-xs text-text-muted py-4 text-center m-0">
            Chưa có ban chuyên môn nào.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {committeeUnits.map(renderUnitCard)}
          </div>
        )}
      </div>

      {/* Cấp 3: Các Ngành & Chi Đoàn */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-1.5 border-b border-surface-border">
          <Users className="h-4 w-4 text-parish-primary" />
          <h3 className="text-xs font-black uppercase tracking-wider text-text-main m-0">
            Cấp 3 · Các Ngành & Chi Đoàn ({branchAndChapterUnits.length})
          </h3>
        </div>

        {branchAndChapterUnits.length === 0 ? (
          <p className="text-xs text-text-muted py-4 text-center m-0">
            Chưa có ngành hoặc chi đoàn nào.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {branchAndChapterUnits.map(renderUnitCard)}
          </div>
        )}
      </div>
    </div>
  )
}
