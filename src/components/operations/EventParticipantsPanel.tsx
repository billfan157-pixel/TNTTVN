import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, UserCheck, UserPlus, Users } from 'lucide-react'
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

type ParticipantFilterStatus = 'ALL' | OperationEventParticipant['attendanceStatus']

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
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ParticipantFilterStatus>('ALL')
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

  const filteredParticipants = useMemo(() => {
    return participants.filter(participant => {
      if (statusFilter !== 'ALL' && participant.attendanceStatus !== statusFilter) {
        return false
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const name = displayName(participant).toLowerCase()
        const participantRole = (participant.participantRole ?? '').toLowerCase()
        if (!name.includes(query) && !participantRole.includes(query)) return false
      }
      return true
    })
  }, [participants, statusFilter, searchQuery, directory.candidates])

  const attendancePercent = headcount && headcount.total > 0
    ? Math.round(((headcount.confirmed + headcount.attended) / headcount.total) * 100)
    : 0

  const filterOptions: Array<{ key: ParticipantFilterStatus; label: string; count: number }> = [
    { key: 'ALL', label: 'Tất cả', count: participants.length },
    { key: 'CONFIRMED', label: 'Đã xác nhận', count: participants.filter(p => p.attendanceStatus === 'CONFIRMED').length },
    { key: 'ATTENDED', label: 'Đã tham dự', count: participants.filter(p => p.attendanceStatus === 'ATTENDED').length },
    { key: 'PLANNED', label: 'Dự kiến', count: participants.filter(p => p.attendanceStatus === 'PLANNED').length },
    { key: 'ABSENT', label: 'Vắng', count: participants.filter(p => p.attendanceStatus === 'ABSENT').length },
    { key: 'DECLINED', label: 'Từ chối', count: participants.filter(p => p.attendanceStatus === 'DECLINED').length },
  ]

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
    <section className="space-y-3.5" aria-label="Người tham dự">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h3 className="m-0 text-sm font-extrabold text-text-main">Người tham dự ({participants.length})</h3>
            {headcountState !== 'error' && (
              <p className="m-0 text-xs text-text-muted">
                {headcount
                  ? <>Dự kiến {headcount.expected ?? '—'} · Tổng {headcount.total} · Xác nhận {headcount.confirmed} · Tham dự {headcount.attended}</>
                  : 'Đang tải tổng hợp số lượng…'}
              </p>
            )}
          </div>
        </div>
        {headcount && headcount.total > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-surface-card border border-surface-border px-2.5 py-1 text-xs">
            <UserCheck className="h-3.5 w-3.5 text-parish-success" />
            <span className="font-semibold text-text-muted">Tỷ lệ sẵn sàng:</span>
            <span className="font-bold text-parish-success">{attendancePercent}%</span>
          </div>
        )}
      </div>
      {error && <p role="alert" className="m-0 text-sm text-parish-danger">{error}</p>}

      {canManage && (
        <div className="flex flex-wrap items-end gap-2.5 rounded-xl border border-surface-border bg-surface-card p-3 sm:p-3.5 shadow-2xs">
          <label className="min-w-[180px] flex-1 text-xs font-semibold text-text-muted">
            Người tham dự
            <Select aria-label="Chọn người tham dự" className="mt-1 w-full min-h-[44px] sm:min-h-0" value={targetValue} disabled={busyId !== null} onChange={event => setTargetValue(event.target.value)}>
              <option value="">{directory.loading ? 'Đang tải danh sách…' : '— Chọn người —'}</option>
              {directory.candidates.map(candidate => (
                <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}</option>
              ))}
            </Select>
          </label>
          <label className="min-w-[140px] flex-1 text-xs font-semibold text-text-muted">
            Vai trò (tùy chọn)
            <TextInput aria-label="Vai trò người tham dự" className="mt-1 w-full min-h-[44px] sm:min-h-0" value={role} maxLength={80} disabled={busyId !== null} placeholder="VD: Hậu cần, Phụng vụ…" onChange={event => setRole(event.target.value)} />
          </label>
          <Button size="sm" className="min-h-[44px] sm:min-h-0" leadingIcon={<UserPlus className="h-4 w-4" />} disabled={!targetValue || busyId !== null} loading={busyId === 'add'} onClick={() => void add()}>
            Thêm
          </Button>
        </div>
      )}

      {participants.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
            <TextInput
              aria-label="Tìm người tham dự"
              className="pl-8 text-xs w-full min-h-[44px] sm:min-h-0"
              placeholder="Tìm theo tên hoặc vai trò..."
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="group" aria-label="Lọc người tham dự theo trạng thái">
            {filterOptions.filter(opt => opt.count > 0 || opt.key === 'ALL').map(opt => (
              <button
                key={opt.key}
                type="button"
                aria-pressed={statusFilter === opt.key}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors min-h-[44px] sm:min-h-0 inline-flex items-center justify-center ${
                  statusFilter === opt.key
                    ? 'bg-parish-primary text-text-inverse shadow-xs'
                    : 'bg-surface-card text-text-muted hover:text-text-main border border-surface-border hover:bg-surface-hover'
                }`}
                onClick={() => setStatusFilter(opt.key)}
              >
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {participants.length === 0 ? (
        <EmptyState icon={Users} title="Chưa có người tham dự" description="Thêm người tham gia sự kiện để theo dõi số lượng và xác nhận." className="py-6" />
      ) : filteredParticipants.length === 0 ? (
        <EmptyState icon={Search} title="Không tìm thấy người tham dự" description="Không có người tham dự nào khớp với từ khóa tìm kiếm hoặc bộ lọc trạng thái." className="py-6" />
      ) : (
        <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-card overflow-hidden shadow-2xs">
          {filteredParticipants.map(participant => (
            <div key={participant.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:py-3 hover:bg-surface-hover/30 transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-ground text-text-muted text-xs font-bold shrink-0">
                  {displayName(participant).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 truncate">
                  <span className="text-sm font-semibold text-text-main">
                    {displayName(participant)}
                  </span>
                  {participant.participantRole && participant.participantRole !== 'ATTENDEE' && (
                    <span className="ml-2 text-xs text-text-muted">· {participant.participantRole}</span>
                  )}
                  <Badge tone={STATUS_TONES[participant.attendanceStatus]} className="ml-2">
                    {STATUS_LABELS_VI[participant.attendanceStatus]}
                  </Badge>
                </div>
              </div>
              {canManage && (
                <Select
                  aria-label={`Trạng thái tham dự của ${displayName(participant)}`}
                  className="w-40 sm:w-44 min-h-[44px] sm:min-h-0 text-xs"
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
      )}
    </section>
  )
}
