import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useClassStore } from '../../stores/classStore'
import { useFilterStore } from '../../stores/filterStore'
import { BookOpen, Plus, Pencil, Trash2, School, Hash,   Calendar, User, Users, Eye, ArrowDownAZ, ArrowDownZA, ArrowUpDown } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { EmptyState, SkeletonTable } from '../common/StateFeedback'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ModalShell } from '../common/ModalShell'
import { FormField } from '../common/FormField'
import { PageHeader } from '../common/PageHeader'
import { sortClassesByHierarchy } from '../../utils/classSort'

interface TeacherOption {
  id: string
  fullName: string
  username: string
}

export function DesktopClasses() {
  const navigate = useNavigate()
  const { classes, branches, academicYears, loading, fetchClasses, fetchBranches, fetchAcademicYears, createClass, updateClass, deleteClass } = useClassStore()
  const { role } = useAuth()
  const canEdit = role === 'admin' || role === 'chunhiem'
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)

  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const sortedClasses = useMemo(() => {
    return sortClassesByHierarchy(classes, sortDirection)
  }, [classes, sortDirection])

  const viewClassStudents = (classId: string) => {
    setSelectedClassId(classId)
    navigate({ to: '/students' })
  }

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ code: '', name: '', branchId: '', academicYearId: '', room: '' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [homeroomTeacherId, setHomeroomTeacherId] = useState('')
  const [assistantTeacherId, setAssistantTeacherId] = useState('')
  const [prevHomeroom, setPrevHomeroom] = useState('')
  const [prevAssistants, setPrevAssistants] = useState<string[]>([])

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
    setPrevHomeroom('')
    setPrevAssistants([])
    api.getAvailableTeachers().then(setTeachers).catch(() => setTeachers([]))
    setShowModal(true)
  }

  const openEdit = (c: typeof classes[0]) => {
    setEditingId(c.id)
    setFormError('')
    setForm({ code: c.code, name: c.name, branchId: c.branchId, academicYearId: c.academicYearId, room: c.room || '' })
    setHomeroomTeacherId(c.homeroomTeacher?.id || '')
    setAssistantTeacherId(c.assistants?.[0]?.id || '')
    setPrevHomeroom(c.homeroomTeacher?.id || '')
    setPrevAssistants((c.assistants || []).map(a => a.id))
    api.getAvailableTeachers().then(setTeachers).catch(() => setTeachers([]))
    setShowModal(true)
  }

  const reconcileAssignments = async (classId: string) => {
    if (prevHomeroom && prevHomeroom !== homeroomTeacherId) {
      await api.unassignClassTeacher(classId, prevHomeroom).catch(() => {})
    }
    if (homeroomTeacherId && homeroomTeacherId !== prevHomeroom) {
      await api.assignClassTeacher(classId, homeroomTeacherId, 'chunhiem').catch(() => {})
    }
    const removed = prevAssistants.filter(id => id !== assistantTeacherId && id !== homeroomTeacherId)
    for (const rid of removed) {
      await api.unassignClassTeacher(classId, rid).catch(() => {})
    }
    if (assistantTeacherId && !prevAssistants.includes(assistantTeacherId) && assistantTeacherId !== homeroomTeacherId) {
      await api.assignClassTeacher(classId, assistantTeacherId, 'phuta').catch(() => {})
    }
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
        useToastStore.getState().addToast('Đã cập nhật lớp học thành công!', 'success')
      } else {
        const created = await createClass(form)
        savedId = created.id
        useToastStore.getState().addToast('Đã tạo lớp học mới thành công!', 'success')
      }
      await reconcileAssignments(savedId)
      await fetchClasses()
      setShowModal(false)
    } catch {
      useToastStore.getState().addToast('Có lỗi xảy ra khi lưu lớp học. Vui lòng thử lại!', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteClass(id)
      useToastStore.getState().addToast('Đã xóa lớp học thành công!', 'success')
    } catch {
      useToastStore.getState().addToast('Có lỗi xảy ra khi xóa lớp học. Vui lòng thử lại!', 'error')
    } finally {
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
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<BookOpen size={20} />}
        title="Quản Lý Lớp Học"
        description="Quản lý danh sách các lớp giáo lý, phân công huynh trưởng và sĩ số học sinh"
        actions={
          <>
            {/* Nút Sắp Xếp Cấp Bậc Lớp */}
            <div className="flex items-center bg-surface-hover p-1 rounded-xl border border-surface-border shadow-inner gap-1">
              <button
                type="button"
                onClick={() => setSortDirection('asc')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
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
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
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
                <button className="btn btn-primary btn-sm flex items-center gap-1.5" onClick={() => navigate({ to: '/academic-years' })}>
                  <Calendar size={16} /> Tạo Năm Học Trước
                </button>
              ) : (
                <button className="btn btn-primary btn-sm flex items-center gap-1.5" onClick={openCreate}>
                  <Plus size={16} /> Thêm Lớp
                </button>
              )
            )}
          </>
        }
      />

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

      <div className="bg-surface-card rounded-2xl border border-surface-border shadow-card overflow-hidden">
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
                  <tr key={c.id} className="border-b border-surface-hover bg-surface-card hover:bg-surface-app transition-colors cursor-pointer" onClick={() => viewClassStudents(c.id)}>
                    <td className="py-2.5 px-3 font-semibold text-text-muted">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-parish-primary-light text-parish-primary text-xs font-bold">
                        <Hash size={12} /> {c.code}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-parish-primary hover:underline text-base">
                      <span className="inline-flex items-center gap-1">
                        {c.name}
                        <Eye size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
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
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
