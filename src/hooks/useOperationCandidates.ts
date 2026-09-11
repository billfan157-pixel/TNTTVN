import { useEffect, useState } from 'react'
import { operationsApi, type OperationAssignmentTarget, type OperationCandidate, type OperationCandidateTarget } from '../lib/api/operations'
import { getTenantScope } from '../lib/tenantScope'

export function operationCandidateValue(candidate: OperationCandidate): string {
  return candidate.personId ? `person:${candidate.personId}` : candidate.userId ? `user:${candidate.userId}` : ''
}

export function parseOperationCandidateValue(value: string): OperationAssignmentTarget | null {
  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1) return null
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (kind === 'person') return { personId: id }
  if (kind === 'user') return { userId: id }
  return null
}

export function useOperationCandidates(target: OperationCandidateTarget | null, enabled: boolean) {
  const [candidates, setCandidates] = useState<OperationCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const targetKind = target ? Object.keys(target)[0] as keyof OperationCandidateTarget : null
  const targetId = target && targetKind ? (target as Record<string, string>)[targetKind] : null

  useEffect(() => {
    if (!enabled || !targetKind || !targetId) { setCandidates([]); setLoading(false); setError(''); return }
    const scope = getTenantScope()
    if (!scope?.parishId || !scope.userId) { setCandidates([]); setError('Phiên giáo xứ chưa sẵn sàng.'); return }
    const requestTarget = { [targetKind]: targetId } as OperationCandidateTarget
    let active = true
    const sameSession = () => {
      const current = getTenantScope()
      return current?.parishId === scope.parishId && current.userId === scope.userId
    }
    setLoading(true); setError('')
    void operationsApi.getCandidates(requestTarget).then(response => {
      if (!active || !sameSession()) return
      if (response.data.some(candidate => candidate.parishId !== scope.parishId)) throw new Error('Máy chủ trả ứng viên sai phạm vi giáo xứ.')
      setCandidates(response.data)
    }).catch(failure => {
      if (active && sameSession()) { setCandidates([]); setError(failure instanceof Error ? failure.message : 'Không tải được danh sách phân công.') }
    }).finally(() => { if (active && sameSession()) setLoading(false) })
    return () => { active = false }
  }, [enabled, targetId, targetKind])

  return { candidates, loading, error }
}
