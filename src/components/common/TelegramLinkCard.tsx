import React, { useState, useEffect, useCallback } from 'react'
import { Send, Loader2, AlertCircle, CheckCircle2, Link2, Unlink, Copy, BellRing, BellOff, ChevronDown } from 'lucide-react'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { useAuth } from '../../hooks/useAuth'
import { useTelegramLink } from '../../hooks/useTelegramLink'

type TelegramLinkCardProps = {
  className?: string
}

export const TelegramLinkCard: React.FC<TelegramLinkCardProps> = ({ className }) => {
  const { user } = useAuth()
  const {
    status, statusLoading, statusError,
    token, tokenExpiresAt, creatingToken,
    toggleNotifications, revoking,
    createToken, toggleNotif, revoke, refresh,
  } = useTelegramLink()
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()

  const [copied, setCopied] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!tokenExpiresAt) { setSecondsLeft(0); return }
    const tick = () => setSecondsLeft(Math.max(0, Math.floor((new Date(tokenExpiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [tokenExpiresAt])

  const copyToken = useCallback(async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard có thể bị chặn — phụ huynh tự chép tay
    }
  }, [token])

  const activeLinks = (status ?? []).filter((l) => l.status === 'ACTIVE')
  const linked = activeLinks.length > 0

  const handleRevoke = async () => {
    const ok = await askConfirm({
      title: 'Hủy Liên Kết Telegram',
      message: 'Bạn sẽ không còn nhận thông báo vắng học và phiếu điểm qua Telegram. Tài khoản phụ huynh trong ứng dụng không bị ảnh hưởng.',
      confirmText: 'Hủy Liên Kết',
      variant: 'danger',
    })
    if (ok) await revoke()
  }

  return (
    <section className={`bg-surface-card border border-surface-border rounded-xl p-5 space-y-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <Send className="w-5 h-5 text-parish-primary" />
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Thông Báo Telegram</h2>
        <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${linked ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600' : 'bg-surface-hover text-text-muted'}`}>
          {linked ? 'Đã liên kết' : 'Chưa liên kết'}
        </span>
      </div>

      {statusError && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 text-sm rounded-lg border border-rose-200 dark:border-rose-900">
          <AlertCircle size={16} />{statusError}
        </div>
      )}

      {statusLoading ? (
        <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
      ) : linked ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-text-main">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>
              Nhận thông báo qua <strong>Telegram</strong>
              {activeLinks[0]?.telegramUsername && <span className="text-text-muted"> (@{activeLinks[0].telegramUsername})</span>}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void toggleNotif(!(activeLinks[0]?.notificationsEnabled === 1))}
              disabled={toggleNotifications}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-border bg-surface-hover text-text-main hover:bg-surface-hover/70 transition-colors disabled:opacity-50"
            >
              {toggleNotifications ? <Loader2 size={14} className="animate-spin" /> : activeLinks[0]?.notificationsEnabled === 1 ? <BellOff size={14} /> : <BellRing size={14} />}
              {activeLinks[0]?.notificationsEnabled === 1 ? 'Tắt Thông Báo' : 'Bật Thông Báo'}
            </button>
            <button
              type="button"
              onClick={() => void handleRevoke()}
              disabled={revoking}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors disabled:opacity-50"
            >
              {revoking ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
              Hủy Liên Kết
            </button>
          </div>
          <p className="text-[11px] text-text-muted">
            Bật lại thông báo bất cứ lúc nào bằng lệnh <span className="font-mono">/optin</span> trong Telegram.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Nhận thông báo vắng học và phiếu điểm của con ngay trong Telegram.
          </p>

          {!token ? (
            <button
              type="button"
              onClick={() => void createToken()}
              disabled={creatingToken}
              className="flex items-center gap-1.5 px-3 py-2 bg-parish-primary hover:bg-parish-primary/90 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {creatingToken ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Tạo Mã Liên Kết
            </button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-surface-border bg-surface-hover p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-text-muted">
                    {secondsLeft > 0
                      ? <>Mã có giá trị trong <strong className="text-text-main">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</strong> phút</>
                      : 'Mã đã hết hạn — tạo mã mới để tiếp tục.'}
                  </span>
                  <button type="button" onClick={() => void copyToken()} className="flex items-center gap-1 text-[11px] font-semibold text-parish-primary hover:underline">
                    <Copy size={12} />{copied ? 'Đã chép!' : 'Sao Chép'}
                  </button>
                </div>
                <div className="font-mono text-lg text-parish-primary font-bold break-all bg-surface-card border border-surface-border rounded-md px-3 py-2 select-all">
                  {token}
                </div>
              </div>
              <ol className="text-xs text-text-muted space-y-1 list-decimal list-inside">
                <li>Mở Telegram, tìm bot <strong className="text-text-main">Giáo Lý TNTT</strong> (Brave Davinci).</li>
                <li>Gửi lệnh <span className="font-mono bg-surface-hover border border-surface-border rounded px-1">/link</span> kèm mã ở trên.</li>
                <li>Nhận tin nhắn xác nhận liên kết thành công.</li>
              </ol>
              <button type="button" onClick={() => setShowSteps((s) => !s)} className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-main">
                <ChevronDown size={12} className={showSteps ? 'rotate-180' : ''} />
                {showSteps ? 'Ẩn' : 'Xem'} thông tin tài khoản hiện tại
              </button>
              {showSteps && (
                <p className="text-[11px] text-text-muted bg-surface-hover rounded-md p-2">
                  Tên đăng nhập: <span className="font-mono text-text-main">{user?.username}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void refresh()}
        disabled={statusLoading}
        className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-main disabled:opacity-50"
      >
        <Loader2 size={12} className={statusLoading ? 'animate-spin' : ''} />
        Làm mới trạng thái
      </button>

      {confirmDialog}
    </section>
  )
}

export default TelegramLinkCard