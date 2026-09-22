import { useEffect, useRef, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Button, Select, TextArea, TextInput } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import { operationsApi, type OperationEventDetail } from '../../lib/api/operations'
import { operationsErrorText } from '../../lib/operationsErrors'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationCandidateValue, parseOperationCandidateValue, useOperationCandidates } from '../../hooks/useOperationCandidates'

export function EventRetrospectivePanel({ detail, enabled, refresh }: { detail: OperationEventDetail; enabled: boolean; refresh: () => Promise<unknown> | unknown }) {
  const [lessonsLearned, setLessonsLearned] = useState(detail.retrospective?.lessonsLearned ?? '')
  const [improvementNotes, setImprovementNotes] = useState(detail.retrospective?.improvementNotes ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL')
  const [warnings, setWarnings] = useState<Array<{ id: string; startsAt: string; endsAt: string }>>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const inFlight = useRef(false)
  const { stableKey, releaseKey } = useStableCommandKey()
  const canManageRetrospective = Boolean(detail.permissions['operations.event.manage'] && detail.event.status === 'COMPLETED')
  // Follow-ups carry no workstream, so they must NOT read the event-level
  // `operations.task.create` projection: since U-20/Gói A that flag answers
  // the *field-task* question ("is there a Mảng I own here?") and is false on
  // field-less Xu Doan events even when the follow-up command itself
  // (task.create + task.assign at event level) would succeed. Gate on
  // task.assign instead — no actor holds event-level assign without
  // event-level create, so this matches the server decision exactly.
  const canCreateFollowUp = Boolean(detail.event.status === 'COMPLETED' && detail.permissions['operations.task.assign'])
  const directory = useOperationCandidates({ eventId: detail.event.id }, enabled && canCreateFollowUp)
  const actionableCandidates = directory.candidates.filter(candidate => candidate.eligibility === 'ACTIONABLE')

  useEffect(() => {
    setLessonsLearned(detail.retrospective?.lessonsLearned ?? '')
    setImprovementNotes(detail.retrospective?.improvementNotes ?? '')
  }, [detail.event.id, detail.retrospective?.version, detail.retrospective?.lessonsLearned, detail.retrospective?.improvementNotes])

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const run = async (action: (current: () => boolean) => Promise<void>) => {
    const scope = getTenantScopeKey()
    if (!enabled || !scope || inFlight.current) return
    const current = () => alive.current && getTenantScopeKey() === scope
    inFlight.current = true; setBusy(true); setMessage('')
    try { await action(current) } catch (error) {
      if (current()) setMessage(operationsErrorText((error as { code?: string })?.code, error instanceof Error ? error.message : 'Không cập nhật được hậu kiểm sự kiện.'))
    } finally {
      inFlight.current = false
      if (current()) setBusy(false)
    }
  }

  return <section className="mt-4 space-y-4 rounded-xl border border-surface-border p-3 sm:p-4" aria-label="Hậu kiểm và công việc tiếp nối">
    <div className="flex items-start gap-3">
      <ClipboardCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-parish-primary" />
      <div>
        <h3 className="m-0 text-sm font-extrabold text-text-main">Hậu kiểm &amp; Follow-up</h3>
        <p className="mb-0 mt-1 text-xs text-text-muted">Ghi bài học ngắn gọn; mỗi cải tiến cần theo dõi phải trở thành task có một người phụ trách và hạn rõ ràng.</p>
      </div>
    </div>

    <div className="rounded-lg bg-surface-sunken p-3">
      <p className="m-0 text-xs font-bold uppercase tracking-wide text-text-muted">Kết quả đã chốt</p>
      <p className="mb-0 mt-1 whitespace-pre-wrap text-sm text-text-main">{detail.event.outcomeSummary || 'Chưa có tổng kết kết quả.'}</p>
    </div>

    {canManageRetrospective ? <form className="space-y-3" onSubmit={event => {
      event.preventDefault()
      if (!lessonsLearned.trim()) return
      void run(async current => {
        const payload = { expectedVersion: detail.retrospective?.version ?? null, lessonsLearned: lessonsLearned.trim(), improvementNotes: improvementNotes.trim() || null }
        await operationsApi.saveEventRetrospective(detail.event.id, payload, stableKey('event-retrospective', { id: detail.event.id, ...payload }))
        releaseKey('event-retrospective')
        if (!current()) return
        setMessage('Đã lưu hậu kiểm.')
        await refresh()
      })
    }}>
      <label className="block text-sm font-semibold text-text-main">Bài học rút ra
        <TextArea aria-label="Bài học rút ra" className="mt-1 min-h-24 w-full" value={lessonsLearned} required maxLength={5000} disabled={busy} placeholder="Điều gì đã hiệu quả hoặc cần ghi nhớ?" onChange={event => setLessonsLearned(event.target.value)} />
      </label>
      <label className="block text-sm font-semibold text-text-main">Điểm cần cải thiện
        <TextArea aria-label="Điểm cần cải thiện" className="mt-1 min-h-24 w-full" value={improvementNotes} maxLength={5000} disabled={busy} placeholder="Chỉ ghi nhận; phần cần theo dõi hãy tạo task bên dưới." onChange={event => setImprovementNotes(event.target.value)} />
      </label>
      <Button type="submit" size="sm" disabled={busy || !lessonsLearned.trim()}>Lưu hậu kiểm</Button>
    </form> : detail.retrospective ? <div className="space-y-2 text-sm text-text-main">
      <p className="m-0 whitespace-pre-wrap"><strong>Bài học:</strong> {detail.retrospective.lessonsLearned}</p>
      {detail.retrospective.improvementNotes && <p className="m-0 whitespace-pre-wrap"><strong>Cải thiện:</strong> {detail.retrospective.improvementNotes}</p>}
    </div> : /* W3.4 (U-14a): standard empty state instead of a raw <p> note. */
      <EmptyState icon={ClipboardCheck} title="Chưa có hậu kiểm được lưu." description="Ghi lại bài học sau khi sự kiện hoàn tất để làm dữ liệu cho lần tổ chức sau." className="py-5" />}

    {canCreateFollowUp && <form className="grid gap-3 border-t border-surface-border pt-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault()
      const target = parseOperationCandidateValue(targetValue)
      if (!title.trim() || !dueAt || !target) return
      void run(async current => {
        const payload = { eventVersion: detail.event.version, title: title.trim(), description: description.trim() || null, dueAt: new Date(dueAt).toISOString(), priority, ...target }
        const result = await operationsApi.createEventFollowUp(detail.event.id, payload, stableKey('event-follow-up', { id: detail.event.id, ...payload }))
        releaseKey('event-follow-up')
        if (!current()) return
        setTitle(''); setDescription(''); setDueAt(''); setTargetValue(''); setPriority('NORMAL'); setWarnings(result.conflictWarnings)
        setMessage('Đã tạo follow-up và giao cho người phụ trách.')
        await refresh()
      })
    }}>
      <div className="sm:col-span-2"><h4 className="m-0 text-sm font-extrabold text-text-main">Tạo follow-up có trách nhiệm</h4></div>
      <TextInput aria-label="Tên follow-up" value={title} maxLength={300} required disabled={busy} placeholder="Hành động cải tiến cần làm" onChange={event => setTitle(event.target.value)} />
      <TextInput aria-label="Hạn follow-up" type="datetime-local" value={dueAt} required disabled={busy} onChange={event => setDueAt(event.target.value)} />
      <TextArea aria-label="Mô tả follow-up" className="min-h-20 sm:col-span-2" value={description} maxLength={5000} disabled={busy} placeholder="Kết quả mong đợi (không bắt buộc)" onChange={event => setDescription(event.target.value)} />
      <Select aria-label="Người phụ trách follow-up" value={targetValue} required disabled={busy || directory.loading} onChange={event => setTargetValue(event.target.value)}><option value="">{directory.loading ? 'Đang tải nhân sự…' : 'Chọn người có tài khoản Operations'}</option>{actionableCandidates.map(candidate => <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}</option>)}</Select>
      <Select aria-label="Mức ưu tiên follow-up" value={priority} disabled={busy} onChange={event => setPriority(event.target.value as typeof priority)}><option value="LOW">Thấp</option><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option></Select>
      <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={busy || !title.trim() || !dueAt || !targetValue}>Tạo và giao follow-up</Button></div>
    </form>}

    {warnings.length > 0 && <div role="status" className="rounded-lg border border-parish-warning/30 bg-parish-warning-bg p-3 text-sm text-text-main">
      <p className="m-0 font-bold">Đã tạo follow-up, nhưng người phụ trách có lịch bận tại thời điểm hết hạn.</p>
      {warnings.map(warning => <p key={warning.id} className="mb-0 mt-1">{new Date(warning.startsAt).toLocaleString('vi-VN')} – {new Date(warning.endsAt).toLocaleString('vi-VN')}</p>)}
      <p className="mb-0 mt-1 text-xs">Lý do bận được giữ riêng tư; người nhận vẫn cần xác nhận nhận việc.</p>
    </div>}
    {directory.error && <p role="alert" className="m-0 text-sm text-text-main">{directory.error}</p>}
    {message && <p role="status" className="m-0 text-sm text-text-main">{message}</p>}
  </section>
}
