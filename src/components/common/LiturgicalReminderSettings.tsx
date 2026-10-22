import { useEffect, useId, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { BellRing, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { LiturgicalReminderPreferences } from '../../lib/api/notifications'
import { useAuthStore } from '../../stores/authStore'

export function LiturgicalReminderSettings() {
  const user = useAuthStore(state => state.user)
  return user ? <LiturgicalReminderForm key={`${user.parishId}:${user.id}`} scope={`${user.parishId}:${user.id}`} /> : null
}

function LiturgicalReminderForm({ scope }: { scope: string }) {
  const navigate = useNavigate()
  const id = useId()
  const [saved, setSaved] = useState<LiturgicalReminderPreferences | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState('08:00')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setSaved(null); setEnabled(false); setTime('08:00'); setError(''); setSuccess(''); setLoading(true); setSaving(false)
    if (!scope) { setLoading(false); return }
    api.getLiturgicalReminder().then(value => {
      if (!active) return
      setSaved(value); setEnabled(value.enabled); setTime(value.time)
    }).catch(() => { if (active) setError('Không thể tải lịch nhắc. Hãy thử lại khi có kết nối.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [scope, retry])
  if (!scope) return null

  const save = async () => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) { setError('Chọn giờ nhắc hợp lệ.'); return }
    setSaving(true); setError(''); setSuccess('')
    const stillOwner = () => { const current = useAuthStore.getState().user; return current && `${current.parishId}:${current.id}` === scope }
    try {
      const result = await api.saveLiturgicalReminder({ enabled, time })
      if (stillOwner()) { setSaved(result); setEnabled(result.enabled); setTime(result.time); setSuccess('Đã lưu thay đổi lịch nhắc.') }
    } catch (reason) { if (stillOwner()) setError(reason instanceof Error ? reason.message : 'Không thể lưu lịch nhắc. Hãy thử lại.') }
    finally { if (stillOwner()) setSaving(false) }
  }

  return <section className="app-panel p-3 sm:p-4 space-y-3" aria-labelledby={`${id}-title`}>
    <div className="flex items-start gap-2">
      <BellRing size={18} className="shrink-0 mt-0.5 text-parish-primary" />
      <div className="min-w-0">
        <h2 id={`${id}-title`} className="m-0 text-base font-bold text-text-main">Nhắc lịch phụng vụ hằng ngày</h2>
        <p className="m-0 mt-1 text-xs text-text-muted">Tên ngày lễ, mùa phụng vụ và màu áo lễ. Chỉ gửi cho tài khoản của bạn.</p>
      </div>
    </div>
    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
      <label className="flex items-center gap-2 min-h-11 text-sm font-semibold flex-1">
        <input type="checkbox" className="h-5 w-5 accent-parish-primary" aria-label="Nhận lịch phụng vụ hằng ngày" checked={enabled} disabled={loading || saving || !saved} onChange={event => { setEnabled(event.target.checked); setSuccess('') }} />
        Nhận lịch phụng vụ hằng ngày
      </label>
      <div>
        <label htmlFor={`${id}-time`} className="block text-xs font-bold mb-1">Giờ nhắc</label>
        <input id={`${id}-time`} type="time" className="form-input w-full sm:w-36" required value={time} disabled={loading || saving || !saved}
          aria-describedby={`${id}-timezone`} onChange={event => { setTime(event.target.value); setSuccess('') }} />
        <p id={`${id}-timezone`} className="m-0 mt-1 text-xs text-text-muted">Giờ Việt Nam (UTC+7)</p>
      </div>
      <button type="button" className="btn btn-primary" disabled={loading || saving || !saved} onClick={() => void save()}>
        {(loading || saving) && <Loader2 size={15} className="animate-spin" />} Lưu lịch nhắc
      </button>
    </div>
    {saved && <p className="m-0 text-xs text-text-muted">{saved.enabled ? `Đã lên lịch hằng ngày lúc ${saved.time}, giờ Việt Nam.` : 'Lịch nhắc đang tắt.'}</p>}
    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
      <span>Để nhận khi đóng Catevia, hãy bật thông báo trên thiết bị.</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate({ to: '/settings' })}>Cài đặt thông báo thiết bị</button>
    </div>
    {success && <p role="status" className="m-0 text-xs text-parish-success">{success}</p>}
    {error && <div><p role="alert" className="m-0 text-xs text-parish-danger">{error}</p>{!saved && <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => setRetry(value => value + 1)}>Thử lại tải lịch nhắc</button>}</div>}
  </section>
}
