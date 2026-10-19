import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { ParentChild, ReportCardDTO } from '../types'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { captureTenantScope, getTenantScopeKey, isTenantScopeCurrent } from '../lib/tenantScope'
import { normalizeAcademicYear } from '../utils/academicYear'

export interface UseParentPortalResult {
  children: ParentChild[]
  loading: boolean
  error: string
  selectedId: string | null
  report: ReportCardDTO | null
  reportLoading: boolean
  reportError: string
  selectChild: (childId: string) => void
}

/**
 * FE-F2: một owner duy nhất chịu trách nhiệm tải phiếu điểm, key theo
 * (phiên đăng nhập + giáo xứ, thiếu nhi, năm học).
 *
 * - Mọi lần chọn thiếu nhi chỉ phát ĐÚNG một request (effect theo selectedId;
 *   click lại cùng một em không enqueue thêm).
 * - Phản hồi cũ bị bỏ qua bằng số thứ tự request (`requestSeqRef`) — không thể
 *   ghi đè report của lựa chọn mới nhất.
 * - Dữ liệu chỉ được áp dụng khi scope (parishId, userId) tại thời điểm gửi vẫn
 *   còn hiệu lực — đổi phiên/giáo xứ giữa chừng sẽ không rò dữ liệu sang.
 */
export function useParentPortal(): UseParentPortalResult {
  const [children, setChildren] = useState<ParentChild[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [report, setReport] = useState<ReportCardDTO | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const requestSeqRef = useRef(0)
  const [activeYear, setActiveYear] = useState(() => useAcademicYearStore.getState().resolveActiveYear())

  // Năm học hoạt động là một phần key của phiếu điểm: đổi năm học phải tải lại.
  useEffect(() => {
    const unsubscribe = useAcademicYearStore.subscribe?.((state) => {
      const year = state.resolveActiveYear()
      setActiveYear((previous) => (previous === year ? previous : year))
    })
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    let cancelled = false
    const scope = captureTenantScope()
    const scopeKey = getTenantScopeKey()
    const isCurrent = () => !cancelled && getTenantScopeKey() === scopeKey && (!scope || isTenantScopeCurrent(scope))
    setLoading(true)
    api.getMyChildren()
      .then(list => {
        if (!isCurrent()) return
        const normalized = Array.isArray(list) ? list : []
        setChildren(normalized)
        if (normalized.length > 0) setSelectedId(normalized[0].id)
      })
      .catch(() => { if (isCurrent()) setError('Không thể tải danh sách con. Vui lòng thử lại.') })
      .finally(() => { if (isCurrent()) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => () => {
    // Unmount huỷ mọi phản hồi đang bay để không set state sau khi rời trang.
    requestSeqRef.current += 1
  }, [])

  const loadReport = useCallback(async (childId: string) => {
    const requestId = ++requestSeqRef.current
    // Key đầy đủ của một lần tải: (scope phiên, thiếu nhi, năm học).
    const scope = captureTenantScope()
    const scopeKey = getTenantScopeKey()
    const sameOwner = () => getTenantScopeKey() === scopeKey && (!scope || isTenantScopeCurrent(scope))
    const academicYear = useAcademicYearStore.getState().resolveActiveYear()
    setReportLoading(true)
    setReportError('')
    setReport(null)
    try {
      const dto = await api.getStudentReportCard(childId, academicYear)
      if (requestId !== requestSeqRef.current) return
      if (!sameOwner()) return
      // Chỉ nhận DTO đúng thiếu nhi + đúng năm học đã yêu cầu: phiếu điểm không
      // bao giờ được áp cho một lựa chọn khác (kể cả khi in).
      if (dto.student?.id !== childId || normalizeAcademicYear(dto.academicYear) !== normalizeAcademicYear(academicYear)) {
        setReportError('Phiếu điểm không khớp thiếu nhi hoặc năm học đã chọn. Vui lòng thử lại.')
        return
      }
      setReport(dto)
    } catch (err: any) {
      if (requestId !== requestSeqRef.current || !sameOwner()) return
      const status = err?.status
      setReportError(status === 403
        ? 'Bạn không có quyền xem phiếu điểm này.'
        : status === 404
          ? 'Không tìm thấy phiếu điểm.'
          : 'Không thể tải phiếu điểm. Vui lòng thử lại.')
    } finally {
      if (requestId === requestSeqRef.current && sameOwner()) setReportLoading(false)
    }
  }, [])

  const selectChild = useCallback((childId: string) => {
    // Chỉ đổi lựa chọn; effect bên dưới là nơi duy nhất phát request. React bỏ
    // qua setState cùng giá trị nên click lại không tạo tải thứ hai.
    setSelectedId(childId)
  }, [])

  useEffect(() => {
    if (selectedId) void loadReport(selectedId)
  }, [selectedId, activeYear, loadReport])

  return { children, loading, error, selectedId, report, reportLoading, reportError, selectChild }
}
