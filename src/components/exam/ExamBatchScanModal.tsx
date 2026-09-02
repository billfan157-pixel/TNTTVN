import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FolderOpen, Images, Loader2, Save, X } from 'lucide-react'
import { analyzeBatchExamImage, type BatchScanAnalysis } from '../../lib/examBatchScan'
import { clearOmrScratchBuffers } from '../../lib/omr'
import { imageFileToImageData } from '../../lib/imageFile'
import { normalizeAnswerVariants } from '../../lib/examVariants'
import { useExamStore } from '../../stores/examStore'
import type { ExamSession, ExamVersionCode } from '../../types'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { ModalPortal } from '../common/ModalPortal'
import { StudentName } from '../common/StudentName'

interface BatchItem extends BatchScanAnalysis {
  id: string
  fileName: string
  studentName?: string
  holyName?: string | null
  overwritesExisting?: boolean
}

interface ExamBatchScanModalProps {
  session: ExamSession
  students: Array<{ id: string; code: string; name: string; holyName?: string | null }>
  onClose: () => void
}

const BATCH_UI_COMMIT_SIZE = 8
const BATCH_MAIN_THREAD_YIELD_SIZE = 1

export const ExamBatchScanModal: React.FC<ExamBatchScanModalProps> = ({ session, students, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const processingGenerationRef = useRef(0)
  const { results, saveScores, saving, error } = useExamStore()
  const [items, setItems] = useState<BatchItem[]>([])
  const { dialogRef: trapRef } = useAccessibleDialog(true, onClose)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [message, setMessage] = useState('')

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
    folderInputRef.current?.setAttribute('directory', '')
    return () => {
      processingGenerationRef.current += 1
      clearOmrScratchBuffers()
    }
  }, [])

  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students])
  const existingIds = useMemo(() => new Set(results.map(result => result.studentId)), [results])
  const answerVariants = useMemo(
    () => normalizeAnswerVariants(session.answerVariants, session.answerKey, session.questionCount),
    [session.answerVariants, session.answerKey, session.questionCount],
  )
  const accepted = items.filter(item => item.status === 'accepted' && item.studentId && item.score !== undefined)
  const reviews = items.filter(item => item.status === 'review_required')
  const rejected = items.filter(item => item.status === 'rejected')

  const processFiles = async (files: FileList | null) => {
    const selected = Array.from(files ?? []).filter(file => file.type.startsWith('image/'))
    if (selected.length === 0) {
      setMessage('Không có file ảnh hợp lệ. Batch hiện nhận JPG, PNG, WEBP hoặc ảnh do máy scan xuất ra.')
      return
    }
    if (selected.length > 500) {
      setMessage('Mỗi batch tối đa 500 ảnh để tránh trình duyệt điện thoại hết bộ nhớ.')
      return
    }
    const processingGeneration = ++processingGenerationRef.current
    setProcessing(true)
    setMessage('')
    setItems([])
    setProgress({ done: 0, total: selected.length })
    const next: BatchItem[] = []
    const seenStudents = new Set<string>()
    const allowedStudentIds = new Set(students.map(student => student.id))
    try {
      for (let index = 0; index < selected.length; index++) {
        const file = selected[index]
        let analysis: BatchScanAnalysis
        try {
          const image = await imageFileToImageData(file)
          if (processingGenerationRef.current !== processingGeneration) return
          analysis = analyzeBatchExamImage(image, {
            sessionId: session.id,
            examType: session.examType ?? 'written',
            questionCount: session.questionCount ?? 20,
            maxScore: session.maxScore,
            answerVariants,
            defaultTemplateMode: 'full_page',
            allowedStudentIds,
          })
        } catch (cause) {
          if (processingGenerationRef.current !== processingGeneration) return
          analysis = { status: 'rejected', reason: cause instanceof Error ? cause.message : 'Không xử lý được file ảnh.' }
        }
        if (analysis.status === 'accepted' && analysis.studentId) {
          if (seenStudents.has(analysis.studentId)) {
            analysis = { ...analysis, status: 'rejected', reason: 'Trùng thiếu nhi trong cùng batch; chỉ giữ ảnh hợp lệ đầu tiên.' }
          } else {
            seenStudents.add(analysis.studentId)
          }
        }
        const student = analysis.studentId ? studentById.get(analysis.studentId) : undefined
        next.push({
          ...analysis,
          id: `${file.name}-${file.lastModified}-${index}`,
          fileName: file.webkitRelativePath || file.name,
          studentName: student ? student.name : undefined,
          holyName: student ? student.holyName : undefined,
          overwritesExisting: Boolean(analysis.studentId && existingIds.has(analysis.studentId)),
        })
        const done = index + 1
        // Không clone/render lại mảng tăng dần sau từng ảnh (O(n²) cho batch 500).
        // Commit theo chunk nhưng vẫn yield đều để progress/cancel của browser
        // không bị OMR đồng bộ chiếm main thread quá lâu.
        if (done % BATCH_UI_COMMIT_SIZE === 0 || done === selected.length) {
          setItems([...next])
          setProgress({ done, total: selected.length })
        }
        if (done % BATCH_MAIN_THREAD_YIELD_SIZE === 0 || done === selected.length) {
          await new Promise(resolve => setTimeout(resolve, 0))
          if (processingGenerationRef.current !== processingGeneration) return
        }
      }
    } finally {
      clearOmrScratchBuffers()
      if (processingGenerationRef.current === processingGeneration) setProcessing(false)
    }
  }

  const closeModal = () => {
    processingGenerationRef.current += 1
    clearOmrScratchBuffers()
    onClose()
  }

  const saveAccepted = async () => {
    const payload = accepted.map(item => ({
      studentId: item.studentId!,
      score: item.score!,
      source: 'qr_scan',
      answers: item.answers,
      scanMetadata: item.scanMetadata,
      examVersion: item.examVersion ?? 'A' as ExamVersionCode,
    }))
    const saved = await saveScores(payload)
    if (!saved) return
    const adjusted = saved.adjustments?.length ?? 0
    setMessage(`Đã ghi ${payload.length} kết quả (${saved.saved} mới, ${saved.upserted} cập nhật${adjusted > 0 ? `, ${adjusted} điểm được server tính lại` : ''}). ${reviews.length + rejected.length} ảnh ngoại lệ không được ghi.`)
    setItems(current => current.filter(item => item.status !== 'accepted'))
  }

  return (
    <ModalPortal>
    <div role="dialog" aria-modal="true" aria-labelledby="batch-scan-title" className="app-modal-layer fixed inset-0 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={closeModal}>
      <div ref={trapRef} className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h4 id="batch-scan-title" className="m-0 font-black text-parish-primary">Chấm hàng loạt từ ảnh</h4>
            <p className="m-0 text-[11px] text-text-muted">Đọc tuần tự, không lưu hoặc tải ảnh gốc lên mạng, ngoại lệ không tự ghi điểm.</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={closeModal}><X size={15} /> Đóng</button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-surface-border p-3">
          <button type="button" className="btn btn-secondary min-h-11" disabled={processing || saving} onClick={() => fileInputRef.current?.click()}><Images size={17} /> Chọn nhiều ảnh</button>
          <button type="button" className="btn btn-secondary min-h-11" disabled={processing || saving} onClick={() => folderInputRef.current?.click()}><FolderOpen size={17} /> Chọn thư mục</button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={event => void processFiles(event.target.files)} />
          <input ref={folderInputRef} type="file" accept="image/*" multiple className="hidden" onChange={event => void processFiles(event.target.files)} />
          {progress.total > 0 && <span className="self-center text-sm font-bold text-text-muted">{processing ? 'Đang xử lý' : 'Đã xử lý'} {progress.done}/{progress.total}</span>}
        </div>

        {processing && <div className="h-1 bg-surface-hover"><div className="h-full bg-parish-primary transition-all" style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }} /></div>}

        {(message || error) && <div role="status" className="mx-3 mt-3 rounded-xl border border-surface-border bg-surface-app px-3 py-2 text-sm font-semibold text-text-main">{message || error}</div>}

        <div className="grid grid-cols-3 gap-2 p-3 text-center text-xs font-bold">
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-700">Sẵn sàng lưu<br /><span className="text-xl">{accepted.length}</span></div>
          <div className="rounded-xl bg-amber-500/10 p-2 text-amber-700">Cần quét riêng<br /><span className="text-xl">{reviews.length}</span></div>
          <div className="rounded-xl bg-red-500/10 p-2 text-red-700">Bị từ chối<br /><span className="text-xl">{rejected.length}</span></div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto border-y border-surface-border">
          {items.length === 0 ? (
            <p className="p-8 text-center text-sm text-text-muted">Chọn nhiều ảnh hoặc một thư mục ảnh scan để bắt đầu.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-surface-card text-left text-xs text-text-muted"><tr><th className="p-2">File</th><th className="p-2">Thiếu nhi</th><th className="p-2">Mã đề</th><th className="p-2">Điểm</th><th className="p-2">Kết quả</th></tr></thead>
              <tbody>{items.map(item => (
                <tr key={item.id} className="border-t border-surface-border align-top">
                  <td className="max-w-64 break-all p-2 text-xs">{item.fileName}</td>
                  <td className="p-2 font-semibold">
                    {item.studentName ? (
                      <StudentName holyName={item.holyName} fullName={item.studentName} size="sm" />
                    ) : (
                      item.studentId ?? '—'
                    )}
                    {item.overwritesExisting && <div className="text-[10px] text-amber-600 font-bold">Sẽ cập nhật điểm cũ</div>}
                  </td>
                  <td className="p-2 font-black">{item.examVersion ?? '—'}</td>
                  <td className="p-2 font-black text-parish-primary">{item.score ?? '—'}</td>
                  <td className="p-2"><span className={`inline-flex items-center gap-1 font-bold ${item.status === 'accepted' ? 'text-emerald-600' : item.status === 'review_required' ? 'text-amber-600' : 'text-red-600'}`}>{item.status === 'accepted' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{item.reason}</span></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-[11px] text-text-muted">Batch chỉ nhận ảnh có QR/Code128 đúng phiên. Ảnh mờ, chói, tô nhiều ô hoặc mã trùng được đưa vào ngoại lệ.</p>
          <button type="button" className="btn btn-primary min-h-11 justify-center" disabled={processing || saving || accepted.length === 0} onClick={() => void saveAccepted()}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Lưu {accepted.length} kết quả đạt</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
