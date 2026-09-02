import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Badge, Button, TextArea } from '../common/ui'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import { parseParishPersonImport } from '../../utils/parishPersonImport'

interface Props {
  onClose: () => void
}

const EXAMPLE_TEXT = `Giuse, Nguyễn Văn An, 1995, Đang phục vụ, Phục vụ ngành Thiếu từ năm 2018
Maria, Trần Thị Bình, 1998, Đang phục vụ, Giáo lý viên ngành Ấu
Têrêsa, Lê Thị Cúc, 1980, Mãn nhiệm, Cựu Xứ đoàn phó nhiệm kỳ 2012-2016`

export function ParishBulkImportModal({ onClose }: Props) {
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const [inputText, setInputText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const parsedRows = useMemo(() => parseParishPersonImport(inputText), [inputText])

  const validRows = useMemo(() => parsedRows.filter(r => r.valid && r.data), [parsedRows])

  const handleImport = async () => {
    if (validRows.length === 0) return
    setIsSubmitting(true)
    const ok = await store.createPeople(validRows.flatMap(row => row.data ? [row.data] : []))
    setIsSubmitting(false)
    if (!ok) {
      addToast(useParishProfileStore.getState().error || 'Không thể nhập danh sách nhân sự', 'error')
      return
    }
    addToast(`Đã nhập thành công ${validRows.length} hồ sơ nhân sự`, 'success')
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
              disabled={validRows.length === 0 || validRows.length !== parsedRows.length || isSubmitting}
              onClick={handleImport}
            >
              {isSubmitting ? 'Đang nhập an toàn…' : `Nhập ${validRows.length} hồ sơ`}
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
                    <span className="font-bold text-text-main truncate" title={`Dòng ${row.lineNumber}: ${row.raw}`}>
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
                        {row.data?.serviceStatus === 'ACTIVE' ? 'Đang phục vụ' : row.data?.serviceStatus === 'FORMER' ? 'Mãn nhiệm' : 'Qua đời'}
                      </Badge>
                    ) : (
                      <span className="text-xs font-bold text-parish-danger">Dòng {row.lineNumber}: {row.error}</span>
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
