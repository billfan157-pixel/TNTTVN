import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useClassStore } from '../../stores/classStore'
import { useFilterStore } from '../../stores/filterStore'
import { BookOpen, Plus, Pencil, Trash2, School, Hash, Calendar, User, Users, Eye, ArrowDownAZ, ArrowDownZA, ArrowUpDown, Lock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { EmptyState, SkeletonTable } from '../common/StateFeedback'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ModalShell } from '../common/ModalShell'
import { DesktopAppShell } from './DesktopAppShell'
import { FormField } from '../common/FormField'
import { PageHeader } from '../common/PageHeader'
import { sortClassesByHierarchy } from '../../utils/classSort'
import { BRANCHES } from '../../constants/branches'

interface TeacherOption {
  id: string
  fullName: string
  username: string
}

type DesktopClassesLayout = 'responsive-table' | 'grid'

export function DesktopClasses({
  embedded = false,
  layout = 'responsive-table',
  onViewClassStudents,
  sortDirection: propSortDirection,
}: {
  embedded?: boolean
  layout?: DesktopClassesLayout
  onViewClassStudents?: (classId: string) => void
  sortDirection?: 'asc' | 'desc'
} = {}) {
  const navigate = useNavigate()
  const { classes, branches, academicYears, loading, fetchClasses, fetchBranches, fetchAcademicYears, createClass, updateClass, deleteClass } = useClassStore()
  const { role } = useAuth()
  const canEdit = role === 'admin'
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)

  const [internalSortDirection, setInternalSortDirection] = useState<'asc' | 'desc'>('asc')
  const sortDirection = propSortDirection ?? internalSortDirection
  const setSortDirection = setInternalSortDirection

  const sortedClasses = useMemo(() => {
    return sortClassesByHierarchy(classes, sortDirection)
  }, [classes, sortDirection])

  const viewClassStudents = (classId: string) => {
    if (onViewClassStudents) {
      onViewClassStudents(classId)
      return
    }
    setSelectedClassId(classId)
    navigate({ to: '/students' })
  }

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ code: '', name: '', branchId: '', academicYearId: '', room: '' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [homeroomTeacherId, setHomeroomTeacherId] = useState('')
  const [assistantTeacherId, setAssistantTeacherId] = useState('')

  useEffect(() => {
    fetchClasses()
    fetchBranches()
    fetchAcademicYears()
  }, [fetchClasses, fetchBranches, fetchAcademicYears])

  const openCreate = () => {
    setEditingId(null)
    setForm({ code: '', name: '', branchId: branches[0]?.id || '', academicYearId: academicYears[0]?.id || '', room: '' })
    setHomeroomTeacherId('')
    setAssistantTeacherId('')
    api.getAvailableTeachers().then(setTeachers).catch(() => setTeachers([]))
    setShowModal(true)
  }

  const openEdit = (c: typeof classes[0]) => {
    setEditingId(c.id)
    setFormError('')
    setForm({ code: c.code, name: c.name, branchId: c.branchId, academicYearId: c.academicYearId, room: c.room || '' })
    setHomeroomTeacherId(c.homeroomTeacher?.id || '')
    setAssistantTeacherId(c.assistants?.[0]?.id || '')
    api.getAvailableTeachers().then(setTeachers).catch(() => setTeachers([]))
    setShowModal(true)
  }

  const reconcileAssignments = async (classId: string) => {
    await api.replaceClassAssignments(classId, {
      homeroomTeacherId: homeroomTeacherId || null,
      assistantTeacherIds: assistantTeacherId && assistantTeacherId !== homeroomTeacherId ? [assistantTeacherId] : [],
    })
  }

  const handleSave = async () => {
    // PHA 3 (audit MED): báo lỗi thay vì return im lặng khi thiếu trường bắt buộc
    if (!form.code || !form.name || !form.branchId || !form.academicYearId) {
      setFormError('Vui lòng điền đầy đủ Mã Lớp, Tên Lớp, Phân Ngành và Niên Học.')
      return
    }
    setFormError('')
    setSaving(true)
    try {
      let savedId = ''
      if (editingId) {
        await updateClass(editingId, form)
        savedId = editingId
      } else {
        const created = await createClass(form)
        savedId = created.id
        // Nếu phân công thất bại sau khi class đã commit, lần thử lại phải update
        // đúng class vừa tạo thay vì tạo thêm một class mới.
        setEditingId(savedId)
      }
      await reconcileAssignments(savedId)
      await fetchClasses()
      useToastStore.getState().addToast(editingId ? 'Đã cập nhật lớp học thành công!' : 'Đã tạo lớp học mới thành công!', 'success')
      setShowModal(false)
    } catch {
      useToastStore.getState().addToast('Có lỗi xảy ra khi lưu lớp học. Vui lòng thử lại!', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteClass(id)
      useToastStore.getState().addToast('Đã xóa lớp học thành công!', 'success')
    } catch {
      useToastStore.getState().addToast('Có lỗi xảy ra khi xóa lớp học. Vui lòng thử lại!', 'error')
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  const getBranchName = (id: string) => branches.find(b => b.id === id)?.name || id
  const getAcademicYearLabel = (id: string) => {
    const ay = academicYears.find(a => a.id === id)
    return ay ? `${ay.startDate} - ${ay.endDate}` : id
  }

  const colCount = canEdit ? 9 : 8

  return (
    <DesktopAppShell width="wide" embedded={embedded} className={embedded ? '!gap-3 sm:!gap-3.5' : ''}>
      {!embedded && <PageHeader
        icon={<BookOpen size={20} />}
        title="Quản Lý Lớp Học"
        description="Quản lý danh sách các lớp giáo lý, phân công huynh trưởng và sĩ số học sinh"
        actions={
          <>
            {/* Nút Sắp Xếp Cấp Bậc Lớp */}
            <div className="flex items-center bg-surface-hover p-1 rounded-xl border border-surface-border shadow-inner gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setSortDirection('asc')}
                className={`min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                  sortDirection === 'asc'
                    ? 'bg-parish-primary text-white shadow-xs'
                    : 'text-text-secondary hover:bg-surface-card hover:text-text-main'
                }`}
                title="Sắp xếp lớp từ thấp đến cao (Chiên -> Ấu 1A -> Ấu 1B...)"
              >
                <ArrowDownAZ size={14} />
                <span>Lớp: Thấp → Cao</span>
              </button>
              <button
                type="button"
                onClick={() => setSortDirection('desc')}
                className={`min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                  sortDirection === 'desc'
                    ? 'bg-parish-primary text-white shadow-xs'
                    : 'text-text-secondary hover:bg-surface-card hover:text-text-main'
                }`}
                title="Sắp xếp lớp từ cao đến thấp (Hiệp 2 -> ... -> Chiên)"
              >
                <ArrowDownZA size={14} />
                <span>Lớp: Cao → Thấp</span>
              </button>
            </div>

            {canEdit && (
              academicYears.length === 0 ? (
                <button className="btn btn-primary btn-sm min-h-[40px] flex items-center gap-1.5" onClick={() => navigate({ to: '/academic-years' })}>
                  <Calendar size={16} /> Tạo Năm Học Trước
                </button>
              ) : (
                <button className="btn btn-primary btn-sm min-h-[40px] flex items-center gap-1.5" onClick={openCreate}>
                  <Plus size={16} /> Thêm Lớp
                </button>
              )
            )}
          </>
        }
      />}

      {embedded && <h2 className="sr-only">Lớp Học</h2>}

      {embedded && canEdit && layout !== 'grid' && (
        <div className="flex justify-end">
          {academicYears.length === 0 ? (
            <button
              className="btn btn-primary btn-sm min-h-[36px] flex items-center gap-1.5"
              onClick={() => navigate({ to: '/academic-years' })}
            >
              <Calendar size={14} /> Tạo Năm Học Trước
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm min-h-[36px] flex items-center gap-1.5"
              onClick={openCreate}
            >
              <Plus size={14} /> Thêm Lớp
            </button>
          )}
        </div>
      )}

      {academicYears.length === 0 && (
        <div className="bg-parish-warning-bg border border-parish-warning/30 rounded-2xl p-4 flex items-start gap-3 shadow-card">
          <Calendar size={20} className="text-parish-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-parish-warning-hover m-0">Chưa có năm học nào</p>
            <p className="text-sm text-parish-warning mt-0.5 m-0 font-medium">
              Hãy tạo năm học trước, sau đó mới tạo lớp học và nhập danh sách học sinh.
              {canEdit && (
                <button className="btn btn-link btn-sm px-1 font-bold text-parish-primary underline" onClick={() => navigate({ to: '/academic-years' })}>
                  Đi tới Quản Lý Năm Học →
                </button>
              )}
            </p>
          </div>
        </div>
      )}

      {layout === 'grid' ? (
        loading ? (
          <SkeletonTable rows={4} cols={2} />
        ) : sortedClasses.length === 0 ? (
          <EmptyState
            icon={School}
            title="Chưa có lớp học nào"
            description="Hãy tạo lớp học đầu tiên cho niên khóa hiện tại để bắt đầu xếp danh sách thiếu nhi."
            actionLabel={canEdit ? "Thêm lớp học" : undefined}
            onAction={canEdit ? openCreate : undefined}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {sortedClasses.map(c => {
              const branch = BRANCHES[c.branchId as keyof typeof BRANCHES]
              const scarfColor = branch?.scarfColor || 'var(--color-parish-primary)'
              const hasAssistants = c.assistants && c.assistants.length > 0

              return (
                <article
                  key={c.id}
                  className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-surface-border bg-surface-card transition-[border-color,box-shadow] duration-200 hover:border-parish-primary/40 hover:shadow-md"
                >
                  {/* Vạch màu khăn ngành TNTT tinh tế */}
                  <div
                    className="absolute inset-x-0 top-0 h-1 transition-opacity opacity-75 group-hover:opacity-100"
                    style={{
                      background: `linear-gradient(90deg, ${scarfColor} 0%, color-mix(in srgb, ${scarfColor} 50%, transparent) 70%, transparent 100%)`,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => viewClassStudents(c.id)}
                    aria-label={`Xem danh sách lớp ${c.name}`}
                    className="flex flex-1 flex-col justify-between gap-3 bg-transparent p-3 sm:p-4 text-left border-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-primary/50 active:scale-[0.99] rounded-t-2xl"
                  >
                    <div className="flex flex-col gap-2.5 w-full">
                      {/* Avatar ngành & Sĩ số */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black sm:h-10 sm:w-10 shadow-xs"
                          style={{
                            background: branch?.badgeBg || 'var(--color-parish-primary-light)',
                            color: branch?.textColor || 'var(--color-parish-primary)',
                            borderColor: `color-mix(in srgb, ${scarfColor} 25%, transparent)`,
                          }}
                        >
                          {c.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!canEdit && (
                            c.assignedToCurrentUser ? (
                              <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                Phụ trách
                              </span>
                            ) : (
                              <span className="rounded-md bg-surface-hover border border-surface-border px-1.5 py-0.5 text-xs font-medium text-text-muted flex items-center gap-0.5">
                                <Lock size={10} /> Chỉ xem
                              </span>
                            )
                          )}
                          <span className="rounded-full border border-surface-border bg-surface-hover px-2 py-1 text-xs font-black text-text-main tabular-nums transition-colors group-hover:border-parish-primary group-hover:bg-parish-primary group-hover:text-text-inverse sm:px-2.5">
                            {c.studentCount ?? 0} em
                          </span>
                        </div>
                      </div>

                      {/* Tên lớp & Thông tin */}
                      <div className="min-w-0">
                        <span className="block truncate text-sm sm:text-base font-extrabold leading-tight text-text-main group-hover:text-parish-primary transition-colors" title={c.name}>
                          {c.name}
                        </span>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: scarfColor }} />
                          <span className="truncate">{c.branchName || branch?.name || c.branchId}{c.room ? ` • ${c.room}` : ''}</span>
                        </div>
                        {c.homeroomTeacher ? (
                          <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-text-muted">
                            <Users aria-hidden="true" size={11} className="text-parish-primary shrink-0" />
                            <span className="truncate">{c.homeroomTeacher.fullName}</span>
                            {hasAssistants && (
                              <span className="shrink-0 text-xs font-medium text-text-placeholder" title={`Phụ tá: ${c.assistants.map(a => a.fullName).join(', ')}`}>
                                (+{c.assistants.length})
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-text-placeholder italic">
                            <Users aria-hidden="true" size={11} className="opacity-40 shrink-0" />
                            <span>Chưa phân công</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Nút Xem Danh Sách căn đều đáy */}
                    <div className="inline-flex items-center gap-1 text-xs font-bold text-parish-primary pt-1">
                      Xem danh sách <Eye aria-hidden="true" size={13} />
                    </div>
                  </button>

                  {canEdit && (
                    <div className="flex items-center justify-end gap-1 border-t border-surface-border px-2 py-1.5 bg-surface-app/30">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(c)
                        }}
                        className="btn btn-ghost btn-sm inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-main"
                        aria-label={`Sửa lớp ${c.name}`}
                        title="Sửa lớp"
                      >
                        <Pencil aria-hidden="true" size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDelete(c.id)
                        }}
                        className="btn btn-ghost btn-sm inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg p-2 text-parish-danger transition-colors hover:bg-parish-danger-bg"
                        aria-label={`Xóa lớp ${c.name}`}
                        title="Xóa lớp"
                      >
                        <Trash2 aria-hidden="true" size={14} />
                      </button>
                    </div>
                  )}
                </article>
              )
            })}

            {canEdit && (
              <button
                type="button"
                onClick={academicYears.length === 0 ? () => navigate({ to: '/academic-years' }) : openCreate}
                className="group flex min-h-[160px] flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-surface-border bg-surface-card/40 p-4 text-text-muted hover:border-parish-primary hover:bg-parish-primary-light/10 hover:text-parish-primary transition-colors duration-200 cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-hover text-text-muted group-hover:bg-parish-primary-light group-hover:text-parish-primary transition-colors shadow-xs">
                  {academicYears.length === 0 ? <Calendar size={20} /> : <Plus size={20} />}
                </div>
                <span className="text-sm font-bold">
                  {academicYears.length === 0 ? 'Tạo Năm Học Trước' : 'Thêm Lớp'}
                </span>
              </button>
            )}
          </div>
        )
      ) : (
      <>
      {/* Mobile Card List View (< md) */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <SkeletonTable rows={4} cols={2} />
        ) : sortedClasses.length === 0 ? (
          <EmptyState
            icon={School}
            title="Chưa có lớp học nào"
            description="Hãy tạo lớp học đầu tiên cho niên khóa hiện tại để bắt đầu xếp danh sách thiếu nhi."
            actionLabel={canEdit ? "Thêm lớp học" : undefined}
            onAction={canEdit ? openCreate : undefined}
          />
        ) : (
          sortedClasses.map((c) => {
            const branchName = c.branchName || getBranchName(c.branchId)
            return (
              <div
                key={c.id}
                className="entity-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-parish-primary-light text-parish-primary text-xs font-bold">
                        <Hash size={11} /> {c.code}
                      </span>
                      <span className="badge badge-neutral text-xs">
                        {branchName}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-base text-text-main leading-tight truncate">
                      {c.name}
                    </h3>
                  </div>
                  <span className="badge badge-primary font-bold text-xs shrink-0 tabular-nums">
                    {c.studentCount} thiếu nhi
                  </span>
                </div>

                <div className="bg-surface-hover/70 dark:bg-surface-card p-3 rounded-xl border border-surface-border text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-text-muted font-medium">Chủ nhiệm:</span>
                    <span className="font-semibold text-text-main truncate">
                      {c.homeroomTeacher?.fullName || '—'}
                    </span>
                  </div>
                  {c.assistants && c.assistants.length > 0 && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-text-muted font-medium shrink-0">Phụ tá:</span>
                      <span className="font-medium text-text-secondary text-right">
                        {c.assistants.map(a => a.fullName).join(', ')}
                      </span>
                    </div>
                  )}
                  {c.room && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-text-muted font-medium">Phòng học:</span>
                      <span className="font-medium text-text-main">{c.room}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-surface-border">
                  <button
                    type="button"
                    onClick={() => viewClassStudents(c.id)}
                    className="btn btn-secondary btn-sm flex-1 min-h-[44px] text-xs font-bold justify-center"
                  >
                    <Eye size={14} /> Xem Danh Sách
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="btn btn-secondary btn-sm min-h-[44px] min-w-[44px] px-3 justify-center"
                        title="Sửa lớp"
                        aria-label={`Sửa lớp ${c.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(c.id)}
                        className="btn btn-ghost btn-sm min-h-[44px] min-w-[44px] px-3 justify-center text-parish-danger hover:bg-parish-danger-bg"
                        title="Xóa lớp"
                        aria-label={`Xóa lớp ${c.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Desktop Table View (>= md) */}
      <div className="hidden md:block app-panel overflow-hidden">
        <div className="table-wrapper">
          <div className="table-scroll">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0 bg-surface-card text-text-main">
            <colgroup>
              <col className="w-[40px]" />
              <col className="w-[100px]" />
              <col className="w-auto min-w-0" />
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              {canEdit && <col className="w-[90px]" />}
            </colgroup>
            <thead>
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3" scope="col">STT</th>
                <th className="py-2.5 px-3" scope="col">Mã Lớp</th>
                <th className="py-2.5 px-3" scope="col">
                  <button
                    type="button"
                    onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center gap-1.5 hover:text-text-main transition-colors font-bold text-xs uppercase tracking-wider bg-transparent border-none cursor-pointer p-0 text-text-muted"
                  >
                    <span>Tên Lớp</span>
                    <ArrowUpDown size={13} className="text-parish-primary" />
                  </button>
                </th>
                <th className="py-2.5 px-3" scope="col">
                  <button
                    type="button"
                    onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center gap-1.5 hover:text-text-main transition-colors font-bold text-xs uppercase tracking-wider bg-transparent border-none cursor-pointer p-0 text-text-muted"
                  >
                    <span>Phân Ngành</span>
                    <ArrowUpDown size={13} className="text-parish-primary" />
                  </button>
                </th>
                <th className="py-2.5 px-3" scope="col">Chủ Nhiệm</th>
                <th className="py-2.5 px-3" scope="col">Trợ Tá</th>
                <th className="py-2.5 px-3 text-center" scope="col">Số HV</th>
                <th className="py-2.5 px-3" scope="col">Phòng</th>
                {canEdit && <th className="py-2.5 px-3 text-center" scope="col">Tác Vụ</th>}
              </tr>
            </thead>
            <tbody className="bg-surface-card">
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="p-4">
                    <SkeletonTable rows={4} cols={colCount} />
                  </td>
                </tr>
              ) : sortedClasses.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="p-8">
                    <EmptyState
                      icon={School}
                      title="Chưa có lớp học nào"
                      description="Hãy tạo lớp học đầu tiên cho niên khóa hiện tại để bắt đầu xếp danh sách thiếu nhi."
                      actionLabel={canEdit ? "Thêm lớp học" : undefined}
                      onAction={canEdit ? openCreate : undefined}
                    />
                  </td>
                </tr>
              ) : (
                sortedClasses.map((c, idx) => (
                  <tr key={c.id} className="border-b border-surface-hover bg-surface-card hover:bg-surface-app transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-text-muted">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-parish-primary-light text-parish-primary text-xs font-bold">
                        <Hash size={12} /> {c.code}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-parish-primary text-base">
                      <div className="inline-flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => viewClassStudents(c.id)}
                          aria-label={`Xem danh sách lớp ${c.name}`}
                          className="inline-flex items-center gap-1 bg-transparent p-0 font-semibold text-parish-primary hover:underline"
                        >
                          {c.name}
                          <Eye size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        {!canEdit && (
                          c.assignedToCurrentUser ? (
                            <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                              Phụ trách
                            </span>
                          ) : (
                            <span className="rounded bg-surface-hover border border-surface-border px-1 py-0.2 text-xs font-medium text-text-muted inline-flex items-center gap-0.5">
                              <Lock size={9} /> Chỉ xem
                            </span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-text-muted">{c.branchName || getBranchName(c.branchId)}</td>
                    <td className="py-2.5 px-3 text-text-muted">
                      {c.homeroomTeacher ? (
                        <span className="inline-flex items-center gap-1">
                          <User size={12} className="text-parish-primary" />
                          {c.homeroomTeacher.fullName}
                        </span>
                      ) : <span className="text-text-disabled">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-text-muted">
                      {c.assistants && c.assistants.length > 0 ? (
                        <span className="inline-flex flex-col gap-0.5">
                          {c.assistants.map(a => (
                            <span key={a.id} className="inline-flex items-center gap-1">
                              <Users size={12} className="text-text-muted" />
                              {a.fullName}
                            </span>
                          ))}
                        </span>
                      ) : <span className="text-text-disabled">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-parish-primary">{c.studentCount}</td>
                    <td className="py-2.5 px-3 text-text-muted">{c.room || '—'}</td>
                    {canEdit && (
                      <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button className="btn btn-ghost btn-sm p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center" onClick={() => openEdit(c)} title="Sửa" aria-label={`Sửa lớp ${c.name}`}>
                            <Pencil size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-parish-danger hover:bg-parish-danger-bg" onClick={() => setConfirmDelete(c.id)} title="Xóa" aria-label={`Xóa lớp ${c.name}`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
      </>
      )}

      {showModal && (
        <ModalShell
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingId ? 'Sửa Lớp Học' : 'Thêm Lớp Học Mới'}
          maxWidth="512px"
        >
            <div className="flex flex-col gap-4">
              <FormField label="Mã Lớp" htmlFor="class-code" required>
                <input id="class-code" className="form-input w-full" placeholder="VD: CC-01" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              </FormField>
              <FormField label="Tên Lớp" htmlFor="class-name" required>
                <input id="class-name" className="form-input w-full" placeholder="VD: Chiên Con 1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </FormField>
              <FormField label="Phân Ngành" htmlFor="class-branch" required>
                <select id="class-branch" className="form-input w-full" value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">-- Chọn Phân Ngành --</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </FormField>
              <FormField label="Niên Học" htmlFor="class-year" required>
                <select id="class-year" className="form-input w-full" value={form.academicYearId} onChange={e => setForm({ ...form, academicYearId: e.target.value })}>
                  <option value="">-- Chọn Niên Học --</option>
                  {academicYears.map(a => <option key={a.id} value={a.id}>{getAcademicYearLabel(a.id)}</option>)}
                </select>
              </FormField>
              <FormField label="Phòng Học" htmlFor="class-room">
                <input id="class-room" className="form-input w-full" placeholder="VD: Phòng 101" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} />
              </FormField>
              <FormField label="Chủ Nhiệm" htmlFor="class-homeroom">
                <select id="class-homeroom" className="form-input w-full" value={homeroomTeacherId} onChange={e => setHomeroomTeacherId(e.target.value)}>
                  <option value="">-- Chưa phân công --</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName} (@{t.username})</option>)}
                </select>
              </FormField>
              <FormField label="Trợ Tá" htmlFor="class-assistant">
                <select id="class-assistant" className="form-input w-full" value={assistantTeacherId} onChange={e => setAssistantTeacherId(e.target.value)}>
                  <option value="">-- Chưa phân công --</option>
                  {teachers.filter(t => t.id !== homeroomTeacherId).map(t => <option key={t.id} value={t.id}>{t.fullName} (@{t.username})</option>)}
                </select>
              </FormField>
              {formError && (
                <div role="alert" className="text-xs font-bold text-parish-danger bg-parish-danger-bg border border-parish-danger/30 rounded-xl px-3 py-2">
                  {formError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : editingId ? 'Cập Nhật' : 'Tạo Mới'}
              </button>
            </div>
        </ModalShell>
      )}

      {confirmDelete && (
        <ConfirmDialog
          isOpen={!!confirmDelete}
          title="Xác Nhận Xóa"
          message="Bạn có chắc muốn xóa lớp học này? Hành động này không thể hoàn tác."
          confirmText="Xóa"
          variant="danger"
          isBusy={deleting}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </DesktopAppShell>
  )
}
