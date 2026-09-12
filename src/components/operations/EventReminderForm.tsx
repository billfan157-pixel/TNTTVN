import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button, Select, TextInput } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import { operationsApi, type OperationEventDetail, type OperationReminder, type OperationTaskDetail } from '../../lib/api/operations'
import { operationsErrorText } from '../../lib/operationsErrors'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { useOperationCandidates } from '../../hooks/useOperationCandidates'

type Props = {
  event: OperationEventDetail
  task?: OperationTaskDetail
  enabled: boolean
}

function localDateTime(iso: string) {
  const value = new Date(iso)
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

export function EventReminderForm({ event, task, enabled }: Props) {
  const [recipient, setRecipient] = useState('')
  const [at, setAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reminders, setReminders] = useState<OperationReminder[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAt, setEditAt] = useState('')
  const [reason, setReason] = useState('')
  const alive = useRef(true)
  const submitting = useRef(false)
  const { stableKey, releaseKey } = useStableCommandKey()
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  // D3': dedupe stays exact-instant server-side (B6' decision), so warn locally
  // when the draft lands within an hour of another PENDING reminder for the
  // same recipient. Advisory only — saving stays allowed.
  const draftAt = at ? new Date(at).getTime() : NaN
  const nearDuplicate = Number.isFinite(draftAt) && recipient
    ? reminders.find(item => item.id !== editingId && item.status === 'PENDING'
      && item.recipientUserId === recipient
      && Math.abs(new Date(item.triggerAt).getTime() - draftAt) < 3_600_000)
    : undefined
  const allowed = enabled && (task
    ? task.task.parishId === event.event.parishId && task.task.operationEventId === event.event.id && task.permissions['operations.task.assign'] && !['DONE', 'CANCELLED'].includes(task.task.status)
    : event.permissions['operations.event.manage'] && ['DRAFT', 'PLANNING', 'PREPARING', 'READY'].includes(event.event.status))
  const subject = task ? 'công việc' : 'sự kiện'
  const resourceId = task?.task.id ?? event.event.id
  const candidateDirectory = useOperationCandidates(task ? { taskId: resourceId } : { eventId: resourceId }, allowed)
  const candidates = candidateDirectory.candidates.filter(candidate => candidate.eligibility === 'ACTIONABLE' && candidate.userId)
  const recipientNames = new Map(candidates.map(candidate => [candidate.userId!, candidate.displayName]))

  const loadReminders = useCallback(async () => {
    if (!allowed) return
    const scope = getTenantScopeKey()
    try {
      const response = await operationsApi.getResourceReminders(task ? { taskId: resourceId } : { eventId: resourceId })
      if (!alive.current || !scope || scope !== getTenantScopeKey()) return
      if (response.data.some(item => item.parishId !== event.event.parishId)) throw new Error('Máy chủ trả lịch nhắc sai phạm vi giáo xứ.')
      setReminders(response.data)
      setLoaded(true)
    } catch (error) {
      if (alive.current && scope === getTenantScopeKey()) {
        setReminders([])
        setLoaded(false)
        setMessage(operationsErrorText((error as { code?: string })?.code, error instanceof Error ? error.message : 'Không tải được lịch nhắc.'))
      }
    }
  }, [allowed, event.event.parishId, resourceId, task])

  useEffect(() => { void loadReminders() }, [loadReminders])
  if (!allowed) return null

  const finishMutation = async (action: () => Promise<unknown>, success: string, onSuccess?: () => void) => {
    const scope = getTenantScopeKey()
    if (!scope || submitting.current) return
    submitting.current = true; setBusy(true); setMessage('')
    try {
      await action()
      if (!alive.current || scope !== getTenantScopeKey()) return
      onSuccess?.()
      setMessage(success); setEditingId(null); setEditAt(''); setReason('')
      await loadReminders()
    } catch (error) {
      if (alive.current && scope === getTenantScopeKey()) setMessage(operationsErrorText((error as { code?: string })?.code, error instanceof Error ? error.message : 'Không cập nhật được lịch nhắc.'))
    } finally {
      submitting.current = false
      if (alive.current && scope === getTenantScopeKey()) setBusy(false)
    }
  }

  return <section className="mt-4 space-y-3 rounded-xl border border-surface-border p-3" aria-label={`Quản lý nhắc ${subject}`}>
    <form className="space-y-3" aria-label={`Đặt nhắc ${subject}`} onSubmit={e => {
      e.preventDefault()
      if (!candidates.some(candidate => candidate.userId === recipient)) return
      const trigger = new Date(at)
      if (!Number.isFinite(trigger.getTime()) || trigger.getTime() <= Date.now()) { setMessage('Chọn thời điểm nhắc trong tương lai.'); return }
      const target = task ? { taskId: task.task.id, kind: 'TASK_DUE' as const } : { eventId: event.event.id, kind: 'EVENT_START' as const }
      const payload = { ...target, recipientUserId: recipient, triggerAt: trigger.toISOString() }
      const key = stableKey('reminder-create', payload)
      void finishMutation(
        async () => {
          const result = await operationsApi.createReminder(payload, key)
          releaseKey('reminder-create')
          return result
        },
        'Đã lưu lịch nhắc. Việc gửi còn phụ thuộc quyền truy cập và thiết bị của người nhận.',
        () => { setAt('') },
      )
    }}>
      <h3 className="m-0 text-sm font-extrabold text-text-main">Đặt nhắc {subject}</h3>
      <p className="text-sm text-text-muted">Người nhận cần có tài khoản và quyền xem {subject}. Máy chủ sẽ kiểm tra lại trước khi gửi.</p>
      <Select aria-label={`Người nhận nhắc ${subject}`} value={recipient} required disabled={busy || candidateDirectory.loading} onChange={e => setRecipient(e.target.value)}><option value="">{candidateDirectory.loading ? 'Đang tải người nhận…' : 'Chọn người nhận'}</option>{candidates.map(candidate => <option key={candidate.userId!} value={candidate.userId!}>{candidate.displayName}</option>)}</Select>
      <TextInput aria-label={`Thời điểm nhắc ${subject}`} type="datetime-local" value={at} required disabled={busy} onChange={e => setAt(e.target.value)} />
      {nearDuplicate && <p className="m-0 rounded-lg border border-parish-warning/30 bg-parish-warning-bg/30 p-2 text-xs text-parish-warning">Đã có lịch nhắc đang chờ cho người này lúc {new Date(nearDuplicate.triggerAt).toLocaleString('vi-VN')} — kiểm tra trùng trước khi lưu.</p>}
      <Button type="submit" disabled={busy || !recipient || !at}>Lưu lịch nhắc</Button>
    </form>
    {candidateDirectory.error && <p role="alert" className="text-sm text-text-main">{candidateDirectory.error}</p>}

    <div className="border-t border-surface-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-extrabold text-text-main">Lịch nhắc đã đặt</h3>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void loadReminders()}>Tải lại lịch nhắc</Button>
      </div>
      {loaded && reminders.length === 0 && <EmptyState icon={Bell} title="Chưa có lịch nhắc cho mục này." description="Tạo lịch ở phía trên khi cần nhắc một người có quyền truy cập." className="py-5" />}
      <div className="mt-2 divide-y divide-surface-border">
        {reminders.map(reminder => <div key={reminder.id} data-reminder-id={reminder.id} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
            <div><p className="m-0 font-bold text-text-main">{reminder.recipientUserId ? recipientNames.get(reminder.recipientUserId) ?? 'Tài khoản được phân công' : 'Người nhận'}</p><p className="mb-0 mt-1 text-xs text-text-muted">{new Date(reminder.triggerAt).toLocaleString('vi-VN')} · {reminder.status}</p></div>
            {reminder.status === 'PENDING' && <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setEditingId(reminder.id); setEditAt(localDateTime(reminder.triggerAt)); setReason('') }}>Đổi hoặc hủy lịch</Button>}
          </div>
          {editingId === reminder.id && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <TextInput aria-label={`Giờ nhắc mới ${subject}`} type="datetime-local" value={editAt} disabled={busy} onChange={e => setEditAt(e.target.value)} />
            <TextInput aria-label={`Lý do đổi hoặc hủy nhắc ${subject}`} value={reason} maxLength={2000} required disabled={busy} placeholder="Lý do bắt buộc" onChange={e => setReason(e.target.value)} />
            <Button size="sm" disabled={busy || !reason.trim() || !editAt || new Date(editAt).getTime() <= Date.now()} onClick={() => {
              const payload = { expectedVersion: reminder.version, triggerAt: new Date(editAt).toISOString(), reason: reason.trim() }
              const key = stableKey('reminder-reschedule', { id: reminder.id, ...payload })
              return void finishMutation(
                async () => {
                  const result = await operationsApi.rescheduleReminder(reminder.id, payload, key)
                  releaseKey('reminder-reschedule')
                  return result
                },
                'Đã đổi thời điểm nhắc.',
              )
            }}>Lưu giờ mới</Button>
            <Button variant="danger" size="sm" disabled={busy || !reason.trim()} onClick={() => {
              const key = stableKey('reminder-cancel', { id: reminder.id, version: reminder.version })
              return void finishMutation(
                async () => {
                  const result = await operationsApi.cancelReminder(reminder.id, reminder.version, reason.trim(), key)
                  releaseKey('reminder-cancel')
                  return result
                },
                'Đã hủy lịch nhắc.',
              )
            }}>Hủy lịch này</Button>
          </div>}
        </div>)}
      </div>
    </div>
    {message && <p role="status" className="text-sm text-text-main">{message}</p>}
  </section>
}
