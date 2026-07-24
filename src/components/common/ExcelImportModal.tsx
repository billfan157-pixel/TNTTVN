import React, { useState } from 'react'
import { FileSpreadsheet, Upload, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react'
import { parseRosterText, convertToStudentModels, type ParsedStudentRow } from '../../utils/excelParser'
import { useStudentStore } from '../../stores/studentStore'
import { MOCK_CLASSES } from '../../data/mockParishData'
import * as Sentry from '@sentry/react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export const ExcelImportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [selectedClassId, setSelectedClassId] = useState('AU1')
  const [pastedText, setPastedText] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([])
  const [isImporting, setIsImporting] = useState(false)

  const addStudent = useStudentStore((s) => s.addStudent)

  if (!isOpen) return null

  const handleParse = (text: string) => {
    setPastedText(text)
    const rows = parseRosterText(text, selectedClassId)
    setParsedRows(rows)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) handleParse(content)
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    setIsImporting(true)
    try {
      const validStudents = convertToStudentModels(parsedRows)
      validStudents.forEach((student) => {
        addStudent(student)
      })
      alert(`Đã thêm thành công ${validStudents.length} Thiếu nhi vào hệ thống!`)
      onClose()
    } catch (err) {
      Sentry.captureException(err)
      alert('Có lỗi xảy ra khi nhập dữ liệu. Vui lòng thử lại!')
    } finally {
      setIsImporting(false)
    }
  }

  const validCount = parsedRows.filter((r) => r.isValid).length
  const invalidCount = parsedRows.filter((r) => !r.isValid).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-lg">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-main">Import Danh Sách Thiếu Nhi Từ Excel / CSV</h2>
              <p className="text-xs text-text-muted">Tải file `.csv` hoặc dán trực tiếp từ bảng tính Excel</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Chọn Lớp Nhập Vấn</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
              >
                {MOCK_CLASSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.academicYear})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Tải File CSV Từ Máy Tính</label>
              <label className="flex items-center gap-2 px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-main text-sm font-medium rounded-lg cursor-pointer border border-surface-border transition-colors">
                <Upload className="w-4 h-4 text-parish-primary" />
                <span>Chọn file .csv / .txt...</span>
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Paste area */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Hoặc Dán Nội Dung Từ Excel (Copy & Paste)</label>
            <textarea
              value={pastedText}
              onChange={(e) => handleParse(e.target.value)}
              placeholder="Dán các dòng từ Excel vào đây... (Ví dụ: Giuse	Nguyễn Văn A	Nam	2015-05-10	Phêrô Nguyễn Văn B	0901234567)"
              rows={4}
              className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm font-mono text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
            />
          </div>

          {/* Validation Summary */}
          {parsedRows.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-surface-hover/40 rounded-lg border border-surface-border">
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> {validCount} Dòng Hợp Lệ
                </span>
                {invalidCount > 0 && (
                  <span className="flex items-center gap-1 text-rose-600 font-semibold">
                    <AlertCircle className="w-4 h-4" /> {invalidCount} Dòng Lỗi
                  </span>
                )}
              </div>
              <span className="text-xs text-text-muted">Tổng số: {parsedRows.length} dòng</span>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="overflow-x-auto border border-surface-border rounded-lg max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-surface-hover text-text-muted uppercase font-semibold sticky top-0">
                  <tr>
                    <th className="p-2 border-b border-surface-border">Trạng thái</th>
                    <th className="p-2 border-b border-surface-border">Tên Thánh</th>
                    <th className="p-2 border-b border-surface-border">Họ & Tên</th>
                    <th className="p-2 border-b border-surface-border">Phái</th>
                    <th className="p-2 border-b border-surface-border">Ngày Sinh</th>
                    <th className="p-2 border-b border-surface-border">Phụ Huynh</th>
                    <th className="p-2 border-b border-surface-border">SĐT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {parsedRows.map((r, idx) => (
                    <tr key={idx} className={r.isValid ? 'hover:bg-surface-hover/20' : 'bg-rose-500/10'}>
                      <td className="p-2">
                        {r.isValid ? (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-full">OK</span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-rose-100 dark:bg-rose-950 text-rose-600 rounded-full">{r.errors.join(', ')}</span>
                        )}
                      </td>
                      <td className="p-2 font-semibold text-text-main">{r.holyName}</td>
                      <td className="p-2 text-text-main">{r.fullName}</td>
                      <td className="p-2 text-text-muted">{r.gender}</td>
                      <td className="p-2 text-text-muted">{r.dateOfBirth}</td>
                      <td className="p-2 text-text-muted">{r.parentName}</td>
                      <td className="p-2 text-text-muted">{r.parentPhone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-border bg-surface-hover/30">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:bg-surface-hover transition-colors">
            Hủy Bỏ
          </button>
          <button
            onClick={handleImport}
            disabled={validCount === 0 || isImporting}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors"
          >
            {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Nhập {validCount} Thiếu Nhi Vấn Lớp</span>
          </button>
        </div>
      </div>
    </div>
  )
}
