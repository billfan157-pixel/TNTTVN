import { useCallback, useEffect, useRef, useState } from 'react'
import { UsersRound } from 'lucide-react'
import { EmptyState } from '../common/StateFeedback'
import { Button, Select, TextInput } from '../common/ui'
import {
  operationsApi,
  type OperationTask,
  type OperationUnitOption,
  type OperationWorkstream,
  type OperationWorkstreamDetail,
  type OperationWorkstreamMember,
} from '../../lib/api/operations'
import { getTenantScope, getTenantScopeKey } from '../../lib/tenantScope'
import { operationCandidateValue, parseOperationCandidateValue, useOperationCandidates } from '../../hooks/useOperationCandidates'

const memberRoles: Record<OperationWorkstreamMember['operationRole'], string> = {
  WORKSTREAM_LEAD: 'Trưởng nhóm',
  CONTRIBUTOR: 'Thành viên',
  APPROVER: 'Người duyệt',
  OBSERVER: 'Theo dõi',
}

export function StandaloneWorkstreamsPanel({ enabled }: { enabled: boolean }) {
  const [units, setUnits] = useState<OperationUnitOption[]>([])
  const [groups, setGroups] = useState<OperationWorkstream[]>([])
  const [detail, setDetail] = useState<OperationWorkstreamDetail | null>(null)
  const [tasks, setTasks] = useState<OperationTask[]>([])
  const [unitId, setUnitId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [memberTarget, setMemberTarget] = useState('')
  const [memberRole, setMemberRole] = useState<OperationWorkstreamMember['operationRole']>('CONTRIBUTOR')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [taskId, setTaskId] = useState('')
  const [taskTarget, setTaskTarget] = useState('')
  const [taskRole, setTaskRole] = useState<'OWNER' | 'CONTRIBUTOR' | 'APPROVER' | 'OBSERVER'>('OWNER')
  const [assignmentWarnings, setAssignmentWarnings] = useState<Array<{ id: string; startsAt: string; endsAt: string }>>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const inFlight = useRef(false)
  const scopeKey = getTenantScopeKey()
  const invalidateRequests = useCallback(() => { generation.current++ }, [])

  const candidateDirectory = useOperationCandidates(
    detail ? { workstreamId: detail.workstream.id } : null,
    Boolean(enabled && detail && (detail.permissions['operations.workstream.manage'] || detail.permissions['operations.task.assign'])),
  )
  const candidates = candidateDirectory.candidates.filter(candidate => candidate.eligibility !== 'INELIGIBLE')

  const loadOverview = useCallback(async () => {
    if (!enabled) return
    const scope = getTenantScopeKey()
    if (!scope) return
    const token = generation.current
    try {
      const [unitPage, groupPage] = await Promise.all([
        operationsApi.getAssignableUnits(),
        operationsApi.getStandaloneWorkstreams(),
      ])
      if (token !== generation.current || scope !== getTenantScopeKey()) return
      const parishId = getTenantScope()?.parishId
      if (!parishId) return
      if (unitPage.data.some(unit => unit.parishId !== parishId) || groupPage.data.some(group => group.parishId !== parishId || group.operationEventId !== null)) {
        throw new Error('Máy chủ trả nhóm độc lập sai phạm vi giáo xứ.')
      }
      setUnits(unitPage.data)
      setGroups(groupPage.data)
      setUnitId(current => current || unitPage.data[0]?.id || '')
    } catch (failure) {
      if (token === generation.current && scope === getTenantScopeKey()) setMessage(failure instanceof Error ? failure.message : 'Không tải được nhóm độc lập.')
    }
  }, [enabled])

  useEffect(() => {
    invalidateRequests()
    void loadOverview()
    return invalidateRequests
  }, [invalidateRequests, loadOverview, scopeKey])

  const loadGroup = async (id: string) => {
    const scope = getTenantScopeKey()
    if (!scope) return
    const token = generation.current
    const [nextDetail, taskPage] = await Promise.all([
      operationsApi.getWorkstream(id),
      operationsApi.getWorkstreamTasks(id, 1, 500),
    ])
    if (token !== generation.current || scope !== getTenantScopeKey()) return
    const parishId = getTenantScope()?.parishId
    if (!parishId) return
    if (nextDetail.workstream.id !== id || nextDetail.workstream.parishId !== parishId || nextDetail.workstream.operationEventId !== null
      || nextDetail.members.some(member => member.parishId !== parishId || member.workstreamId !== id)
      || taskPage.data.some(task => task.parishId !== parishId || task.workstreamId !== id || task.operationEventId !== null)) {
      throw new Error('Chi tiết nhóm độc lập sai phạm vi tài khoản hiện tại.')
    }
    setDetail(nextDetail)
    setTasks(taskPage.data)
    setAssignmentWarnings([])
    setTaskId(current => taskPage.data.some(task => task.id === current) ? current : taskPage.data[0]?.id || '')
  }

  const run = async <T,>(action: () => Promise<T>, reloadSelected = false, onSuccess?: (value: T) => void | Promise<void>) => {
    const scope = getTenantScopeKey()
    if (!enabled || !scope || inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage('')
    const token = generation.current
    const current = () => token === generation.current && scope === getTenantScopeKey()
    try {
      const value = await action()
      if (!current()) return
      await loadOverview()
      if (reloadSelected && detail && current()) await loadGroup(detail.workstream.id)
      if (current() && onSuccess) await onSuccess(value)
    } catch (failure) {
      if (current()) {
        if (reloadSelected) { setDetail(null); setTasks([]) }
        setMessage(failure instanceof Error ? failure.message : 'Không cập nhật được nhóm độc lập.')
      }
    } finally {
      inFlight.current = false
      if (current()) setBusy(false)
    }
  }

  return <section className="space-y-3 rounded-xl border border-surface-border p-4" aria-label="Nhóm công việc độc lập">
    <div>
      <h2 className="m-0 text-sm font-extrabold text-text-main">Nhóm công việc độc lập</h2>
      <p className="mb-0 mt-1 text-xs text-text-muted">Nhóm thường trực không thuộc một sự kiện; quyền giao việc vẫn theo đúng Ban/Ngành phụ trách.</p>
    </div>
    {units.length > 0 && <form className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={event => {
      event.preventDefault()
      if (!unitId || !groupName.trim()) return
      void run(
        () => operationsApi.createWorkstream({ eventId: null, sourceUnitId: unitId, name: groupName.trim(), isRequired: false }),
        false,
        async created => {
          setGroupName('')
          setGroups(current => current.some(group => group.id === created.id) ? current : [...current, created])
          await loadGroup(created.id)
        },
      )
    }}>
      <Select aria-label="Đơn vị phụ trách nhóm độc lập" value={unitId} disabled={busy} onChange={event => setUnitId(event.target.value)}>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</Select>
      <TextInput aria-label="Tên nhóm độc lập" value={groupName} maxLength={200} required disabled={busy} placeholder="Ví dụ: Ban truyền thông thường trực" onChange={event => setGroupName(event.target.value)} />
      <Button type="submit" size="sm" disabled={busy || !unitId || !groupName.trim()}>Tạo nhóm</Button>
    </form>}
    {groups.length === 0
      ? <EmptyState icon={UsersRound} title="Chưa có nhóm độc lập trong phạm vi của bạn." description={units.length > 0 ? 'Tạo nhóm cho đúng đơn vị phụ trách để bắt đầu phân công.' : 'Bạn chưa có quyền tạo nhóm tại đơn vị nào.'} className="py-5" />
      : <div className="flex flex-wrap gap-2">{groups.map(group => <Button key={group.id} variant="secondary" size="sm" disabled={!enabled || busy} onClick={() => void run(() => loadGroup(group.id))}>{group.name}</Button>)}</div>}

    {detail && <div className="space-y-3 rounded-lg border border-surface-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="m-0 text-sm font-bold text-text-main">{detail.workstream.name}</h3><Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => loadGroup(detail.workstream.id))}>Tải lại nhóm</Button></div>
      {detail.members.map(member => <p key={member.id} className="m-0 text-sm text-text-main">{candidates.find(candidate => candidate.personId === member.personId || candidate.userId === member.userId)?.displayName ?? 'Thành viên được phân công'} · {memberRoles[member.operationRole]}</p>)}
      {detail.permissions['operations.workstream.manage'] && <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <Select aria-label="Thành viên nhóm độc lập" value={memberTarget} disabled={busy || candidateDirectory.loading} onChange={event => setMemberTarget(event.target.value)}><option value="">Chọn nhân sự</option>{candidates.map(candidate => <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}{candidate.eligibility === 'PLANNING_ONLY' ? ' · chưa có tài khoản' : ''}</option>)}</Select>
        <Select aria-label="Vai trò nhóm độc lập" value={memberRole} disabled={busy} onChange={event => setMemberRole(event.target.value as typeof memberRole)}>{Object.entries(memberRoles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Button size="sm" disabled={busy || !memberTarget || (memberRole === 'WORKSTREAM_LEAD' && !detail.permissions['operations.workstream.assign_lead'])} onClick={() => {
          const target = parseOperationCandidateValue(memberTarget)
          if (!target) return
          void run(() => operationsApi.addWorkstreamMember(detail.workstream.id, { version: detail.workstream.version, ...target, operationRole: memberRole }), true, () => setMemberTarget(''))
        }}>Thêm vào nhóm</Button>
      </div>}

      {detail.permissions['operations.task.create'] && <form className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={event => {
        event.preventDefault()
        if (!taskTitle.trim()) return
        void run(
          () => operationsApi.createTask({ title: taskTitle.trim(), eventId: null, workstreamId: detail.workstream.id, dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null }),
          true,
          () => { setTaskTitle(''); setTaskDueAt('') },
        )
      }}>
        <TextInput aria-label="Tên việc của nhóm độc lập" value={taskTitle} maxLength={300} required disabled={busy} placeholder="Công việc cần thực hiện" onChange={event => setTaskTitle(event.target.value)} />
        <TextInput aria-label="Hạn việc của nhóm độc lập" type="datetime-local" value={taskDueAt} disabled={busy} onChange={event => setTaskDueAt(event.target.value)} />
        <Button type="submit" size="sm" disabled={busy || !taskTitle.trim()}>Tạo việc</Button>
      </form>}

      {tasks.length > 0 && detail.permissions['operations.task.assign'] && <div className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
        <Select aria-label="Việc trong nhóm độc lập" value={taskId} disabled={busy} onChange={event => setTaskId(event.target.value)}>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</Select>
        <Select aria-label="Người nhận việc nhóm độc lập" value={taskTarget} disabled={busy || candidateDirectory.loading} onChange={event => setTaskTarget(event.target.value)}><option value="">Chọn người nhận</option>{candidates.map(candidate => <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}{candidate.eligibility === 'PLANNING_ONLY' ? ' · chưa có tài khoản' : ''}</option>)}</Select>
        <Select aria-label="Vai trò việc nhóm độc lập" value={taskRole} disabled={busy} onChange={event => setTaskRole(event.target.value as typeof taskRole)}><option value="OWNER">Phụ trách chính</option><option value="CONTRIBUTOR">Phối hợp</option><option value="APPROVER">Người duyệt</option><option value="OBSERVER">Theo dõi</option></Select>
        <Button size="sm" disabled={busy || !taskId || !taskTarget} onClick={() => {
          const task = tasks.find(item => item.id === taskId)
          const target = parseOperationCandidateValue(taskTarget)
          if (!task || !target) return
          void run(
            () => operationsApi.assignTask(task.id, { version: task.version, ...target, assignmentRole: taskRole }),
            true,
            result => { setTaskTarget(''); setAssignmentWarnings(result.conflictWarnings) },
          )
        }}>Giao việc</Button>
      </div>}
      {assignmentWarnings.length > 0 && <div role="status" className="rounded-lg border border-parish-warning/30 bg-parish-warning-bg p-3 text-sm text-text-main">
        <p className="m-0 font-bold">Đã lưu phân công, nhưng người nhận có lịch bận tại hạn công việc.</p>
        {assignmentWarnings.map(warning => <p key={warning.id} className="mb-0 mt-1">{new Date(warning.startsAt).toLocaleString('vi-VN')} – {new Date(warning.endsAt).toLocaleString('vi-VN')}</p>)}
        <p className="mb-0 mt-1 text-xs">Lý do bận được giữ riêng tư; hãy trao đổi trực tiếp trước khi coi là đã nhận việc.</p>
      </div>}
      {candidateDirectory.error && <p role="alert" className="m-0 text-sm text-text-main">{candidateDirectory.error}</p>}
    </div>}
    {message && <p role="status" className="m-0 text-sm text-text-main">{message}</p>}
  </section>
}
