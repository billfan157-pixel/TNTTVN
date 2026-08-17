import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ParentChild, ReportCardDTO } from '../types'
import { useAcademicYearStore } from '../stores/academicYearStore'

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

export function useParentPortal(): UseParentPortalResult {
  const [children, setChildren] = useState<ParentChild[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [report, setReport] = useState<ReportCardDTO | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getMyChildren()
      .then(list => {
        if (cancelled) return
        const normalized = Array.isArray(list) ? list : []
        setChildren(normalized)
        if (normalized.length > 0) setSelectedId(normalized[0].id)
      })
      .catch(() => { if (!cancelled) setError('Không thể tải danh sách con. Vui lòng thử lại.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const loadReport = useCallback(async (childId: string) => {
    const academicYear = useAcademicYearStore.getState().resolveActiveYear()
    setReportLoading(true)
    setReportError('')
    setReport(null)
    try {
      const dto = await api.getStudentReportCard(childId, academicYear)
      setReport(dto)
    } catch (err: any) {
      const status = err?.status
      setReportError(status === 403
        ? 'Bạn không có quyền xem phiếu điểm này.'
        : status === 404
          ? 'Không tìm thấy phiếu điểm.'
          : 'Không thể tải phiếu điểm. Vui lòng thử lại.')
    } finally {
      setReportLoading(false)
    }
  }, [])

  const selectChild = useCallback((childId: string) => {
    setSelectedId(childId)
    loadReport(childId)
  }, [loadReport])

  useEffect(() => {
    if (selectedId) loadReport(selectedId)
  }, [selectedId, loadReport])

  return { children, loading, error, selectedId, report, reportLoading, reportError, selectChild }
}
