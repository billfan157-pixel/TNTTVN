import React, { useState, useEffect } from 'react'
import { Upload, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet, RefreshCw, RotateCcw } from 'lucide-react'
import { parseGradeFile, buildGradeRecords, countPreservedRows, type ParsedGradeRow } from '../../utils/excelImporter'
import { loadXlsx } from '../../lib/xlsxLoader'
import { parseGradeText, type ParsedGradeRow as ParsedTextRow } from '../../utils/excelGradeParser'
import { GradeTemplateBuilder } from '../../utils/excelTemplateBuilder'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useSyncStore } from '../../stores/syncStore'
import { api, isAuthenticated } from '../../lib/api'
import { normalizeAcademicYear, getCurrentAcademicYear } from '../../utils/academicYear'
import { calculateGradeAverage } from '../../utils/grades'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { ModalShell } from './ModalShell'
import * as Sentry from '@sentry/react'

interface Props {
  isOpen: boolean
  onClose: () => void
  semester: 1 | 2
}

// ADR-028 (2026-08-12): Snapshot đợt nhập điểm gần nhất (localStorage) — cho phép
// hoàn tác trong vòng UNDO_IMPORT_WINDOW_MS kể cả sau khi đóng modal. Server giữ
// cửa sổ 7 ngày (UNDO_GRADE_WINDOW_DAYS); client chỉ hiện nút khi còn hạn.
const UNDO_IMPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const UNDO_SNAPSHOT_KEY = 'gradeImportSnapshot'

interface UndoSnapshot {
  studentIds: string[]
  semester: 1 | 2
  academicYear: string
  at: number
  count: number
}

function loadUndoSnapshot(): UndoSnapshot | null {
  try {
    const raw = localStorage.getItem(UNDO_SNAPSHOT_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as UndoSnapshot
    if (Date.now() - snap.at > UNDO_IMPORT_WINDOW_MS) return null
    if (!Array.isArray(snap.studentIds) || snap.studentIds.length === 0) return null
    return snap
  } catch {
    return null
  }
}

function saveUndoSnapshot(snap: UndoSnapshot) {
  try {
    localStorage.setItem(UNDO_SNAPSHOT_KEY, JSON.stringify(snap))
  } catch {
    // localStorage đầy/bị chặn — best-effort, không chặn import
  }
}

function clearUndoSnapshot() {
  try {
    localStorage.removeItem(UNDO_SNAPSHOT_KEY)
  } catch {
    // ignore
  }
}

export const ExcelGradeImportModal: React.FC<Props> = ({ isOpen, onClose, semester }) => {
  const [parsedRows, setParsedRows] = useState<ParsedGradeRow[]>([])
  const [fileName, setFileName] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importPhase, setImportPhase] = useState<'idle' | 'local' | 'syncing' | 'done'>('idle')
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)
  const [isUndoing, setIsUndoing] = useState(false)
  const [diagnosticWarnings, setDiagnosticWarnings] = useState<string[]>([])
  const [detectedColumns, setDetectedColumns] = useState<{ field: string; headerName: string; score: number }[]>([])
  // True khi cột điểm được suy luận từ dữ liệu (file thiếu header) — buộc xác nhận khi import
  const [inferredColumns, setInferredColumns] = useState(false)

  const students = useStudentStore((s) => s.students)
  const batchSaveGrades = useGradeStore((s) => s.batchSaveGrades)
  const academicYear = useAcademicYearStore((s) => s.currentYear)
  const syncPendingCount = useSyncStore((s) => s.pendingCount)
  const syncStatus = useSyncStore((s) => s.status)

  const { askConfirm, dialog } = useConfirmDialog()
  useEffect(() => {
    if (importPhase === 'syncing') {
      const checkSync = async () => {
        await useSyncStore.getState().refreshCount()
        if (useSyncStore.getState().pendingCount === 0 && useSyncStore.getState().status === 'idle') {
          setImportPhase('done')
        }
      }
      const interval = setInterval(checkSync, 2000)
      checkSync()
      return () => clearInterval(interval)
    }
  }, [importPhase, syncPendingCount, syncStatus])

  useEffect(() => {
    if (isOpen) setUndoSnapshot(loadUndoSnapshot())
  }, [isOpen])

  if (!isOpen) return null

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setPastedText('')

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (!result || !(result instanceof ArrayBuffer)) return
      // PERF-XLSX-1: parseGradeFile async (lazy-load xlsx) — giữ nguyên error UX ADR-018.
      void (async () => {
        try {
          // ADR-018 (import/export audit): Bắt lỗi file hỏng (corrupt .xlsx/.xls/.csv)
          // — trước đây parseGradeFile ném im lặng, không có feedback cho người dùng.
          const { rows, diagnostics } = await parseGradeFile(result, students)
        setParsedRows(rows)
        setInferredColumns(false)
        if (diagnostics) {
          setDetectedColumns(diagnostics.detections.map(d => ({ field: d.field, headerName: d.headerName, score: d.score })))
          const warnings: string[] = []
          for (const ic of diagnostics.ignoredColumns) {
            warnings.push(`Cột "${ic.headerName}" bị bỏ qua (cột tính toán)`)
          }
          setDiagnosticWarnings(warnings)
        } else {
          setDetectedColumns([])
          setDiagnosticWarnings([])
        }
      } catch (err) {
        Sentry.captureException(err)
        setParsedRows([])
        void askConfirm({
          title: 'Không đọc được file',
          message: 'Không thể đọc file. Vui lòng kiểm tra file Excel/CSV có đúng định dạng không.',
          confirmText: 'OK',
          variant: 'info',
          showCancel: false,
        })
      }
      })()
    }
    reader.onerror = () => {
      setParsedRows([])
      void askConfirm({
        title: 'Lỗi đọc file',
        message: 'Không thể đọc file. Vui lòng thử lại với file khác.',
        confirmText: 'OK',
        variant: 'info',
        showCancel: false,
      })
    }
    reader.readAsArrayBuffer(file)
  }

  const handlePasteText = (text: string) => {
    setPastedText(text)
    if (!text.trim()) {
      setParsedRows([])
      return
    }
    const result = parseGradeText(text, students)
    // Capture diagnostics from paste path
    setDetectedColumns((result.detectedColumns || []).map((d: { field: string; headerName: string; score: number }) => ({ field: d.field, headerName: d.headerName, score: d.score })))
    setDiagnosticWarnings(result.diagnosticWarnings || [])
    setInferredColumns(!!result.inferred)
    const convertedRows: ParsedGradeRow[] = (result.rows || []).map((r: ParsedTextRow) => ({
      // ADR-018 (import/export audit #11): Dùng rowIndex thật từ parser paste
      // (bắt đầu từ 2 khi có header) — trước đây idx + 1 bắt đầu từ 1, lệch với
      // đường file upload (i + 2) gây nhầm lẫn khi đối chiếu lỗi với dòng nguồn.
      rowNum: r.rowIndex + 1,
      studentCode: r.studentCode || r.matchedStudent?.code || '',
      studentName: r.matchedStudent
        ? `${r.matchedStudent.holyName || ''} ${r.matchedStudent.fullName || ''}`.trim()
        : r.fullName,
      matchedStudent: r.matchedStudent || null,
      scoreOral: r.scoreOral,
      score15m: r.score15m,
      score1Period: r.score1Period,
      scoreMidterm: r.scoreMidterm,
      scoreFinal: r.scoreFinal,
      scoreDaoDuc: r.scoreDaoDuc,
      comments: r.comments,
      isValid: r.isValid,
      errors: r.errors,
      warnings: r.warnings,
    }))
    setParsedRows(convertedRows)
  }

  const handleImport = async () => {
    // CRITICAL-2 (import audit): File không có dòng header → cột điểm bị suy luận
    // từ dữ liệu (độ tin cậy thấp, có thể gán sai cột như STT → Miệng). Bắt buộc
    // người dùng xác nhận trước khi nhập — không auto-import im lặng.
    if (inferredColumns) {
      const ok = await askConfirm({
        title: 'Cảnh báo cột suy luận',
        message:
          'File không có dòng tiêu đề — các cột điểm được suy luận từ dữ liệu và có thể bị gán sai cột (ví dụ: cột STT bị nhầm thành điểm).\n\nVui lòng kiểm tra kỹ mục "Cột Đã Nhận Diện" và bảng preview bên trên.\n\nBạn vẫn muốn tiếp tục nhập?',
        confirmText: 'Tiếp tục nhập',
        variant: 'warning',
      })
      if (!ok) return
    }

    setIsImporting(true)
    setImportPhase('local')
    try {
      const records = buildGradeRecords(parsedRows, semester, academicYear)
      const online = typeof navigator !== 'undefined' && navigator.onLine && isAuthenticated()
      const yearNorm = normalizeAcademicYear(academicYear) || getCurrentAcademicYear()

      // F6 (audit): Chống import trùng — trước đây gọi batchSaveGrades trực tiếp,
      // /check-import-duplicate + /register-import hoàn toàn không ai gọi, nên
      // import lại file cũ ghi đè điểm im lặng. Online: check trước, cảnh báo,
      // register sau khi lưu. Offline: check cục bộ dựa trên grades đang có trong
      // store (không thể gọi server) — nếu bất kỳ record nào trùng student+semester+year
      // với grade hiện có thì cảnh báo ghi đè, tránh mất dữ liệu im lặng.
      if (online) {
        const hash = await computeImportHash(records)
        const classIds = deriveImportClassIds(records, useStudentStore.getState().students)
        let isDuplicate = false
        let dupWhen = ''
        let dupRows = 0
        for (const classId of classIds) {
          try {
            const dup = await api.checkGradeImportDuplicate({ hash, classId, semester, academicYear: yearNorm })
            if (dup.isDuplicate) {
              isDuplicate = true
              dupWhen = dup.importedAt ? new Date(dup.importedAt).toLocaleString('vi-VN') : 'trước đó'
              dupRows = dup.totalRows ?? records.length
              break
            }
          } catch {
            // best-effort: lỗi check không chặn import
          }
        }
        if (isDuplicate) {
          const ok = await askConfirm({
            title: 'Phát hiện import trùng',
            message: `File này đã được nhập ${dupWhen} (${dupRows} dòng).\n\nNhập lại sẽ GHI ĐÈ điểm hiện tại của các học sinh trong file.\n\nBạn vẫn muốn tiếp tục?`,
            confirmText: 'Vẫn nhập (ghi đè)',
            variant: 'danger',
          })
          if (!ok) {
            setIsImporting(false)
            setImportPhase('idle')
            return
          }
        }
      } else {
        // Offline: kiểm tra cục bộ — nếu record trùng student+semester+year với
        // grade đang có trong store thì cảnh báo ghi đè (không thể gọi server).
        // Defensive: nếu store chưa expose getStudentGrade (test/mock) thì bỏ qua
        // check cục bộ, không chặn import.
        const gradeStore = useGradeStore.getState() as any
        if (typeof gradeStore.getStudentGrade === 'function') {
          const overwriteCount = records.filter((r) => {
            const existing = gradeStore.getStudentGrade(r.studentId, semester, yearNorm)
            return existing && Object.keys(r).some((k) => k.startsWith('score') && (r as any)[k] !== undefined)
          }).length
          if (overwriteCount > 0) {
            const ok = await askConfirm({
              title: 'Cảnh báo ghi đè (offline)',
              message: `${overwriteCount} học sinh trong file đã có điểm cho học kỳ này.\n\nNhập lại sẽ GHI ĐÈ điểm hiện tại của các học sinh đó.\n\nBạn vẫn muốn tiếp tục?`,
              confirmText: 'Vẫn nhập (ghi đè)',
              variant: 'danger',
            })
            if (!ok) {
              setIsImporting(false)
              setImportPhase('idle')
              return
            }
          }
        }
      }

      batchSaveGrades(records)

      // ADR-028: Ghi snapshot cho nút "Hoàn tác" — cần studentIds của đợt nhập
      // (client không biết server gradeId; server tra studentId + HK + năm).
      saveUndoSnapshot({
        studentIds: records.map((r) => r.studentId),
        semester,
        academicYear: yearNorm,
        at: Date.now(),
        count: records.length,
      })
      setUndoSnapshot(loadUndoSnapshot())

      if (online) {
        setImportPhase('syncing')
        try {
          const hash = await computeImportHash(records)
          const classIds = deriveImportClassIds(records, useStudentStore.getState().students)
          for (const classId of classIds) {
            await api.registerGradeImport({ hash, classId, semester, academicYear: yearNorm, totalRows: records.length })
          }
        } catch {
          // best-effort: không fail nếu register thất bại
        }
      } else {
        setImportPhase('done')
      }

      // Không tự đóng modal — hiển thị trạng thái đồng bộ để người dùng biết
    } catch (err) {
      Sentry.captureException(err)
      void askConfirm({
        title: 'Lỗi nhập điểm',
        message: 'Có lỗi xảy ra khi nhập dữ liệu điểm. Vui lòng thử lại!',
        confirmText: 'OK',
        variant: 'danger',
        showCancel: false,
      })
      setIsImporting(false)
      setImportPhase('idle')
    }
  }

  const validCount = parsedRows.filter((r) => r.isValid).length
  const invalidCount = parsedRows.filter((r) => !r.isValid).length

  // ADR-028 (2026-08-12): Hoàn tác đợt nhập điểm gần nhất — server đảo ngược lần
  // ghi (CREATE → xóa, UPDATE → về trạng thái trước import), chỉ trong 7 ngày và
  // khi chưa có thay đổi khác sau đợt nhập. Sau undo: refetch điểm để UI đồng bộ.
  const handleUndoImport = async () => {
    if (!undoSnapshot) return
    const online = typeof navigator !== 'undefined' && navigator.onLine && isAuthenticated()
    if (!online) {
      void askConfirm({
        title: 'Cần kết nối mạng',
        message: 'Cần kết nối mạng để hoàn tác đợt nhập điểm.',
        confirmText: 'OK',
        variant: 'warning',
        showCancel: false,
      })
      return
    }
    const ok = await askConfirm({
      title: 'Hoàn tác đợt nhập điểm',
      message:
        `Hoàn tác đợt nhập điểm trước (${undoSnapshot.count} học sinh, học kỳ ${undoSnapshot.semester})?\n\n` +
        'Điểm sẽ trả về trạng thái trước khi nhập. Các chỉnh sửa tay sau đợt nhập sẽ không bị ảnh hưởng.\n\n' +
        'Bạn có chắc chắn muốn hoàn tác?',
      confirmText: 'Hoàn tác',
      variant: 'danger',
    })
    if (!ok) return
    setIsUndoing(true)
    try {
      const res = await api.undoGradeImport({
        semester: undoSnapshot.semester,
        academicYear: undoSnapshot.academicYear,
        studentIds: undoSnapshot.studentIds,
      })
      const okCount = res?.results?.filter((r) => r.status === 'restored' || r.status === 'deleted').length ?? 0
      const skipped = (res?.results ?? []).filter((r) => r.status !== 'restored' && r.status !== 'deleted')
      if (okCount > 0) {
        void askConfirm({
          title: 'Hoàn tác thành công',
          message: `Đã hoàn tác ${okCount} bản ghi điểm.`,
          confirmText: 'OK',
          variant: 'info',
          showCancel: false,
        })
        clearUndoSnapshot()
        setUndoSnapshot(null)
        useGradeStore.getState().fetchGrades()
        onClose()
      } else {
        const first = skipped[0]
        void askConfirm({
          title: 'Không thể hoàn tác',
          message:
            `Không thể hoàn tác: ${first?.message ?? 'đã có thay đổi khác sau đợt nhập hoặc hết hạn 7 ngày'}. ` +
            'Vui lòng sửa trực tiếp trên bảng điểm nếu cần.',
          confirmText: 'OK',
          variant: 'warning',
          showCancel: false,
        })
      }
    } catch {
      void askConfirm({
        title: 'Lỗi hoàn tác',
        message: 'Có lỗi xảy ra khi hoàn tác. Vui lòng thử lại!',
        confirmText: 'OK',
        variant: 'danger',
        showCancel: false,
      })
    } finally {
      setIsUndoing(false)
    }
  }

  const downloadTemplateAction = (
    <button
      type="button"
      aria-label="Tải file mẫu"
      onClick={() => {
        void (async () => {
          const XLSX = await loadXlsx()
          const wb = await GradeTemplateBuilder.createWorksheet('Lớp', students)
          XLSX.writeFile(wb, `Mau_Nhap_Diem_${academicYear}.xlsx`)
        })()
      }}
      className="btn btn-secondary btn-sm"
    >
      <Upload className="w-3.5 h-3.5 rotate-180" />
      <span className="hidden sm:inline">Tải File Mẫu</span>
    </button>
  )

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs">
        {importPhase === 'local' && (
          <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
            Đã lưu cục bộ, chuẩn bị đồng bộ...
          </span>
        )}
        {importPhase === 'syncing' && (
          <span className="flex items-center gap-1.5 text-sky-700 bg-sky-50 px-2 py-1 rounded-lg border border-sky-200">
            <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" />
            Đang đồng bộ {syncPendingCount > 0 ? `(${syncPendingCount} bản ghi)` : ''}...
          </span>
        )}
        {importPhase === 'done' && (
          <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Đã lưu cục bộ {syncPendingCount > 0 ? `· ${syncPendingCount} bản ghi đang đồng bộ nền` : '· Đã đồng bộ xong'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
        {undoSnapshot && importPhase !== 'local' && importPhase !== 'syncing' && (
          <button
            onClick={handleUndoImport}
            disabled={isUndoing}
            title={`Hoàn tác đợt nhập ${undoSnapshot.count} bản ghi (học kỳ ${undoSnapshot.semester}) — hiệu lực 7 ngày`}
            className="btn btn-secondary col-span-2 text-rose-700 dark:text-rose-300 disabled:opacity-50"
          >
            {isUndoing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            <span>Hoàn Tác ({undoSnapshot.count})</span>
          </button>
        )}
        <button
          onClick={onClose}
          disabled={importPhase === 'local' || importPhase === 'syncing'}
          className="btn btn-secondary disabled:opacity-50"
        >
          {importPhase === 'local' || importPhase === 'syncing' ? 'Đang xử lý...' : 'Đóng'}
        </button>
        <button
          onClick={handleImport}
          disabled={validCount === 0 || isImporting}
          className="btn btn-primary"
        >
          {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>Nhập {validCount} Bản Ghi</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Import Bảng Điểm Lớp Từ Excel"
        subtitle={`Hỗ trợ .xlsx, .xls, .csv hoặc dán trực tiếp — Học Kỳ ${semester} (${academicYear})`}
        icon={<FileSpreadsheet className="w-5 h-5" />}
        headerActions={downloadTemplateAction}
        maxWidth="1024px"
        closeOnOverlay={false}
        footer={footer}
      >
        <div className="space-y-6">
          {/* Options: Upload vs Paste */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                Option 1: Tải File Excel Từ Máy Tính
              </label>
              <label className="flex items-center gap-2 px-4 py-2.5 bg-surface-hover hover:bg-surface-hover/80 text-text-main text-sm font-medium rounded-lg cursor-pointer border border-surface-border transition-colors">
                <Upload className="w-4 h-4 text-parish-primary" />
                <span className="truncate">{fileName || 'Chọn file .xlsx / .xls / .csv...'}</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
              </label>
              <p className="mt-1 text-[11px] text-text-muted">
                Cần có cột "Mã TN" / "Họ và Tên" và các cột điểm (Miệng, 15P, 1 Tiết, Giữa Kỳ, Cuối Kỳ, Đạo Đức)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                Option 2: Dán Copy Trực Tiếp Từ Excel
              </label>
              <div className="relative">
                <textarea
                  value={pastedText}
                  onChange={(e) => handlePasteText(e.target.value)}
                  placeholder="Dán các cột copy từ bảng Excel vào đây... (Ví dụ: Mã TN	Họ và Tên	Miệng	15P	1T	GK	CK	Đạo Đức)"
                  rows={2}
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-xs font-mono text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                />
              </div>
            </div>
          </div>

          {/* Column Detection Summary */}
          {inferredColumns && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Không tìm thấy dòng tiêu đề — các cột điểm được suy luận từ dữ liệu.</p>
                <p className="mt-0.5 text-rose-600 dark:text-rose-400">
                  Độ tin cậy thấp, cột có thể bị gán sai (ví dụ: STT thành Điểm Miệng). Kiểm tra kỹ danh sách cột bên dưới.
                  Khi nhấn "Nhập", bạn sẽ được yêu cầu xác nhận thêm một lần.
                </p>
              </div>
            </div>
          )}
          {detectedColumns.length > 0 && (
            <div className="p-3 bg-sky-50 dark:bg-sky-950/30 rounded-lg border border-sky-200 dark:border-sky-800 space-y-1.5">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 uppercase">Cột Đã Nhận Diện</p>
              <div className="flex flex-wrap gap-1.5">
                {detectedColumns.map((col, idx) => {
                  const fieldLabels: Record<string, string> = {
                    studentCode: 'Mã TN', studentName: 'Họ Tên', holyName: 'Tên Thánh',
                    lastName: 'Họ', firstName: 'Tên',
                    scoreOral: 'Miệng', score15m: '15P', score1Period: '1 Tiết',
                    scoreMidterm: 'Giữa Kỳ', scoreFinal: 'Cuối Kỳ', scoreDaoDuc: 'Đạo Đức',
                    comments: 'Ghi Chú',
                  }
                  return (
                    <span key={idx} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      col.score >= 80 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                    }`}>
                      <span>{col.score >= 80 ? '✅' : '⚠️'}</span>
                      <span>{fieldLabels[col.field] || col.field}</span>
                      <span className="opacity-60">← "{col.headerName}"</span>
                    </span>
                  )
                })}
              </div>
              {diagnosticWarnings.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {diagnosticWarnings.map((w, idx) => (
                    <p key={idx} className="text-[11px] text-amber-600 dark:text-amber-400">⚠ {w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Validation Summary */}
          {parsedRows.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-surface-hover/40 rounded-lg border border-surface-border">
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> {validCount} Dòng Hợp Lệ
                </span>
                {invalidCount > 0 && (
                  <span className="flex items-center gap-1 text-rose-600 font-semibold">
                    <AlertCircle className="w-4 h-4" /> {invalidCount} Dòng Không Khớp Học Sinh Hoặc Lỗi
                  </span>
                )}
              </div>
              <span className="text-xs text-text-muted">Tổng số: {parsedRows.length} dòng</span>
            </div>
          )}
          {parsedRows.length > 0 && countPreservedRows(parsedRows) > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>⚠ {countPreservedRows(parsedRows)} học sinh có ô điểm để trống — điểm cũ của các ô này sẽ được giữ nguyên, không bị xóa.</span>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="overflow-x-auto border border-surface-border rounded-lg max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse bg-surface-card text-text-main">
                <thead className="bg-surface-hover text-text-muted uppercase font-semibold sticky top-0">
                  <tr>
                    <th className="p-2 border-b border-surface-border text-center" scope="col">Trạng thái</th>
                    <th className="p-2 border-b border-surface-border" scope="col">Học sinh</th>
                    <th className="p-2 border-b border-surface-border text-center" scope="col">Miệng</th>
                    <th className="p-2 border-b border-surface-border text-center" scope="col">15 Phút</th>
                    <th className="p-2 border-b border-surface-border text-center" scope="col">1 Tiết</th>
                    <th className="p-2 border-b border-surface-border text-center" scope="col">Giữa Kỳ</th>
                    <th className="p-2 border-b border-surface-border text-center" scope="col">Cuối Kỳ</th>
                    <th className="p-2 border-b border-surface-border text-center" scope="col">Đạo Đức</th>
                    <th className="p-2 border-b border-surface-border text-center" scope="col">ĐTB Dự Kiến</th>
                    <th className="p-2 border-b border-surface-border" scope="col">Ghi Chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border bg-surface-card">
                  {parsedRows.map((r, idx) => {
                    const name = r.matchedStudent
                      ? `${r.matchedStudent.holyName || ''} ${r.matchedStudent.fullName || ''}`.trim()
                      : r.studentName || `Dòng ${r.rowNum}`

                    const avgRes = calculateGradeAverage({
                      scoreOral: r.scoreOral,
                      score15m: r.score15m,
                      score1Period: r.score1Period,
                      scoreMidterm: r.scoreMidterm,
                      scoreFinal: r.scoreFinal,
                    })

                    return (
                      <tr key={idx} className={r.isValid ? 'hover:bg-surface-hover/20' : 'bg-rose-500/10'}>
                        <td className="p-2 text-center">
                          {r.isValid ? (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-full flex items-center justify-center gap-1">
                              OK
                              {r.warnings && r.warnings.length > 0 && (
                                <span className="text-amber-600 dark:text-amber-400" title={r.warnings.join('\n')}>
                                  ⚠️
                                </span>
                              )}
                            </span>
                          ) : (
                            <span
                              className="px-2 py-0.5 text-[10px] font-semibold bg-rose-100 dark:bg-rose-950 text-rose-600 rounded-full"
                              title={r.errors.join(', ')}
                            >
                              {r.errors[0] || 'Lỗi'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-semibold text-text-main whitespace-nowrap">
                          {name}
                          {r.warnings && r.warnings.length > 0 && (
                            <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400 truncate max-w-[200px]" title={r.warnings.join(', ')}>
                              {r.warnings.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-center text-text-main font-bold">{r.scoreOral ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.score15m ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.score1Period ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.scoreMidterm ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.scoreFinal ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.scoreDaoDuc ?? '—'}</td>
                        <td className="p-2 text-center">
                          {avgRes.score !== null ? (
                            <span className="font-extrabold text-emerald-600">{avgRes.score}</span>
                          ) : (
                            <span className="text-text-muted italic">—</span>
                          )}
                        </td>
                        <td className="p-2 text-text-muted max-w-[150px] truncate">{r.comments || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ModalShell>
      {dialog}
    </>
  )
}

/**
 * F6 (audit): Trả về TẤT CẢ classId có trong file import (không chỉ class chiếm
 * đa số). Trước đây chỉ dùng classId đa số → file đa lớp bỏ sót duplicate check
 * cho các lớp còn lại, ghi đè im lặng. Giờ check/register cho từng lớp.
 */
function deriveImportClassIds(records: Array<{ studentId: string }>, students: ReturnType<typeof useStudentStore.getState>['students']): string[] {
  const ids = new Set<string>()
  for (const r of records) {
    const s = students.find((x) => x.id === r.studentId)
    if (s?.classId) ids.add(s.classId)
  }
  return ids.size > 0 ? Array.from(ids) : ['all']
}

/** F6 (audit): Hash ổn định của nội dung import (mã HS + điểm + comments + HK + năm), dùng cho phát hiện trùng. */
async function computeImportHash(
  records: Array<{ studentId: string; scoreOral?: number | null; score15m?: number | null; score1Period?: number | null; scoreMidterm?: number | null; scoreFinal?: number | null; scoreDaoDuc?: number | null; comments?: string }>
): Promise<string> {
  const payload = JSON.stringify(
    records.map((r) => [r.studentId, r.scoreOral, r.score15m, r.score1Period, r.scoreMidterm, r.scoreFinal, r.scoreDaoDuc, r.comments ?? ''])
  )
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    // fallback bên dưới
  }
  let h = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `fnv-${h.toString(16)}`
}
