import React, { useState, useEffect } from 'react'
import { FileSpreadsheet, Upload, CheckCircle2, AlertCircle, X, Loader2, ArrowRight, Download, FileDown, History, RotateCcw, Layers, Info, Settings2, AlertTriangle } from 'lucide-react'
import { loadXlsx } from '../../lib/xlsxLoader'
import { findHeaderRow, detectColumnsWithConfidence, parseToImportRows, normalizeDate, type ImportRow, type ColumnDetectionResult } from '../../utils/excelParser'
import { useClassStore } from '../../stores/classStore'
import { api } from '../../lib/api'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface Props {
  isOpen: boolean
  onClose: () => void
}

type Step = 'upload' | 'review' | 'report' | 'history'

const FIELD_LABELS: Record<string, string> = {
  holyName: 'Tên Thánh',
  fullName: 'Họ và Tên',
  gender: 'Giới Tính',
  dateOfBirth: 'Ngày Sinh',
  parentName: 'Phụ Huynh',
  parentPhone: 'SĐT Phụ Huynh',
  address: 'Địa Chỉ',
  branch: 'Phân Ngành',
  className: 'Lớp',
}

export const ExcelImportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('upload')
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [colMap, setColMap] = useState<Record<string, number>>({})
  const [columnDetections, setColumnDetections] = useState<ColumnDetectionResult[]>([])
  const [fileName, setFileName] = useState('')
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [validationRows, setValidationRows] = useState<any[]>([])
  const [classMappings, setClassMappings] = useState<Record<string, string | null>>({})
  const [newClasses, setNewClasses] = useState<{ name: string; branch: string; academicYearId: string }[]>([])
  const [duplicateActions, setDuplicateActions] = useState<Record<string, 'skip' | 'update'>>({})
  const [importResult, setImportResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [undoing, setUndoing] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [detailView, setDetailView] = useState<{ batchId: string; rows: any[]; counts: Record<string, number> } | null>(null)
  const [previousImport, setPreviousImport] = useState<{ batchId: string; fileName: string | null; createdAt: string; totalRows: number } | null>(null)
  const [serviceExclusions, setServiceExclusions] = useState<Set<number>>(new Set())
  const [editClassNames, setEditClassNames] = useState<Set<string>>(new Set())

  const branches = useClassStore((s) => s.branches)
  const academicYears = useClassStore((s) => s.academicYears)
  const activeAcademicYears = academicYears.filter(a => !a.isLocked)
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()
  // PHA 1 (audit A19): focus trap
  const trapRef = useFocusTrap(isOpen)

  const allFields = Object.keys(FIELD_LABELS)

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [isOpen])

  if (!isOpen) return null

  const reset = () => {
    setStep('upload')
    setRawRows([])
    setColMap({})
    setColumnDetections([])
    setFileName('')
    setImportRows([])
    setValidationRows([])
    setClassMappings({})
    setNewClasses([])
    setDuplicateActions({})
    setImportResult(null)
    setLoading(false)
    setError('')
    setDetailView(null)
    setPreviousImport(null)
    setServiceExclusions(new Set())
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const readFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
      const reader = new FileReader()
      reader.onload = (e) => {
        if (isExcel) {
          // PERF-XLSX-1: lazy-load xlsx khi user thực sự mở file Excel.
          void (async () => {
            const XLSX = await loadXlsx()
            const data = new Uint8Array(e.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })
            const sheet = workbook.Sheets[workbook.SheetNames[0]]
            const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })
            const text = rows.map(r => r.map((c: any) => c ?? '').join('\t')).join('\n')
            resolve(text)
          })().catch(reject)
        } else {
          resolve(e.target?.result as string)
        }
      }
      reader.onerror = () => reject(reader.error)
      if (isExcel) reader.readAsArrayBuffer(file)
      else reader.readAsText(file)
    })
  }

  const parseText = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const parsed = lines.map(line => {
      const delim = line.includes('\t') ? '\t' : line.includes(',') ? ',' : ';'
      return line.split(delim).map(c => c.trim().replace(/^["']|["']$/g, ''))
    })
    const { headerIndex, colMap: detected } = findHeaderRow(parsed)
    if (headerIndex === -1) {
      setError('Không tìm thấy dòng tiêu đề. Vui lòng đảm bảo file có header (Tên Thánh, Họ Tên, ...)')
      return
    }
    setError('')
    const dataRows = parsed.slice(headerIndex + 1).filter(r => r.some(c => c))
    setRawRows(dataRows)
    setColMap(detected)
    const headerRow = parsed[headerIndex]
    setColumnDetections(detectColumnsWithConfidence(headerRow))
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    try {
      const text = await readFile(file)
      parseText(text)
    } catch {
      setError('Không thể đọc file. Vui lòng thử lại.')
    }
  }

  const handlePaste = (text: string) => {
    if (!text.trim()) return
    setFileName('')
    parseText(text)
  }

  const handleColumnChange = (field: string, colIdx: number) => {
    setColMap(prev => ({ ...prev, [field]: colIdx }))
  }

  const handleContinueToReview = async () => {
    const rows = parseToImportRows(rawRows, colMap)
      .map(r => ({ ...r, dateOfBirth: normalizeDate(r.dateOfBirth) }))
    setImportRows(rows)
    setLoading(true)
    setError('')
    try {
      const result = await api.validateStudents(rows.map(r => ({ ...r, rowIndex: r.rowIndex })))
      setValidationRows(result.rows)

      const suggested = result.suggestedNewClasses || []
      const classNotFound = result.classesNotFound || []
      const mappings: Record<string, string | null> = {}
      const newCls: { name: string; branch: string; academicYearId: string }[] = []

      for (const cn of classNotFound) {
        mappings[cn] = null
      }

      for (const nc of suggested) {
        newCls.push({
          name: nc.name,
          branch: nc.branch,
          academicYearId: nc.academicYearId,
        })
      }

      for (const cn of classNotFound) {
        if (!newCls.find(nc => nc.name === cn)) {
          const branch = inferBranch(cn) || 'ThieuNhi'
          newCls.push({
            name: cn,
            branch,
            academicYearId: activeAcademicYears[0]?.id || '',
          })
        }
      }

      setPreviousImport(result.previousImport || null)
      setServiceExclusions(new Set())
      setClassMappings(mappings)
      setNewClasses(newCls)

      const dupActions: Record<string, 'skip' | 'update'> = {}
      for (const r of result.rows) {
        if (r.duplicateOf) dupActions[String(r.rowIndex)] = 'update'
      }
      setDuplicateActions(dupActions)

      setStep('review')
    } catch {
      setError('Lỗi kết nối server. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.importStudents({
        rows: importRows.map(r => ({ ...r, rowIndex: r.rowIndex })),
        classMappings,
        newClasses,
        duplicateActions,
        fileName: fileName || undefined,
        serviceExclusions: Array.from(serviceExclusions),
      })
      setImportResult(result)
      setStep('report')
    } catch {
      setError('Lỗi khi import. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const handleUndo = async () => {
    if (!importResult?.batchId) return
    setUndoing(true)
    try {
      await api.undoImport(importResult.batchId)
      await askConfirm({
        title: 'Hoàn tác thành công',
        message: `Đã hoàn tác import. ${importResult.imported} học viên đã được xóa (soft-delete).`,
        confirmText: 'OK',
        variant: 'info',
        showCancel: false,
      })
    } catch (err: any) {
      await askConfirm({
        title: 'Không thể hoàn tác',
        message: err?.message || 'Không thể hoàn tác. Batch có thể đã hết hạn 10 phút.',
        confirmText: 'OK',
        variant: 'warning',
        showCancel: false,
      })
    } finally {
      setUndoing(false)
    }
  }

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const result = await api.getImportHistory({ limit: 20 })
      setHistory(result)
      setStep('history')
    } catch {
      setError('Không thể tải lịch sử import')
    } finally {
      setLoadingHistory(false)
    }
  }

  const validRows = validationRows.filter((r: any) => r.isValid)
  const invalidRows = validationRows.filter((r: any) => !r.isValid && !r.duplicateOf)
  const dupRows = validationRows.filter((r: any) => r.duplicateOf)

  const BRANCH_KEYWORDS: Record<string, string[]> = {
    ChienCon: ['chien con', 'chiên con', 'cc', 'chien'],
    AuNhi: ['au nhi', 'ấu nhi', 'an', 'au'],
    ThieuNhi: ['thieu nhi', 'thiếu nhi', 'tn', 'thieu'],
    NghiaSi: ['nghia si', 'nghĩa sĩ', 'ns', 'nghia'],
    HiepSi: ['hiep si', 'hiệp sĩ', 'hs', 'hiep'],
  }
  const inferBranch = (className: string): string | null => {
    const lower = className.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    for (const [branch, keywords] of Object.entries(BRANCH_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) return branch
      }
    }
    const branchName = branches.find(b => lower.includes(b.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
    return branchName?.name || null
  }

  const unmatchedClassNames = [...new Set(validationRows.map((r: any) => r.className).filter((cn: string) => {
    const row = validationRows.find((r: any) => r.className === cn)
    return row && !row.classMatch
  }))]

  const countErrorType = (keyword: string): number =>
    invalidRows.filter((r: any) => (r.errors || []).some((e: string) => e.includes(keyword))).length
  const missingDobCount = countErrorType('Ngày Sinh')
  const missingClassCount = countErrorType('Tên Lớp') + countErrorType('không xác định được lớp')
  const missingPhoneCount = countErrorType('điện thoại')

  const exportCsv = (data: any[], filename: string) => {
    const headers = Object.keys(data[0] || {})
    const csv = [headers.join(','), ...data.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const showCombinedFullName = colMap['fullName'] === undefined && colMap['lastName'] !== undefined && colMap['firstName'] !== undefined

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="excel-import-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" onClick={handleClose}>
      <div ref={trapRef} className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-lg">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 id="excel-import-title" className="text-lg font-bold text-text-main">Import Danh Sách Thiếu Nhi</h2>
              <p className="text-xs text-text-muted">
                {step === 'upload' && 'Tải file hoặc dán nội dung từ Excel'}
                {step === 'review' && 'Kiểm tra và xác nhận dữ liệu'}
                {step === 'report' && 'Kết quả import'}
                {step === 'history' && 'Lịch sử import'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {step === 'upload' && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Tải File Từ Máy Tính</label>
                  <label className="flex items-center gap-2 px-4 py-2.5 bg-surface-hover hover:bg-surface-hover/80 text-text-main text-sm font-medium rounded-lg cursor-pointer border border-surface-border border-dashed transition-colors">
                    <Upload className="w-4 h-4 text-parish-primary" />
                    <span>.xlsx / .xls / .csv / .txt</span>
                    <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                <div className="text-xs text-text-muted flex items-end pb-2">
                   File cần có dòng tiêu đề (Tên Thánh, Họ Tên, Lớp...) — Các trường khác nếu thiếu sẽ được tự động điền
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Hoặc Dán Nội Dung (Copy & Paste)</label>
                <textarea
                  onChange={e => { const val = e.target.value; if (val.trim()) handlePaste(val) }}
                  placeholder="Dán các dòng từ Excel vào đây..."
                  rows={3}
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm font-mono text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 rounded-lg border border-rose-200 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {rawRows.length > 0 && Object.keys(colMap).length > 0 && (
                <>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 text-blue-700 rounded-lg border border-blue-200 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Đã nhận diện {rawRows.length} dòng dữ liệu. Kiểm tra ánh xạ cột bên dưới.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase mb-2">Ánh Xạ Cột</label>
                    <div className="overflow-x-auto border border-surface-border rounded-lg">
                      <table className="w-full text-left text-xs border-collapse bg-surface-card text-text-main">
                        <thead>
                          <tr className="bg-surface-hover">
                            <th className="p-2 border-b border-surface-border" scope="col">Trường</th>
                            <th className="p-2 border-b border-surface-border" scope="col">Cột #</th>
                            <th className="p-2 border-b border-surface-border" scope="col">Độ Tin Cậy</th>
                            <th className="p-2 border-b border-surface-border" scope="col">Giá Trị Mẫu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-border bg-surface-card">
                          {allFields.map(field => {
                            const idx = colMap[field]
                            const det = columnDetections.find(d => d.field === field)
                            const confScore = det?.score
                            const isFullNameCombined = field === 'fullName' && idx === undefined && colMap['lastName'] !== undefined && colMap['firstName'] !== undefined
                            const lastNameIdx = colMap['lastName']
                            const firstNameIdx = colMap['firstName']
                            const combinedSample = isFullNameCombined ? ((rawRows[0]?.[lastNameIdx] || '') + ' ' + (rawRows[0]?.[firstNameIdx] || '')).trim() : ''
                            const sample = idx !== undefined ? rawRows[0]?.[idx] : (isFullNameCombined ? combinedSample : '')
                            return (
                              <tr key={field}>
                                <td className="p-2 font-medium">{FIELD_LABELS[field]}</td>
                                <td className="p-2">
                                  {isFullNameCombined ? (
                                    <span className="text-xs text-emerald-600 font-semibold">Cột {lastNameIdx! + 1} + Cột {firstNameIdx! + 1}</span>
                                  ) : (
                                    <select
                                      value={idx ?? ''}
                                      onChange={e => handleColumnChange(field, Number(e.target.value))}
                                      className="text-xs px-2 py-1 border border-surface-border rounded bg-surface-card"
                                    >
                                      <option value="">-- Bỏ qua --</option>
                                      {rawRows[0]?.map((_, ci) => (
                                        <option key={ci} value={ci}>Cột {ci + 1}</option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                                <td className="p-2">
                                  {isFullNameCombined ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">Tự động</span>
                                  ) : idx !== undefined && confScore !== undefined ? (
                                    <span className={`group relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold cursor-help ${
                                      confScore >= 95 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                      confScore >= 80 ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                      'bg-amber-100 text-amber-700 border border-amber-200'
                                    }`}>
                                      {confScore}%
                                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg shadow-lg text-center whitespace-nowrap">
                                        {det?.reason || ''}
                                      </div>
                                    </span>
                                  ) : idx !== undefined ? (
                                    <span className="text-amber-600 text-[10px] font-semibold">⚠ Cần xác nhận</span>
                                  ) : (
                                    <span className="text-text-muted text-[10px]">—</span>
                                  )}
                                </td>
                                <td className="p-2 text-text-muted truncate max-w-[200px]">{sample}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {rawRows.length > 0 && (
                <div className="overflow-x-auto border border-surface-border rounded-lg max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse bg-surface-card text-text-main">
                    <thead className="bg-surface-hover text-text-muted uppercase font-semibold sticky top-0">
                      <tr>
                        {(allFields.filter(f => colMap[f] !== undefined).concat(showCombinedFullName ? ['fullName'] : [])).map(f => (
                          <th key={f} className="p-2 border-b border-surface-border" scope="col">{FIELD_LABELS[f]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border bg-surface-card">
                      {rawRows.slice(0, 20).map((row, ri) => (
                        <tr key={ri}>
                          {(allFields.filter(f => colMap[f] !== undefined).concat(showCombinedFullName ? ['fullName'] : [])).map(f => {
                            const isCombined = f === 'fullName' && showCombinedFullName
                            const val = isCombined ? ((row[colMap['lastName']] || '') + ' ' + (row[colMap['firstName']] || '')).trim() : (row[colMap[f]] || '')
                            return <td key={f} className="p-2 text-text-main truncate max-w-[150px]">{val}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rawRows.length > 20 && (
                    <div className="p-2 text-center text-xs text-text-muted border-t border-surface-border">
                      ... và {rawRows.length - 20} dòng khác
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="p-6 space-y-6">
              {/* Summary Line */}
              <div className="p-3 bg-surface-hover rounded-lg border border-surface-border text-sm text-text-main">
                {importRows.length} dòng — {validRows.length} hợp lệ — {dupRows.length} trùng lặp — {unmatchedClassNames.length} lớp mới
                {invalidRows.length > 0 && (
                  <> — <span className="text-amber-600">{invalidRows.length} lỗi{missingDobCount > 0 && ` (${missingDobCount} thiếu ngày sinh)`}{missingPhoneCount > 0 && ` (${missingPhoneCount} thiếu SĐT)`}{missingClassCount > 0 && ` (${missingClassCount} thiếu lớp)`}</span></>
                )}
                {validRows.filter((r: any) => r.detectedService === 'yes').length > 0 && (
                  <> — <span className="text-indigo-600">{validRows.filter((r: any) => r.detectedService === 'yes').length} phục vụ</span></>
                )}
              </div>

              {/* Summary / Dry Run */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200">
                  <div className="text-2xl font-bold text-emerald-600">{validRows.length}</div>
                  <div className="text-xs text-emerald-700 font-medium">Hợp lệ</div>
                  <div className="text-[10px] text-emerald-500 mt-1">{validRows.length > 0 ? `Sẽ import ${validRows.length} học viên` : 'Không có'}</div>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200">
                  <div className="text-2xl font-bold text-amber-600">{invalidRows.length}</div>
                  <div className="text-xs text-amber-700 font-medium">Lỗi</div>
                  <div className="text-[10px] text-amber-500 mt-1">Sẽ bỏ qua</div>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200">
                  <div className="text-2xl font-bold text-blue-600">{dupRows.length}</div>
                  <div className="text-xs text-blue-700 font-medium">Trùng lặp</div>
                  <div className="text-[10px] text-blue-500 mt-1">{dupRows.filter(r => duplicateActions[String(r.rowIndex)] === 'skip').length} bỏ qua, {dupRows.filter(r => duplicateActions[String(r.rowIndex)] === 'update').length} cập nhật</div>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200">
                  <div className="text-2xl font-bold text-purple-600">{unmatchedClassNames.length}</div>
                  <div className="text-xs text-purple-700 font-medium">Lớp mới</div>
                  <div className="text-[10px] text-purple-500 mt-1">Sẽ tạo tự động</div>
                </div>
              </div>

              {/* Duplicate Import Warning */}
              {previousImport && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-800">File Này Đã Được Import Trước Đó</h4>
                      <p className="text-xs text-amber-700 mt-1">
                        Dữ liệu giống với batch trước: <strong>{previousImport.fileName || 'Không có tên file'}</strong>
                        {' — '}{new Date(previousImport.createdAt).toLocaleString('vi-VN')}
                        {' — '}{previousImport.totalRows} dòng
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        Nếu bạn vẫn muốn import lại, hệ thống sẽ ghi đè dữ liệu trùng.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Conflict Resolution: students in different class */}
              {dupRows.filter((r: any) => r.duplicateOf?.currentClassName).length > 0 && (
                <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-orange-800 flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      Xung Đột Lớp Học
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDuplicateActions(prev => {
                          const next = { ...prev }
                          dupRows.filter((r: any) => r.duplicateOf?.currentClassName).forEach(r => {
                            next[String(r.rowIndex)] = 'update'
                          })
                          return next
                        })}
                        className="px-2 py-1 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded border border-orange-300"
                      >
                        Chọn tất cả: Chuyển lớp
                      </button>
                      <button
                        type="button"
                        onClick={() => setDuplicateActions(prev => {
                          const next = { ...prev }
                          dupRows.filter((r: any) => r.duplicateOf?.currentClassName).forEach(r => {
                            next[String(r.rowIndex)] = 'skip'
                          })
                          return next
                        })}
                        className="px-2 py-1 text-xs font-medium text-text-muted bg-surface-hover hover:bg-surface-border rounded border border-surface-border"
                      >
                        Chọn tất cả: Giữ lớp cũ
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-orange-700 mb-3">Những học viên này đã tồn tại nhưng đang học lớp khác trong hệ thống. Chọn hành động phù hợp.</p>
                  <div className="space-y-2">
                    {dupRows.filter((r: any) => r.duplicateOf?.currentClassName).map((r: any) => (
                      <div key={r.rowIndex} className="flex items-center justify-between p-2 bg-surface-card rounded border border-surface-border">
                        <div className="text-sm">
                          <span className="font-medium">Dòng {r.rowIndex}</span>: {r.fullName}
                          <div className="text-xs text-text-muted mt-1">
                            Đang học: <span className="font-medium text-parish-warning">{r.duplicateOf.currentClassName}</span>
                            {classMappings[r.className] && (
                              <> → Import vào: {validationRows.find((vr: any) => vr.rowIndex === r.rowIndex)?.classMatch?.name || 'lớp mới'}</>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            className="text-xs px-2 py-1 border border-surface-border rounded bg-surface-card"
                            value={duplicateActions[String(r.rowIndex)] || 'skip'}
                            onChange={e => setDuplicateActions(prev => ({ ...prev, [String(r.rowIndex)]: e.target.value as 'skip' | 'update' }))}
                          >
                            <option value="skip">Giữ nguyên lớp cũ</option>
                            <option value="update">Chuyển sang lớp mới</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Duplicates */}
              {dupRows.filter((r: any) => !r.duplicateOf?.currentClassName).length > 0 && (
                <div className="p-4 bg-surface-app rounded-lg border border-surface-border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-parish-primary">Học Viên Có Thể Trùng</h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDuplicateActions(prev => {
                          const next = { ...prev }
                          dupRows.filter((r: any) => !r.duplicateOf?.currentClassName).forEach(r => {
                            next[String(r.rowIndex)] = 'update'
                          })
                          return next
                        })}
                        className="px-2 py-1 text-xs font-medium text-parish-primary bg-parish-primary-light hover:bg-parish-primary/20 rounded border border-parish-primary/30"
                      >
                        Chọn tất cả: Cập nhật
                      </button>
                      <button
                        type="button"
                        onClick={() => setDuplicateActions(prev => {
                          const next = { ...prev }
                          dupRows.filter((r: any) => !r.duplicateOf?.currentClassName).forEach(r => {
                            next[String(r.rowIndex)] = 'skip'
                          })
                          return next
                        })}
                        className="px-2 py-1 text-xs font-medium text-text-muted bg-surface-hover hover:bg-surface-border rounded border border-surface-border"
                      >
                        Chọn tất cả: Bỏ qua
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {dupRows.filter((r: any) => !r.duplicateOf?.currentClassName).map((r: any) => (
                      <div key={r.rowIndex} className="flex items-center justify-between p-2 bg-surface-card rounded border border-surface-border">
                        <div className="text-sm">
                          <span className="font-medium">Dòng {r.rowIndex}</span>: {r.fullName}
                          <span className="text-text-muted ml-2">
                            → Có thể trùng với <strong>{r.duplicateOf?.fullName}</strong> ({r.duplicateOf?.reason === 'phone' ? 'SĐT' : 'Họ tên + Ngày sinh'})
                          </span>
                        </div>
                        <select
                          className="text-xs px-2 py-1 border border-surface-border rounded bg-surface-card"
                          value={duplicateActions[String(r.rowIndex)] || 'skip'}
                          onChange={e => setDuplicateActions(prev => ({ ...prev, [String(r.rowIndex)]: e.target.value as 'skip' | 'update' }))}
                        >
                          <option value="skip">Bỏ qua</option>
                          <option value="update">Cập nhật</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Service Detection */}
              {validRows.filter((r: any) => r.detectedService === 'yes').length > 0 && (
                <div className="p-4 bg-surface-app rounded-lg border border-surface-border">
                  <h4 className="text-sm font-bold text-parish-primary mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Phục Vụ — Lễ Phục Vụ
                  </h4>
                  <p className="text-xs text-text-muted mb-3">
                    {validRows.filter((r: any) => r.detectedService === 'yes').length} học viên được phát hiện là lễ phục vụ
                    {validRows.some((r: any) => r.service) ? ' (từ cột trong file Excel)' : ' (ngành NghiaSi / HiepSi)'}.
                    Bỏ chọn nếu không muốn ghi nhận.
                  </p>
                  <div className="space-y-2">
                    {validRows.filter((r: any) => r.detectedService === 'yes').map((r: any) => (
                      <div key={r.rowIndex} className="flex items-center justify-between p-2 bg-surface-card rounded border border-surface-border">
                        <div className="text-sm">
                          <span className="font-medium">Dòng {r.rowIndex}</span>: {r.fullName}
                          <span className="text-text-muted ml-2">({r.branch})</span>
                        </div>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!serviceExclusions.has(r.rowIndex)}
                            onChange={e => {
                              setServiceExclusions(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) next.delete(r.rowIndex)
                                else next.add(r.rowIndex)
                                return next
                              })
                            }}
                            className="w-3.5 h-3.5 accent-parish-primary"
                          />
                          <span className={!serviceExclusions.has(r.rowIndex) ? 'text-parish-primary font-medium' : 'text-text-muted'}>
                            Lễ phục vụ
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched classes — auto-create by default */}
              {unmatchedClassNames.length > 0 && (
                <div className="p-4 bg-surface-app rounded-lg border border-surface-border">
                  <h4 className="text-sm font-bold text-parish-warning mb-3">Lớp Chưa Tồn Tại — Sẽ Tự Động Tạo Mới</h4>
                  <div className="space-y-2">
                    {unmatchedClassNames.map(cn => {
                      const row = validationRows.find((r: any) => r.className === cn)
                      const nc = newClasses.find(n => n.name === cn)
                      const studentCount = validationRows.filter(r => r.className === cn && !r.duplicateOf).length
                      const ayName = activeAcademicYears.find(a => a.id === nc?.academicYearId)
                      return (
                        <div key={cn} className="p-3 bg-surface-card rounded border border-surface-border">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-bold text-amber-900 shrink-0">{cn}</span>
                              {!classMappings[cn] ? (
                                <span className="text-[11px] text-amber-700 truncate">
                                  → Tạo mới: {nc?.branch || '?'} · {ayName ? `${ayName.startDate}–${ayName.endDate}` : '?'} · {studentCount} học viên
                                </span>
                              ) : (
                                <span className="text-[11px] text-emerald-700 truncate">
                                  → Ghép vào lớp có sẵn: {validationRows.find((r: any) => r.className === cn)?.classMatch?.name || classMappings[cn]}
                                </span>
                              )}
                            </div>
                            {!classMappings[cn] && (() => {
                              const studentsInClass = validationRows.filter(r => r.className === cn && !r.duplicateOf)
                              const studentBranches = [...new Set(studentsInClass.map(r => r.branch).filter(Boolean))]
                              const inferredBranch = nc?.branch
                              const hasMismatch = inferredBranch && studentBranches.length > 0 && studentBranches.some(b => b !== inferredBranch)
                              if (hasMismatch) {
                                return (
                                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-2 py-1 rounded border border-rose-200">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    <span>⚠ Phân ngành học sinh ({studentBranches.join(', ')}) khác phân ngành lớp được suy diễn ({inferredBranch}). Hãy kiểm tra lại!</span>
                                  </div>
                                )
                              }
                              return null
                            })()}
                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                className="text-xs px-2 py-1 border border-surface-border rounded bg-surface-card max-w-[180px]"
                                value={classMappings[cn] || ''}
                                onChange={e => setClassMappings(prev => ({ ...prev, [cn]: e.target.value || null }))}
                              >
                                <option value="">Tự động tạo mới</option>
                                {(row?.classSuggestions || []).map((s: any) => (
                                  <option key={s.id} value={s.id} className={
                                    s.confidence >= 95 ? 'bg-emerald-50' :
                                    s.confidence >= 85 ? 'bg-emerald-50' :
                                    s.confidence >= 70 ? 'bg-amber-50' : 'bg-rose-50'
                                  }>
                                    {s.name} ({s.code}) — {s.confidence}%
                                  </option>
                                ))}
                              </select>
                              {!classMappings[cn] && (
                                <button
                                  onClick={() => setEditClassNames(prev => { const n = new Set(prev); if (n.has(cn)) n.delete(cn); else n.add(cn); return n })}
                                  className="p-1 rounded hover:bg-amber-200/50 text-amber-600"
                                  title="Tùy chỉnh phân ngành / niên khóa"
                                >
                                  <Settings2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          {!classMappings[cn] && editClassNames.has(cn) && (
                            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-amber-200">
                              <select
                                className="text-xs px-2 py-1 border border-surface-border rounded bg-surface-card"
                                value={nc?.branch || 'ThieuNhi'}
                                onChange={e => setNewClasses(prev => prev.map(n => n.name === cn ? { ...n, branch: e.target.value } : n))}
                              >
                                {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                              </select>
                              <select
                                className="text-xs px-2 py-1 border border-surface-border rounded bg-surface-card"
                                value={nc?.academicYearId || ''}
                                onChange={e => setNewClasses(prev => prev.map(n => n.name === cn ? { ...n, academicYearId: e.target.value } : n))}
                              >
                                {activeAcademicYears.map(a => <option key={a.id} value={a.id}>{a.startDate} - {a.endDate}</option>)}
                              </select>
                            </div>
                          )}
                          {row?.classMatch?.reason && row.classMatch.reason.length > 0 && classMappings[cn] && (
                            <div className="mt-1 text-[10px] text-text-muted flex items-start gap-1">
                              <Info className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                              <span>{row.classMatch.reason.join(' · ')}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {invalidRows.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-text-main mb-2">Lỗi Dữ Liệu ({invalidRows.length} dòng)</h4>
                  <div className="overflow-x-auto border border-surface-border rounded-lg max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse bg-surface-card text-text-main">
                      <thead className="bg-surface-hover text-text-muted uppercase font-semibold sticky top-0">
                        <tr>
                          <th className="p-2 border-b border-surface-border" scope="col">Dòng</th>
                          <th className="p-2 border-b border-surface-border" scope="col">Học Viên</th>
                          <th className="p-2 border-b border-surface-border" scope="col">Lỗi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border bg-surface-card">
                        {invalidRows.map((r: any) => (
                          <tr key={r.rowIndex} className="bg-rose-500/5">
                            <td className="p-2 font-medium">{r.rowIndex}</td>
                            <td className="p-2">{r.fullName || r.holyName}</td>
                            <td className="p-2 text-rose-600">
                              <ul className="list-disc list-inside">
                                {r.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                              </ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 rounded-lg border border-rose-200 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'report' && importResult && (
            <div className="p-6 space-y-6">
              <div className="p-3 bg-surface-app rounded-lg border border-surface-border text-sm">
                <span className="font-semibold text-text-main">
                  {importResult.report?.length || 0} dòng
                </span>
                <span className="text-text-muted"> — </span>
                <span className="text-emerald-700 font-medium">{importResult.imported} đã import</span>
                <span className="text-text-muted">, </span>
                <span className="text-blue-700 font-medium">{importResult.skipped} bỏ qua</span>
                <span className="text-text-muted">, </span>
                <span className="text-rose-700 font-medium">{importResult.errors} lỗi</span>
                {importResult.classesCreated?.length > 0 && (
                  <><span className="text-text-muted">, </span>
                    <span className="text-purple-700 font-medium">{importResult.classesCreated.length} lớp mới</span></>
                )}
                {importResult.report?.filter((r: any) => r.errors?.length > 0).length ? (
                  <><span className="text-text-muted">, </span>
                    <span className="text-amber-700 font-medium">{importResult.report.filter((r: any) => r.errors?.length > 0 && r.status === 'skipped').length} thiếu dữ liệu</span></>
                ) : null}
                <span className="text-text-muted"> — hoàn tất</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200">
                  <div className="text-2xl font-bold text-emerald-600">{importResult.imported}</div>
                  <div className="text-xs text-emerald-700 font-medium">Đã import</div>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200">
                  <div className="text-2xl font-bold text-blue-600">{importResult.skipped}</div>
                  <div className="text-xs text-blue-700 font-medium">Đã bỏ qua</div>
                </div>
                <div className="p-3 bg-rose-50 dark:bg-rose-950 rounded-lg border border-rose-200">
                  <div className="text-2xl font-bold text-rose-600">{importResult.errors}</div>
                  <div className="text-xs text-rose-700 font-medium">Lỗi</div>
                </div>
              </div>

              {importResult.classesCreated?.length > 0 && (
                <div className="text-sm">
                  Đã tạo lớp mới: <strong>{importResult.classesCreated.join(', ')}</strong>
                </div>
              )}

              {/* Undo button */}
              {importResult.imported > 0 && (
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-text-muted">
                    <span className="font-medium text-text-main">Batch ID:</span> {importResult.batchId}
                    <span className="ml-2 text-[10px]">(Có thể hoàn tác trong vòng 10 phút)</span>
                  </div>
                  <button
                    onClick={handleUndo}
                    disabled={undoing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed border border-rose-200 transition-colors"
                  >
                    {undoing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    <span>Hoàn Tác Import</span>
                  </button>
                </div>
              )}

              {importResult.report?.filter((r: any) => r.status === 'error').length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-text-main">Chi Tiết Lỗi</h4>
                    <button
                      onClick={() => {
                        const errorRows = importResult.report.filter((r: any) => r.status === 'error')
                        exportCsv(errorRows, 'import-errors.csv')
                      }}
                      className="flex items-center gap-1 text-xs font-medium text-parish-primary hover:underline"
                    >
                      <Download className="w-3 h-3" /> CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto border border-surface-border rounded-lg max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse bg-surface-card text-text-main">
                      <thead className="bg-surface-hover text-text-muted uppercase font-semibold sticky top-0">
                        <tr>
                          <th className="p-2 border-b border-surface-border" scope="col">Dòng</th>
                          <th className="p-2 border-b border-surface-border" scope="col">Học Viên</th>
                          <th className="p-2 border-b border-surface-border" scope="col">Trạng Thái</th>
                          <th className="p-2 border-b border-surface-border" scope="col">Lỗi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border bg-surface-card">
                        {importResult.report.filter((r: any) => r.status === 'error').map((r: any) => (
                          <tr key={r.rowIndex} className="bg-rose-500/5">
                            <td className="p-2">{r.rowIndex}</td>
                            <td className="p-2">{r.studentName}</td>
                            <td className="p-2 text-rose-600 font-medium">{r.status}</td>
                            <td className="p-2 text-rose-600">{r.errors?.join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm text-text-muted">Import thành công {importResult.imported} học viên.</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const all = importResult.report || []
                      exportCsv(all, 'import-report.csv')
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-parish-primary hover:underline"
                  >
                    <FileDown className="w-3 h-3" /> Tải báo cáo (CSV)
                  </button>
                  <button
                    onClick={loadHistory}
                    className="flex items-center gap-1 text-xs font-medium text-parish-primary hover:underline"
                  >
                    <History className="w-3 h-3" /> Lịch sử import
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'history' && (
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                <History className="w-4 h-4" />
                Lịch Sử Import
              </h3>
              {loadingHistory ? (
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang tải...
                </div>
              ) : history.length === 0 ? (
                <div className="text-sm text-text-muted">Chưa có lịch sử import.</div>
              ) : (
                <div className="space-y-2">
                  {history.map((b: any) => (
                    <div key={b.id}>
                      <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg border border-surface-border">
                        <div className="text-sm">
                          <div className="font-medium">
                            {b.fileName && <span className="text-parish-primary mr-1.5">{b.fileName}</span>}
                            {b.createdAt?.substring(0, 16).replace('T', ' ')}
                            <span className={`ml-2 text-xs font-semibold ${b.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {b.status === 'undone' ? 'Đã hoàn tác' : 'Hoàn tất'}
                            </span>
                          </div>
                          <div className="text-xs text-text-muted mt-0.5">
                            {b.totalRows} dòng · {b.imported} đã import · {b.skipped} bỏ qua · {b.errorCount} lỗi
                            {b.classesCreated && JSON.parse(b.classesCreated).length > 0 && ` · Lớp mới: ${JSON.parse(b.classesCreated).join(', ')}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const detail = await api.getBatchDetail(b.id)
                                setDetailView({ batchId: b.id, rows: detail.rows, counts: detail.counts })
                              } catch { /* ignore */ }
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-parish-primary bg-sky-50 hover:bg-sky-100 border border-sky-200"
                          >
                            Xem
                          </button>
                          {b.status === 'completed' && b.imported > 0 && (
                            <button
                              onClick={async () => {
                                try {
                                  await api.undoImport(b.id)
                                  await askConfirm({
                                    title: 'Hoàn tác thành công',
                                    message: 'Đã hoàn tác import batch này.',
                                    confirmText: 'OK',
                                    variant: 'info',
                                    showCancel: false,
                                  })
                                  loadHistory()
                                } catch (err: any) {
                                  await askConfirm({
                                    title: 'Không thể hoàn tác',
                                    message: err?.message || 'Không thể hoàn tác',
                                    confirmText: 'OK',
                                    variant: 'warning',
                                    showCancel: false,
                                  })
                                }
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200"
                            >
                              <RotateCcw className="w-2.5 h-2.5" /> Hoàn tác
                            </button>
                          )}
                        </div>
                      </div>
                      {detailView && detailView.batchId === b.id && (
                        <div className="mt-1 p-3 bg-surface-card rounded-lg border border-surface-border text-xs">
                          <div className="flex items-center gap-3 mb-2 text-text-muted">
                            <span className="text-emerald-700 font-semibold">Tạo mới: {detailView.counts['created'] || 0}</span>
                            <span className="text-blue-700 font-semibold">Cập nhật: {detailView.counts['updated'] || 0}</span>
                            <span className="text-amber-700 font-semibold">Bỏ qua: {detailView.counts['skipped'] || 0}</span>
                            <span className="text-rose-700 font-semibold">Lỗi: {detailView.counts['error'] || 0}</span>
                          </div>
                          <div className="max-h-32 overflow-y-auto space-y-0.5">
                            {detailView.rows.slice(0, 50).map((r: any) => (
                              <div key={r.id} className="flex items-center gap-2 py-0.5">
                                <span className="text-text-muted w-6 text-right">#{r.rowIndex}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  r.action === 'created' ? 'bg-emerald-100 text-emerald-700' :
                                  r.action === 'updated' ? 'bg-blue-100 text-blue-700' :
                                  r.action === 'skipped' ? 'bg-amber-100 text-amber-700' :
                                  'bg-rose-100 text-rose-700'
                                }`}>{r.action}</span>
                                {r.studentId && <span className="font-mono text-text-muted">{r.studentId}</span>}
                              </div>
                            ))}
                            {detailView.rows.length > 50 && (
                              <div className="text-text-muted text-center pt-1">... và {detailView.rows.length - 50} dòng khác</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setStep('upload')}
                className="text-xs font-medium text-parish-primary hover:underline"
              >
                ← Quay lại import
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-border bg-surface-hover/30">
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:bg-surface-hover transition-colors">
            {step === 'report' || step === 'history' ? 'Đóng' : 'Hủy Bỏ'}
          </button>

          <div className="flex items-center gap-3">
            {step === 'upload' && (
              <button
                onClick={loadHistory}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted hover:bg-surface-hover border border-surface-border transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                Lịch sử
              </button>
            )}
            {step === 'upload' && rawRows.length > 0 && (
              <button
                onClick={handleContinueToReview}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-parish-primary hover:bg-parish-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Kiểm Tra & Tiếp Tục</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {step === 'review' && (
              <button
                onClick={handleImport}
                disabled={loading || validRows.length === 0}
                className="btn btn-primary text-sm font-semibold flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Import Dữ Liệu ({validRows.length} học viên)</span>
              </button>
            )}

            {step === 'report' && (
              <button
                onClick={loadHistory}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted hover:bg-surface-hover border border-surface-border transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                Xem lịch sử
              </button>
            )}
          </div>
        </div>
      </div>
      {confirmDialog}
    </div>
  )
}
