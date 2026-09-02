import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Badge, Button, TextArea } from '../common/ui'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type { ParishPersonInput } from '../../types/parishProfile'

interface Props {
  onClose: () => void
}

interface ParsedRow {
  raw: string
  valid: boolean
  error?: string
  data?: ParishPersonInput
}

const EXAMPLE_TEXT = `Giuse, Nguyễn Văn An, 1995, Đang phục vụ, Phục vụ ngành Thiếu từ năm 2018
Maria, Trần Thị Bình, 1998, Đang phục vụ, Giáo lý viên ngành Ấu
Têrêsa, Lê Thị Cúc, 1980, Mãn nhiệm, Cựu Xứ đoàn phó nhiệm kỳ 2012-2016`

export function ParishBulkImportModal({ onClose }: Props) {
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const [inputText, setInputText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)

  const parsedRows: ParsedRow[] = useMemo(() => {
    if (!inputText.trim()) return []
    const lines = inputText.split('\n').map(l => l.trim()).filter(Boolean)

    return lines.map(line => {
      // Tách theo dấu phẩy hoặc tab
      const parts = line.includes('\t') ? line.split('\t') : line.split(',')
      const cleaned = parts.map(p => p.trim())

      if (cleaned.length === 1 && !cleaned[0]) {
        return { raw: line, valid: false, error: 'Dòng trống' }
      }

      // Xử lý các trường
      // Format 1 (3-5 cột): Tên thánh, Họ và tên, Năm sinh, Trạng thái, Tiểu sử
      // Format 2 (1-2 cột): [Tên thánh] Họ và tên
      let holyName: string | null = null
      let fullName = ''
      let birthYear: number | null = null
      let serviceStatus: 'ACTIVE' | 'FORMER' | 'DECEASED' = 'ACTIVE'
      let biography: string | null = null

      if (cleaned.length >= 2) {
        holyName = cleaned[0] || null
        fullName = cleaned[1] || ''

        if (cleaned[2]) {
          const y = parseInt(cleaned[2], 10)
          if (!isNaN(y) && y > 1900 && y < 2100) {
            birthYear = y
          }
        }

        if (cleaned[3]) {
          const st = cleaned[3].toLowerCase()
          if (st.includes('mãn') || st.includes('cựu') || st.includes('former')) {
            serviceStatus = 'FORMER'
          } else if (st.includes('chết') || st.includes('qua đời') || st.includes('deceased')) {
            serviceStatus = 'DECEASED'
          }
        }

        if (cleaned[4]) {
          biography = cleaned[4]
        }
      } else {
        fullName = cleaned[0] || ''
      }

      if (!fullName) {
        return { raw: line, valid: false, error: 'Thiếu họ và tên' }
      }

      return {
        raw: line,
        valid: true,
        data: {
          linkedUserId: null,
          holyName,
          fullName,
          birthYear,
          biography,
          serviceStatus,
          visibility: 'STAFF',
        },
      }
    })
  }, [inputText])

  const validRows = useMemo(() => parsedRows.filter(r => r.valid && r.data), [parsedRows])

  const handleImport = async () => {
    if (validRows.length === 0) return
    setIsSubmitting(true)
    setProgress(0)

    let successCount = 0
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      if (row.data) {
        const ok = await store.createPerson(row.data)
        if (ok) successCount++
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }

    setIsSubmitting(false)
    addToast(`Đã nhập thành công ${successCount}/${validRows.length} hồ sơ nhân sự`, 'success')
    onClose()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Nhập Danh Sách Huynh Trưởng / GLV Hàng Loạt"
      icon={<FileSpreadsheet className="w-5 h-5 text-parish-primary" />}
      maxWidth="760px"
      closeOnOverlay={!isSubmitting}
      footer={(
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-text-muted">
            {validRows.length} hồ sơ hợp lệ / {parsedRows.length} dòng
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
              Hủy
            </Button>
            <Button
              size="sm"
              leadingIcon={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              disabled={validRows.length === 0 || isSubmitting}
              onClick={handleImport}
            >
              {isSubmitting ? `Đang nhập (${progress}%)…` : `Nhập ${validRows.length} hồ sơ`}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        {/* Hướng dẫn định dạng */}
        <div className="p-3 bg-surface-app rounded-xl border border-surface-border text-xs text-text-muted space-y-1.5">
          <p className="font-bold text-text-main m-0">
            Hướng dẫn định dạng dữ liệu (mỗi người 1 dòng):
          </p>
          <code className="block p-2 bg-surface-sunken rounded-lg text-text-secondary font-mono text-xs">
            Tên thánh, Họ và tên, Năm sinh, Trạng thái (Đang phục vụ / Mãn nhiệm / Qua đời), Tiểu sử
          </code>
          <p className="text-xs m-0">
            Bạn có thể copy trực tiếp các cột từ Microsoft Excel hoặc Google Sheets rồi dán vào ô bên dưới.
          </p>
        </div>

        {/* Ô nhập liệu text */}
        <div>
          <label className="text-xs font-bold text-text-main block mb-1">
            Dán dữ liệu danh sách nhân sự:
          </label>
          <TextArea
            rows={6}
            placeholder={EXAMPLE_TEXT}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            disabled={isSubmitting}
            className="font-mono text-xs"
          />
        </div>

        {/* Bảng xem trước dữ liệu (Preview) */}
        {parsedRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Bản xem trước dữ liệu ({validRows.length} hợp lệ)
              </span>
              {parsedRows.length - validRows.length > 0 && (
                <Badge tone="danger">
                  {parsedRows.length - validRows.length} dòng lỗi
                </Badge>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto border border-surface-border rounded-xl divide-y divide-surface-border bg-surface-card">
              {parsedRows.map((row, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 text-xs flex items-center justify-between gap-2 ${
                    row.valid ? 'bg-surface-card' : 'bg-parish-danger-bg/20 text-parish-danger'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {row.valid ? (
                      <CheckCircle2 size={15} className="text-parish-success shrink-0" />
                    ) : (
                      <AlertCircle size={15} className="text-parish-danger shrink-0" />
                    )}
                    <span className="font-bold text-text-main truncate">
                      {row.data?.holyName && (
                        <span className="text-parish-primary mr-1">{row.data.holyName}</span>
                      )}
                      {row.data?.fullName || row.raw}
                    </span>
                    {row.data?.birthYear && (
                      <span className="text-text-muted shrink-0">({row.data.birthYear})</span>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {row.valid ? (
                      <Badge tone={row.data?.serviceStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                        {row.data?.serviceStatus === 'ACTIVE' ? 'Đang phục vụ' : 'Mãn nhiệm'}
                      </Badge>
                    ) : (
                      <span className="text-xs font-bold text-parish-danger">{row.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
