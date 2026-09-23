import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, Trash2, History, ChevronRight } from 'lucide-react'
import { useSyncStore } from '../../stores/syncStore'
import { isEncryptedValue, decryptQueueValue } from '../../lib/offlineCipher'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import type { SyncConflict } from '../../lib/db'
import { ModalShell } from '../common/ModalShell'
import { EmptyState } from '../common/StateFeedback'
// Hợp đồng kiểm thử mobileLayoutContract: ModalShell bao bọc ModalPortal bên trong

interface ConflictInboxModalProps {
  isOpen: boolean
  onClose: () => void
}

/** Format giá trị conflict hiển thị: giải mã ciphertext, pretty-print JSON. */
function formatConflictValue(v: string): string {
  if (v.startsWith('{') || v.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(v), null, 2)
    } catch {
      // fallback: hiển thị nguyên văn
    }
  }
  return v
}

function ConflictValue({ value, tone }: { value: string; tone: 'local' | 'server' }) {
  const [text, setText] = useState('')

  useEffect(() => {
    let cancelled = false
    const resolve = async () => {
      if (!value) {
        if (!cancelled) setText('—')
        return
      }
      if (isEncryptedValue(value)) {
        // A-NEW-24: payload queue/response được mã hóa AES tại-rest; giải mã
        // tại chỗ để hiển thị dữ liệu thật thay vì ciphertext `enc:v1:…`.
        const decrypted = await decryptQueueValue(value)
        if (cancelled) return
        setText(decrypted === null ? '(không giải mã được — khóa cũ hoặc dữ liệu hỏng)' : formatConflictValue(decrypted))
      } else {
        // Legacy plaintext (bản ghi cũ / test mocks)
        if (!cancelled) setText(formatConflictValue(value))
      }
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [value])

  const toneCls =
    tone === 'local'
      ? 'bg-[var(--color-parish-danger-bg)] border-[var(--color-parish-danger)]/20 text-[var(--color-parish-danger-hover)]'
      : 'bg-[var(--color-parish-success-bg)] border-[var(--color-parish-success)]/20 text-[var(--color-parish-success-hover)]'
  return (
    <pre className={`p-2 rounded-lg border overflow-x-auto max-h-20 font-mono whitespace-pre-wrap break-all ${toneCls}`}>
      {text || 'Đang giải mã...'}
    </pre>
  )
}

export const ConflictInboxModal: React.FC<ConflictInboxModalProps> = ({ isOpen, onClose }) => {
  const getConflicts = useSyncStore((s) => s.getConflicts)
  const resolveConflict = useSyncStore((s) => s.resolveConflict)
  const clearResolvedConflicts = useSyncStore((s) => s.clearResolvedConflicts)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [loading, setLoading] = useState(true)
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()

  const loadConflicts = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getConflicts()
      setConflicts(list)
    } catch (err) {
      console.error('Failed to load conflicts:', err)
    } finally {
      setLoading(false)
    }
  }, [getConflicts])

  useEffect(() => {
    if (isOpen) {
      loadConflicts()
    }
  }, [isOpen, loadConflicts])

  const handleResolve = async (id: string) => {
    await resolveConflict(id)
    await loadConflicts()
  }

  const handleClearResolved = async () => {
    const ok = await askConfirm({
      title: 'Dọn dẹp bản ghi xung đột',
      message: 'Xóa tất cả các bản ghi xung đột đã xác nhận?',
      confirmText: 'Xóa',
      variant: 'danger',
    })
    if (!ok) return
    await clearResolvedConflicts()
    await loadConflicts()
  }

  if (!isOpen) return null

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        icon={<History className="w-5 h-5 text-parish-primary" />}
        title="Hộp Thư Xung Đột"
        subtitle="Xem lại các phiên bản đã được hợp nhất và đưa vào hàng đợi thử lại"
        maxWidth="44rem"
      >
        <div className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <div className="w-10 h-10 border-4 border-parish-primary/30 border-t-parish-primary rounded-full animate-spin mb-4" />
              <p className="text-sm font-bold">Đang tải danh sách xung đột...</p>
            </div>
          ) : conflicts.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Mọi thứ đều ổn!"
              description="Không có xung đột dữ liệu nào cần xử lý lúc này."
            />
          ) : (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Lịch sử xung đột gần đây</span>
                <button 
                  onClick={handleClearResolved}
                  className="text-xs font-bold text-parish-primary hover:text-parish-primary-hover flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Dọn dẹp bản ghi đã xem</span>
                </button>
              </div>
              {conflicts.map(c => (
                <div key={c.id} className={`p-4 rounded-2xl border transition-all ${c.resolved ? 'bg-surface-app/50 border-surface-border opacity-70' : 'bg-surface-card border-parish-primary-light shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${c.operation === 'CREATE' ? 'bg-[var(--color-parish-success-bg)] text-[var(--color-parish-success-hover)]' : c.operation === 'UPDATE' ? 'bg-[var(--color-parish-info-bg)] text-[var(--color-parish-info-hover)]' : 'bg-[var(--color-parish-danger-bg)] text-[var(--color-parish-danger-hover)]'}`}>
                        {c.operation}
                      </span>
                      <span className="text-xs font-bold text-text-main uppercase">{c.entity}</span>
                      <span className="text-[10px] text-text-muted font-mono">#{c.entityId}</span>
                    </div>
                    {!c.resolved && (
                      <button 
                        onClick={() => handleResolve(c.id)}
                        className="btn btn-ghost btn-sm text-[10px] font-bold text-parish-primary hover:bg-parish-primary-light px-2 py-1 rounded-lg border border-parish-primary-light transition-colors"
                      >
                        Đã kiểm tra
                      </button>
                    )}
                  </div>
                  {c.entity === 'attendance' && !c.resolved && (
                    <p className="mb-3 text-xs text-text-muted">
                      Lượt điểm danh này đã dừng đồng bộ để bạn đối chiếu hai phiên bản. Hệ thống chưa tự ghi đè dữ liệu trên máy chủ.
                    </p>
                  )}
                  
                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div className="space-y-1">
                      <div className="text-text-muted font-bold flex items-center gap-1">
                        <ChevronRight className="w-3 h-3" />
                        THAY ĐỔI TRÊN THIẾT BỊ
                      </div>
                      <ConflictValue value={c.localValue} tone="local" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-text-muted font-bold flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 text-[var(--color-parish-success)]" />
                        {c.entity === 'attendance' ? 'PHIÊN BẢN MÁY CHỦ KHI XUNG ĐỘT' : 'PHIÊN BẢN MÁY CHỦ DÙNG LÀM NỀN'}
                      </div>
                      <ConflictValue value={c.serverValue} tone="server" />
                    </div>
                  </div>
                  
                  <div className="mt-3 flex items-center justify-between text-[10px] text-text-muted font-medium">
                    <span>Xảy ra lúc: {new Date(c.createdAt).toLocaleString('vi-VN')}</span>
                    {c.resolved && c.resolvedAt && (
                      <span className="text-[var(--color-parish-success)] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Đã xác nhận lúc: {new Date(c.resolvedAt).toLocaleTimeString('vi-VN')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </ModalShell>
      {confirmDialog}
    </>
  )
}
