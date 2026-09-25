import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, Copy, Inbox, KeyRound, Loader2, ShieldCheck, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDateTimeVi } from '../../utils/formatDate'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { ModalShell } from '../common/ModalShell'
import { Button } from '../common/ui/Button'

interface PasswordResetRequest {
  id: string
  userId: string
  fullName: string
  username: string
  phone: string | null
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  requestCount: number
  lastRequestedAt: string
}

interface ResetCredential {
  username: string
  tempPassword: string
  fullName: string
}

export function PasswordResetRequestsPanel({ onUsersRefresh }: { onUsersRefresh?: () => void | Promise<void> }) {
  const [requests, setRequests] = useState<PasswordResetRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<PasswordResetRequest | null>(null)
  const [adminPassword, setAdminPassword] = useState('')
  const [identityVerified, setIdentityVerified] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState('')
  const [credential, setCredential] = useState<ResetCredential | null>(null)
  const [copied, setCopied] = useState(false)
  // UX-FEEDBACK-1: "Bỏ qua" gọi server nhưng trước đây không có phản hồi/không chặn bấm lặp.
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const { askConfirm, dialog } = useConfirmDialog()

  async function loadRequests() {
    setLoading(true)
    setLoadError('')
    try {
      setRequests(await api.getPasswordResetRequests())
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải yêu cầu cấp lại mật khẩu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadRequests() }, [])

  function openRequest(request: PasswordResetRequest) {
    setSelected(request)
    setAdminPassword('')
    setIdentityVerified(false)
    setProcessError('')
    setCredential(null)
    setCopied(false)
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || !identityVerified || !adminPassword.trim()) return
    setProcessing(true)
    setProcessError('')
    try {
      const result = await api.resolvePasswordResetRequest(selected.id, adminPassword)
      setCredential(result)
      setAdminPassword('')
      await loadRequests()
      await onUsersRefresh?.()
    } catch (error) {
      setProcessError(error instanceof Error ? error.message : 'Không thể cấp lại mật khẩu.')
    } finally {
      setProcessing(false)
    }
  }

  async function handleDismiss(request: PasswordResetRequest) {
    if (dismissingId) return
    const confirmed = await askConfirm({
      title: 'Bỏ Qua Yêu Cầu?',
      message: `Bỏ yêu cầu cấp lại mật khẩu của ${request.fullName}? Phụ huynh vẫn có thể gửi yêu cầu mới sau đó.`,
      confirmText: 'Bỏ Qua',
      variant: 'warning',
    })
    if (!confirmed) return
    setDismissingId(request.id)
    try {
      await api.dismissPasswordResetRequest(request.id)
      await loadRequests()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể bỏ qua yêu cầu.')
    } finally {
      setDismissingId(null)
    }
  }

  async function copyCredential() {
    if (!credential) return
    try {
      await navigator.clipboard.writeText(`Tên đăng nhập: ${credential.username}\nMật khẩu tạm: ${credential.tempPassword}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setProcessError('Trình duyệt chặn clipboard. Vui lòng sao chép thủ công.')
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-amber-500/30 bg-surface-card shadow-sm" aria-labelledby="password-reset-requests-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <Inbox aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="password-reset-requests-title" className="font-bold text-text-main">Yêu Cầu Cấp Lại Mật Khẩu</h2>
            <p className="text-xs text-text-muted">Xác minh phụ huynh trước khi cấp mật khẩu tạm.</p>
          </div>
        </div>
        <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
          {requests.length} chờ xử lý
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải yêu cầu...</div>
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-parish-danger/30 bg-parish-danger-bg p-3 text-sm text-parish-danger">
            <span>{loadError}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadRequests()}>Thử lại</Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-text-muted"><CheckCircle2 className="h-5 w-5 text-parish-success" /> Không có yêu cầu đang chờ.</div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <article key={request.id} className="flex flex-col gap-3 rounded-xl border border-surface-border bg-surface-hover/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-bold text-text-main">{request.fullName}</div>
                  <div className="mt-0.5 text-xs text-text-muted">{request.phone || request.username} · @{request.username}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" /> {formatDateTimeVi(request.lastRequestedAt)}</span>
                    {request.requestCount > 1 && <span className="font-semibold text-amber-700 dark:text-amber-300">Đã gửi {request.requestCount} lần</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={dismissingId !== null && dismissingId !== request.id}
                    loading={dismissingId === request.id}
                    loadingLabel="Đang bỏ qua…"
                    onClick={() => void handleDismiss(request)}
                  >
                    <XCircle aria-hidden="true" className="h-4 w-4" /> Bỏ qua
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={() => openRequest(request)}>
                    <KeyRound aria-hidden="true" className="h-4 w-4" /> Xác minh & cấp mật khẩu
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <ModalShell
          isOpen={!!selected}
          onClose={() => { if (!processing) setSelected(null) }}
          title={<><KeyRound className="mr-2 inline h-5 w-5 text-parish-primary" />Cấp Mật Khẩu Tạm</>}
          subtitle={`${selected.fullName} (@${selected.username})`}
          maxWidth="480px"
        >
          {credential ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-parish-success/30 bg-parish-success-bg p-3 text-sm text-text-main">
                <div className="mb-1 flex items-center gap-2 font-bold text-parish-success"><CheckCircle2 className="h-5 w-5" /> Đã cấp mật khẩu tạm</div>
                Mọi phiên cũ đã bị thu hồi. Phụ huynh bắt buộc đổi mật khẩu sau khi đăng nhập.
              </div>
              <div className="rounded-xl border border-surface-border bg-surface-hover p-4 text-center">
                <div className="text-xs text-text-muted">Mật khẩu chỉ hiển thị một lần</div>
                <div className="mt-2 break-all font-mono text-xl font-bold tracking-wider text-parish-primary">{credential.tempPassword}</div>
              </div>
              {processError && <div role="alert" className="text-xs font-semibold text-parish-danger">{processError}</div>}
              <Button type="button" variant="secondary" fullWidth onClick={() => void copyCredential()}>
                {copied ? <CheckCircle2 className="h-4 w-4 text-parish-success" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Đã sao chép' : 'Sao chép thông tin đăng nhập'}
              </Button>
              <Button type="button" variant="primary" fullWidth onClick={() => setSelected(null)}>Đã giao qua kênh riêng & đóng</Button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg p-3 text-xs leading-relaxed text-text-main">
                <div className="mb-1 flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4 text-parish-warning" /> Bước xác minh bắt buộc</div>
                Chỉ tiếp tục sau khi đã xác minh người yêu cầu qua số điện thoại/kênh liên lạc đã có trong hồ sơ. Phiếu gửi từ màn đăng nhập không phải bằng chứng danh tính.
              </div>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-surface-border p-3 text-sm text-text-main">
                <input type="checkbox" checked={identityVerified} onChange={(event) => setIdentityVerified(event.target.checked)} className="mt-0.5 h-5 w-5 accent-parish-primary" />
                <span>Tôi xác nhận đã kiểm tra danh tính phụ huynh qua kênh tin cậy.</span>
              </label>
              <label className="block text-xs font-semibold uppercase text-text-muted">
                Mật khẩu hiện tại của Admin
                <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" required className="form-input-sm mt-1.5 w-full" />
              </label>
              {processError && <div role="alert" className="flex items-center gap-2 text-xs font-semibold text-parish-danger"><AlertCircle className="h-4 w-4" /> {processError}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setSelected(null)}>Hủy</Button>
                <Button type="submit" variant="primary" loading={processing} loadingLabel="Đang cấp..." disabled={!identityVerified || !adminPassword.trim()}>
                  Cấp mật khẩu tạm
                </Button>
              </div>
            </form>
          )}
        </ModalShell>
      )}
      {dialog}
    </section>
  )
}

export default PasswordResetRequestsPanel
