import { useEffect, useRef, useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { Badge, Button, Select, TextInput } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import { operationsApi, type OperationEventDetail, type OperationEventHeadcount, type OperationEventParticipant } from '../../lib/api/operations'
import { operationsErrorText } from '../../lib/operationsErrors'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { useOperationCandidates, operationCandidateValue, parseOperationCandidateValue } from '../../hooks/useOperationCandidates'
import { isClosedEvent } from './operationsViewHelpers'

/**
 * W4.2a (decision 2026-09-15): participants tab for the event modal. The
 * server shipped `POST /events/:id/participants` + participant status + the
 * headcount rollup long ago; this is the client surface for it. Add is gated
 * by `operations.event.manage` AND an open planning window (mirrors
 * assertEventAcceptsPlanningMutation); status changes are OCC per row. Names
 * resolve through the event candidate directory — never a raw UUID.
 */
const STATUS_LABELS_VI: Record<OperationEventParticipant['attendanceStatus'], string> = {
  PLANNED: 'Dự kiến',
  CONFIRMED: 'Đã xác nhận',
  DECLINED: 'Từ chối',
  ATTENDED: 'Đã tham dự',
  ABSENT: 'Vắng',
}
const STATUS_TONES: Record<OperationEventParticipant['attendanceStatus'], 'neutral' | 'success' | 'danger' | 'warning'> = {
  PLANNED: 'neutral',
  CONFIRMED: 'success',
  DECLINED: 'danger',
  ATTENDED: 'success',
  ABSENT: 'warning',
}

export function EventParticipantsPanel({ detail, enabled, refresh }: {
  detail: OperationEventDetail
  enabled: boolean
  refresh: () => Promise<unknown>
}) {
  const participants = detail.participants ?? []
  const canManage = Boolean(detail.permissions['operations.event.manage']) && enabled && !isClosedEvent(detail.event.status)
  const directory = useOperationCandidates({ eventId: detail.event.id }, canManage)

  const [headcount, setHeadcount] = useState<OperationEventHeadcount | null>(null)
  // Three states so a failed rollup never leaves a fake "loading…" label:
  // null + error renders nothing extra (the participant list is authoritative).
  const [headcountState, setHeadcountState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [targetValue, setTargetValue] = useState('')
  const [role, setRole] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { stableKey, releaseKey } = useStableCommandKey()
  const active = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => () => { active.current = false }, [])

  // Headcount rollup is a derived GET; failure is non-blocking (the list
  // itself comes with the event detail).
  useEffect(() => {
    let current = true
    setHeadcount(null); setHeadcountState('loading')
    void operationsApi.getEventHeadcount(detail.event.id)
      .then(data => { if (current) { setHeadcount(data); setHeadcountState('ready') } })
      .catch(() => { if (current) setHeadcountState('error') })
    return () => { current = false }
  }, [detail.event.id])

  const displayName = (participant: OperationEventParticipant) =>
    directory.candidates.find(candidate =>
      (participant.userId != null && candidate.userId === participant.userId)
      || (participant.personId != null && candidate.personId === participant.personId),
    )?.displayName ?? 'Người tham dự'

  const add = async () => {
    const scope = getTenantScopeKey()
    const target = parseOperationCandidateValue(targetValue)
    if (!scope || !canManage || inFlight.current || !target) return
    inFlight.current = true; setBusyId('add'); setError('')
    const current = () => active.current && scope === getTenantScopeKey()
    try {
      const payload = { ...target, ...(role.trim() ? { participantRole: role.trim() } : {}) }
      const key = stableKey('participant-add', { eventId: detail.event.id, ...payload })
      await operationsApi.addEventParticipant(detail.event.id, payload, key)
      releaseKey('participant-add')
      if (!current()) return
      setTargetValue(''); setRole('')
      await refresh()
    } catch (failure) {
      if (current()) setError(operationsErrorText((failure as { code?: string })?.code, failure instanceof Error ? failure.message : 'Không thêm được người tham dự.'))
    } finally {
      inFlight.current = false
      if (current()) setBusyId(null)
    }
  }

  const changeStatus = async (participant: OperationEventParticipant, status: OperationEventParticipant['attendanceStatus']) => {
    const scope = getTenantScopeKey()
    if (!scope || !canManage || inFlight.current || status === participant.attendanceStatus) return
    inFlight.current = true; setBusyId(participant.id); setError('')
    const current = () => active.current && scope === getTenantScopeKey()
    try {
      const payload = { version: participant.version, status }
      const key = stableKey(`participant-status:${participant.id}`, { participantId: participant.id, ...payload })
      await operationsApi.setEventParticipantStatus(detail.event.id, participant.id, payload, key)
      releaseKey(`participant-status:${participant.id}`)
      if (current()) await refresh()
    } catch (failure) {
      if (current()) setError(operationsErrorText((failure as { code?: string })?.code, failure instanceof Error ? failure.message : 'Không cập nhật được trạng thái.'))
    } finally {
      inFlight.current = false
      if (current()) setBusyId(null)
    }
  }

  return (
    <section className="space-y-3" aria-label="Người tham dự">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-bold text-text-main">Người tham dự ({participants.length})</h3>
        {headcountState !== 'error' && (
          <p className="m-0 text-xs text-text-muted">
            {headcount
              ? <>Dự kiến {headcount.expected ?? '—'} · Tổng {headcount.total} · Xác nhận {headcount.confirmed} · Tham dự {headcount.attended}</>
              : 'Đang tải tổng hợp số lượng…'}
          </p>
        )}
      </div>
      {error && <p role="alert" className="m-0 text-sm text-parish-danger">{error}</p>}

      {canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-surface-border bg-surface-ground/30 p-3">
          <label className="min-w-[180px] flex-1 text-xs text-text-muted">
            Người tham dự
            <Select aria-label="Chọn người tham dự" className="mt-1 w-full" value={targetValue} disabled={busyId !== null} onChange={event => setTargetValue(event.target.value)}>
              <option value="">{directory.loading ? 'Đang tải danh sách…' : '— Chọn người —'}</option>
              {directory.candidates.map(candidate => (
                <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}</option>
              ))}
            </Select>
          </label>
          <label className="min-w-[140px] flex-1 text-xs text-text-muted">
            Vai trò (tùy chọn)
            <TextInput aria-label="Vai trò người tham dự" className="mt-1 w-full" value={role} maxLength={80} disabled={busyId !== null} placeholder="VD: Hậu cần, Phụng vụ…" onChange={event => setRole(event.target.value)} />
          </label>
          <Button size="sm" leadingIcon={<UserPlus className="h-4 w-4" />} disabled={!targetValue || busyId !== null} loading={busyId === 'add'} onClick={() => void add()}>
            Thêm
          </Button>
        </div>
      )}

      {participants.length === 0 && (
        <EmptyState icon={Users} title="Chưa có người tham dự" description="Thêm người tham gia sự kiện để theo dõi số lượng và xác nhận." className="py-6" />
      )}

      <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-card overflow-hidden">
        {participants.map(participant => (
          <div key={participant.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
            <span className="min-w-0 truncate text-sm text-text-main">
              {displayName(participant)}
              {participant.participantRole && participant.participantRole !== 'ATTENDEE' && (
                <span className="ml-2 text-xs text-text-muted">· {participant.participantRole}</span>
              )}
              <Badge tone={STATUS_TONES[participant.attendanceStatus]} className="ml-2">{STATUS_LABELS_VI[participant.attendanceStatus]}</Badge>
            </span>
            {canManage && (
              <Select
                aria-label={`Trạng thái tham dự của ${displayName(participant)}`}
                className="w-40 sm:w-44"
                value={participant.attendanceStatus}
                disabled={busyId !== null}
                onChange={event => void changeStatus(participant, event.target.value as OperationEventParticipant['attendanceStatus'])}
              >
                {(Object.keys(STATUS_LABELS_VI) as OperationEventParticipant['attendanceStatus'][]).map(status => (
                  <option key={status} value={status}>{STATUS_LABELS_VI[status]}</option>
                ))}
              </Select>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
