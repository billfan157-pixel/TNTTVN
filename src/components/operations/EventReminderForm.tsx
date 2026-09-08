import { useEffect, useRef, useState } from 'react'
import { Button, Select, TextInput } from '../common/ui'
import { operationsApi, type OperationEventDetail, type OperationTaskDetail } from '../../lib/api/operations'
import { getTenantScopeKey } from '../../lib/tenantScope'

type Props = {
  event: OperationEventDetail
  task?: OperationTaskDetail
  enabled: boolean
  people: Array<{ id: string; parishId: string; fullName: string; linkedUserId: string | null; serviceStatus: string }>
}

export function EventReminderForm({ event, task, enabled, people }: Props) {
  const [recipient, setRecipient] = useState('')
  const [at, setAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const alive = useRef(true)
  const submitting = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const allowed = enabled && (task
    ? task.task.parishId === event.event.parishId && task.task.operationEventId === event.event.id && task.permissions['operations.task.assign'] && !['DONE', 'CANCELLED'].includes(task.task.status)
    : event.permissions['operations.event.manage'] && ['DRAFT', 'PLANNING', 'READY'].includes(event.event.status))
  const subject = task ? 'công việc' : 'sự kiện'
  const candidates = people.filter(person => person.parishId === event.event.parishId && person.serviceStatus === 'ACTIVE' && person.linkedUserId)
  if (!allowed) return null
  return <form className="mt-4 space-y-3 rounded-xl border border-surface-border p-3" aria-label={`Đặt nhắc ${subject}`} onSubmit={e => {
    e.preventDefault()
    const scope = getTenantScopeKey()
    if (!scope || submitting.current || !candidates.some(person => person.linkedUserId === recipient)) return
    const trigger = new Date(at)
    if (!Number.isFinite(trigger.getTime()) || trigger.getTime() <= Date.now()) { setMessage('Chọn thời điểm nhắc trong tương lai.'); return }
    submitting.current = true; setBusy(true); setMessage('')
    const target = task ? { taskId: task.task.id, kind: 'TASK_DUE' as const } : { eventId: event.event.id, kind: 'EVENT_START' as const }
    void operationsApi.createReminder({ ...target, recipientUserId: recipient, triggerAt: trigger.toISOString() }).then(result => {
      if (!alive.current || scope !== getTenantScopeKey()) return
      if (result.parishId !== event.event.parishId) throw new Error('Phản hồi nhắc việc không đúng giáo xứ.')
      setMessage('Đã lưu lịch nhắc. Việc gửi còn phụ thuộc quyền truy cập và thiết bị của người nhận.'); setAt('')
    }).catch(error => {
      if (alive.current && scope === getTenantScopeKey()) setMessage(error instanceof Error ? error.message : 'Không lưu được lịch nhắc.')
    }).finally(() => {
      submitting.current = false
      if (alive.current && scope === getTenantScopeKey()) setBusy(false)
    })
  }}>
    <h3 className="m-0 text-sm font-extrabold text-text-main">Đặt nhắc {subject}</h3>
    <p className="text-sm text-text-muted">Người nhận cần có tài khoản và quyền xem {subject}. Máy chủ sẽ kiểm tra lại trước khi gửi.</p>
    <Select aria-label={`Người nhận nhắc ${subject}`} value={recipient} required disabled={busy} onChange={e => setRecipient(e.target.value)}><option value="">Chọn người nhận</option>{candidates.map(person => <option key={person.id} value={person.linkedUserId!}>{person.fullName}</option>)}</Select>
    <TextInput aria-label={`Thời điểm nhắc ${subject}`} type="datetime-local" value={at} required disabled={busy} onChange={e => setAt(e.target.value)} />
    <Button type="submit" disabled={busy || !recipient || !at}>Lưu lịch nhắc</Button>
    {message && <p role="status" className="text-sm text-text-main">{message}</p>}
  </form>
}
