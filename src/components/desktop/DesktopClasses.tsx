import { useState, useEffect } from 'react'
import { useClassStore } from '../../stores/classStore'
import { BookOpen, Plus, Pencil, Trash2, X, School, Hash, DoorOpen, Layers, Calendar } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

export function DesktopClasses() {
  const { classes, branches, academicYears, loading, fetchClasses, fetchBranches, fetchAcademicYears, createClass, updateClass, deleteClass } = useClassStore()
  const { role } = useAuth()
  const canEdit = role === 'admin' || role === 'chunhiem'

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ code: '', name: '', branchId: '', academicYearId: '', room: '' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    fetchClasses()
    fetchBranches()
    fetchAcademicYears()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm({ code: '', name: '', branchId: branches[0]?.id || '', academicYearId: academicYears[0]?.id || '', room: '' })
    setShowModal(true)
  }

  const openEdit = (c: typeof classes[0]) => {
    setEditingId(c.id)
    setForm({ code: c.code, name: c.name, branchId: c.branchId, academicYearId: c.academicYearId, room: c.room || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.code || !form.name || !form.branchId || !form.academicYearId) return
    if (editingId) {
      await updateClass(editingId, form)
    } else {
      await createClass(form)
    }
    setShowModal(false)
  }

  const handleDelete = async (id: string) => {
    await deleteClass(id)
    setConfirmDelete(null)
  }

  const getBranchName = (id: string) => branches.find(b => b.id === id)?.name || id
  const getAcademicYearLabel = (id: string) => {
    const ay = academicYears.find(a => a.id === id)
    return ay ? `${ay.startDate} - ${ay.endDate}` : id
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-2xl p-5 border border-surface-border flex justify-between items-center flex-wrap gap-4 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-parish-primary" />
            <h2 className="text-lg font-extrabold text-parish-primary m-0 tracking-tight">Quản Lý Lớp Học</h2>
          </div>
          <p className="text-sm text-text-muted mt-1 m-0 font-medium">
            Quản lý danh sách các lớp giáo lý trong giáo xứ
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary btn-sm flex items-center gap-1.5" onClick={openCreate}>
            <Plus size={16} /> Thêm Lớp
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0">
            <colgroup>
              <col className="w-[50px]" />
              <col className="w-[120px]" />
              <col className="w-auto min-w-0" />
              <col className="w-[150px]" />
              <col className="w-[160px]" />
              <col className="w-[100px]" />
              {canEdit && <col className="w-[100px]" />}
            </colgroup>
            <thead>
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3">STT</th>
                <th className="py-2.5 px-3">Mã Lớp</th>
                <th className="py-2.5 px-3">Tên Lớp</th>
                <th className="py-2.5 px-3">Phân Ngành</th>
                <th className="py-2.5 px-3">Niên Học</th>
                <th className="py-2.5 px-3">Phòng</th>
                {canEdit && <th className="py-2.5 px-3 text-center">Thao Tác</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="text-center p-8 text-text-muted">
                    Đang tải...
                  </td>
                </tr>
              ) : classes.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="text-center p-8 text-text-muted">
                    Chưa có lớp học nào.
                  </td>
                </tr>
              ) : (
                classes.map((c, idx) => (
                  <tr key={c.id} className="border-b border-surface-hover hover:bg-surface-app transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-text-muted">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-bold">
                        <Hash size={12} /> {c.code}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold">{c.name}</td>
                    <td className="py-2.5 px-3 text-text-muted">{c.branchName || getBranchName(c.branchId)}</td>
                    <td className="py-2.5 px-3 text-text-muted text-xs">{getAcademicYearLabel(c.academicYearId)}</td>
                    <td className="py-2.5 px-3 text-text-muted">{c.room || '—'}</td>
                    {canEdit && (
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button className="btn btn-ghost btn-sm p-1.5" onClick={() => openEdit(c)} title="Sửa">
                            <Pencil size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50" onClick={() => setConfirmDelete(c.id)} title="Xóa">
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl border border-surface-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-parish-primary m-0">
                {editingId ? 'Sửa Lớp Học' : 'Thêm Lớp Học Mới'}
              </h3>
              <button className="btn btn-ghost btn-sm p-1" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">
                  <Hash size={12} className="inline mr-1" />Mã Lớp
                </label>
                <input className="input w-full" placeholder="VD: CC-01" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">
                  <School size={12} className="inline mr-1" />Tên Lớp
                </label>
                <input className="input w-full" placeholder="VD: Chiên Con 1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">
                  <Layers size={12} className="inline mr-1" />Phân Ngành
                </label>
                <select className="input w-full" value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">-- Chọn Phân Ngành --</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">
                  <Calendar size={12} className="inline mr-1" />Niên Học
                </label>
                <select className="input w-full" value={form.academicYearId} onChange={e => setForm({ ...form, academicYearId: e.target.value })}>
                  <option value="">-- Chọn Niên Học --</option>
                  {academicYears.map(a => <option key={a.id} value={a.id}>{a.startDate} - {a.endDate}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">
                  <DoorOpen size={12} className="inline mr-1" />Phòng Học
                </label>
                <input className="input w-full" placeholder="VD: Phòng 101" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave}>
                {editingId ? 'Cập Nhật' : 'Tạo Mới'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-surface-border" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-red-600 m-0 mb-2">Xác Nhận Xóa</h3>
            <p className="text-sm text-text-muted mb-5">
              Bạn có chắc muốn xóa lớp học này? Hành động này không thể hoàn tác.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(null)}>Hủy</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(confirmDelete)}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
