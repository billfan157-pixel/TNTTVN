import { useState, useEffect } from 'react'
import { Calendar, Lock, Unlock, Plus, CheckCircle2 } from 'lucide-react'
import { useAcademicYearStore } from '../stores/academicYearStore'

export function AcademicYearPage() {
  const { academicYears, currentYear, setCurrentYear, fetchAcademicYears } = useAcademicYearStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [newYearName, setNewYearName] = useState('')

  useEffect(() => {
    fetchAcademicYears()
  }, [fetchAcademicYears])

  const handleSelectActive = (yearId: string) => {
    setCurrentYear(yearId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-parish-primary/10 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-parish-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-main">Quản Lý Năm Học Giáo Lý</h1>
            <p className="text-xs text-text-muted">Năm học hiện tại: <span className="font-bold text-parish-primary">{currentYear}</span></p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-parish-primary hover:bg-parish-primary-hover text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Mở Năm Học Mới
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {academicYears.map((item) => {
          const isActive = item.id === currentYear
          return (
            <div
              key={item.id}
              className={`p-5 rounded-2xl border transition-all ${
                isActive
                  ? 'bg-parish-primary/5 border-parish-primary shadow-sm'
                  : 'bg-surface-card border-surface-border'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-text-main">{item.name || item.id}</h3>
                  {isActive && (
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-bold rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Đang chọn
                    </span>
                  )}
                </div>
                {item.isLocked ? (
                  <span className="px-2 py-1 bg-slate-500/10 text-slate-500 text-xs font-medium rounded-lg flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Đã Khóa
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-emerald-500/10 text-emerald-600 text-xs font-medium rounded-lg flex items-center gap-1">
                    <Unlock className="w-3 h-3" /> Mở
                  </span>
                )}
              </div>

              <div className="text-xs text-text-muted space-y-1 mb-4">
                <p>Thời gian: {item.startDate} — {item.endDate}</p>
              </div>

              <div className="flex gap-2">
                {!isActive && (
                  <button
                    onClick={() => handleSelectActive(item.id)}
                    className="px-3 py-1.5 bg-parish-primary text-white text-xs font-semibold rounded-lg hover:bg-parish-primary-hover transition-colors"
                  >
                    Chọn Làm Năm Học Hiện Tại
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-text-main">Mở Năm Học Giáo Lý Mới</h3>
            <input
              type="text"
              placeholder="VD: 2026 - 2027"
              value={newYearName}
              onChange={(e) => setNewYearName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-hover/30 border border-surface-border rounded-xl text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-surface-border text-text-muted text-xs font-bold rounded-xl"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (newYearName) {
                    setCurrentYear(newYearName)
                    setShowAddModal(false)
                    setNewYearName('')
                  }
                }}
                className="px-4 py-2 bg-parish-primary text-white text-xs font-bold rounded-xl"
              >
                Tạo & Kích Hoạt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AcademicYearPage
