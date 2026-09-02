import { Award, Clock, Pencil, UserRound } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Button, Badge, Surface } from '../common/ui'
import type {
  ParishOrganizationUnit,
  ParishPerson,
  ParishRecord,
  ParishServiceTerm,
} from '../../types/parishProfile'

interface Props {
  person: ParishPerson
  terms: ParishServiceTerm[]
  records: ParishRecord[]
  unitsById: Map<string, ParishOrganizationUnit>
  onClose: () => void
  onEdit?: () => void
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

export function ParishPersonDetailModal({ person, terms, records, unitsById, onClose, onEdit }: Props) {
  const relatedRecords = records.filter(r => r.personIds.includes(person.id))

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Hồ Sơ Huynh Trưởng / GLV"
      icon={<UserRound className="w-5 h-5 text-parish-primary" />}
      maxWidth="720px"
      footer={(
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-text-muted">
            Mã định danh: <code className="text-text-main font-mono">{person.id}</code>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Đóng
            </Button>
            {onEdit && (
              <Button size="sm" leadingIcon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
                Chỉnh sửa
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        {/* Phần đầu: Thông tin định danh & Căn tính */}
        <Surface variant="card" className="p-4 sm:p-5 flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-parish-primary/10 text-parish-primary flex items-center justify-center font-black text-xl shrink-0 border border-parish-primary/20">
            {person.holyName ? person.holyName.slice(0, 2) : person.fullName.slice(0, 2)}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={person.serviceStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                {person.serviceStatus === 'ACTIVE' ? 'Đang phục vụ' : person.serviceStatus === 'FORMER' ? 'Đã mãn nhiệm' : 'Đã qua đời'}
              </Badge>
              {person.visibility === 'ADMIN' && (
                <Badge tone="neutral">Chỉ Admin</Badge>
              )}
              {person.birthYear && (
                <span className="text-xs text-text-muted">
                  Sinh năm {person.birthYear}
                </span>
              )}
            </div>

            <h2 className="text-xl font-black text-text-main m-0">
              {person.holyName && (
                <span className="text-parish-primary mr-1.5">{person.holyName}</span>
              )}
              {person.fullName}
            </h2>

            {person.linkedUserId && (
              <p className="text-xs text-parish-success font-semibold m-0">
                ✓ Đã liên kết tài khoản hệ thống Catevia
              </p>
            )}
          </div>
        </Surface>

        {/* Tiểu sử phục vụ */}
        {person.biography && (
          <div className="space-y-1.5 p-4 rounded-xl bg-surface-app border border-surface-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted m-0">
              Tiểu sử & Ghi nhận
            </h3>
            <p className="text-xs sm:text-sm text-text-secondary whitespace-pre-wrap m-0 leading-relaxed">
              {person.biography}
            </p>
          </div>
        )}

        {/* Quá trình phục vụ & Nhiệm kỳ */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted m-0 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-parish-primary" />
            Quá trình đảm nhiệm chức vụ ({terms.length})
          </h3>

          {terms.length === 0 ? (
            <p className="text-xs text-text-muted py-3 px-4 rounded-xl bg-surface-app border border-surface-border m-0">
              Chưa có nhiệm kỳ nào được ghi nhận.
            </p>
          ) : (
            <div className="space-y-2">
              {terms.map(term => {
                const unit = term.unitId ? unitsById.get(term.unitId) : null
                return (
                  <div
                    key={term.id}
                    className="p-3 rounded-xl bg-surface-sunken border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-text-main">
                          {term.positionTitle}
                        </span>
                        {term.rankTitle && (
                          <Badge tone="neutral" className="text-xs">
                            {term.rankTitle}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-text-muted block mt-0.5">
                        {unit ? unit.name : 'Toàn Xứ đoàn'}
                      </span>
                    </div>

                    <div className="text-xs text-text-muted shrink-0 text-left sm:text-right">
                      <span>{formatDate(term.startDate)}</span> – <span>{term.endDate ? formatDate(term.endDate) : 'nay'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Các hoạt động & sự kiện đã tham gia */}
        {relatedRecords.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-surface-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted m-0 flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5 text-parish-primary" />
              Sự kiện & Hoạt động liên quan ({relatedRecords.length})
            </h3>

            <div className="space-y-2">
              {relatedRecords.map(rec => (
                <div
                  key={rec.id}
                  className="p-3 rounded-xl bg-surface-app border border-surface-border flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-text-main block truncate">
                      {rec.title}
                    </span>
                    {rec.summary && (
                      <span className="text-xs text-text-muted block truncate mt-0.5">
                        {rec.summary}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-text-muted shrink-0">
                    {formatDate(rec.occurredOn)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
