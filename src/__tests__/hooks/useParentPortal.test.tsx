import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import type { ParentChild, ReportCardDTO } from '../../types'
import { useParentPortal } from '../../hooks/useParentPortal'
import { setTenantScope } from '../../lib/tenantScope'

const { getMyChildrenMock, getStudentReportCardMock, yearState, yearListeners } = vi.hoisted(() => ({
  getMyChildrenMock: vi.fn(),
  getStudentReportCardMock: vi.fn(),
  yearState: { year: '2025-2026' },
  yearListeners: new Set<(state: unknown) => void>(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    getMyChildren: (...args: unknown[]) => getMyChildrenMock(...args),
    getStudentReportCard: (...args: unknown[]) => getStudentReportCardMock(...args),
  },
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: {
    getState: () => ({ resolveActiveYear: () => yearState.year }),
    subscribe: (listener: (state: unknown) => void) => {
      yearListeners.add(listener)
      return () => yearListeners.delete(listener)
    },
  },
}))

const children: ParentChild[] = [
  { id: 'child-1', code: 'TN001', fullName: 'Hoa', branch: 'AuNhi', className: 'AuNhi 1', status: 'ACTIVE', classId: 'c1', classCode: 'AN1', holyName: 'Maria', gender: 'female', dateOfBirth: '2015-01-01' },
  { id: 'child-2', code: 'TN002', fullName: 'Nam', branch: 'ThieuNhi', className: 'TN 1', status: 'ACTIVE', classId: 'c2', classCode: 'TN1', holyName: 'Giuse', gender: 'male', dateOfBirth: '2013-01-01' },
]

function reportFor(childId: string, academicYear = '2025-2026'): ReportCardDTO {
  return {
    student: { id: childId, code: `TN-${childId}`, fullName: `Bé ${childId}`, holyName: 'Maria' },
    academicYear,
    grades: [],
    yearSummary: { gpa: 8, classification: 'Giỏi' },
    attendanceSummary: { massPresentCount: 1, massTotalCount: 2, catechismPresentCount: 1, catechismTotalCount: 2, overallAttendanceRate: 50 },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function Probe() {
  const portal = useParentPortal()
  return (
    <div>
      <span data-testid="selected">{portal.selectedId ?? '-'}</span>
      <span data-testid="report">{portal.report?.student.id ?? '-'}</span>
      <span data-testid="report-loading">{String(portal.reportLoading)}</span>
      <span data-testid="report-error">{portal.reportError}</span>
      <span data-testid="children">{portal.children.map(child => child.id).join(',')}</span>
      <button type="button" onClick={() => portal.selectChild('child-2')}>pick-2</button>
      <button type="button" onClick={() => portal.selectChild('child-1')}>pick-1</button>
    </div>
  )
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useParentPortal (FE-F2)', () => {
  beforeEach(() => {
    getMyChildrenMock.mockReset()
    getStudentReportCardMock.mockReset()
    yearListeners.clear()
    yearState.year = '2025-2026'
    setTenantScope({ parishId: 'PARISH-A', userId: 'PARENT-A' })
    getMyChildrenMock.mockResolvedValue(children)
  })

  afterEach(() => setTenantScope(null))

  it('mỗi lần đổi lựa chọn chỉ phát đúng một request tải phiếu điểm', async () => {
    getStudentReportCardMock.mockImplementation(async (childId: string) => reportFor(childId))

    await act(async () => { render(<Probe />) })
    await flush()

    expect(getStudentReportCardMock).toHaveBeenCalledTimes(1)
    expect(getStudentReportCardMock).toHaveBeenCalledWith('child-1', '2025-2026')
    expect(screen.getByTestId('report').textContent).toBe('child-1')

    // Click lại cùng một thiếu nhi không tạo tải thứ hai.
    fireEvent.click(screen.getByText('pick-1'))
    await flush()
    expect(getStudentReportCardMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('pick-2'))
    await flush()
    expect(getStudentReportCardMock).toHaveBeenCalledTimes(2)
    expect(getStudentReportCardMock).toHaveBeenLastCalledWith('child-2', '2025-2026')
    expect(screen.getByTestId('report').textContent).toBe('child-2')
  })

  it('phản hồi cũ (đến muộn) không ghi đè lựa chọn hiện tại', async () => {
    const slow = deferred<ReportCardDTO>()
    const fast = deferred<ReportCardDTO>()
    getStudentReportCardMock
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => fast.promise)

    await act(async () => { render(<Probe />) })
    await flush()
    expect(screen.getByTestId('report-loading').textContent).toBe('true')

    fireEvent.click(screen.getByText('pick-2'))
    await flush()

    fast.resolve(reportFor('child-2'))
    await flush()
    expect(screen.getByTestId('report').textContent).toBe('child-2')

    // child-1 trả về sau khi người dùng đã chọn child-2 → phải bị bỏ qua.
    slow.resolve(reportFor('child-1'))
    await flush()
    expect(screen.getByTestId('report').textContent).toBe('child-2')
    expect(screen.getByTestId('report-loading').textContent).toBe('false')
  })

  it('DTO không đúng thiếu nhi đang chọn bị từ chối (không thể in nhầm)', async () => {
    getStudentReportCardMock.mockResolvedValue(reportFor('child-9'))

    await act(async () => { render(<Probe />) })
    await flush()

    expect(getStudentReportCardMock).toHaveBeenCalledWith('child-1', '2025-2026')
    expect(screen.getByTestId('report').textContent).toBe('-')
    expect(screen.getByTestId('report-error').textContent).toContain('không khớp')
  })

  it('rejects a report from the wrong academic year with a visible error', async () => {
    getStudentReportCardMock.mockResolvedValue(reportFor('child-1', '2024-2025'))
    await act(async () => { render(<Probe />) })
    await flush()
    expect(screen.getByTestId('report').textContent).toBe('-')
    expect(screen.getByTestId('report-error').textContent).toContain('không khớp')
    expect(screen.getByTestId('report-loading').textContent).toBe('false')
  })

  it('does not let a late failure replace the report of the selected child', async () => {
    const slow = deferred<ReportCardDTO>()
    getStudentReportCardMock.mockImplementationOnce(() => slow.promise).mockResolvedValue(reportFor('child-2'))
    await act(async () => { render(<Probe />) })
    await flush()
    fireEvent.click(screen.getByText('pick-2'))
    await flush()
    slow.reject({ status: 403 })
    await flush()
    expect(screen.getByTestId('report').textContent).toBe('child-2')
    expect(screen.getByTestId('report-error').textContent).toBe('')
  })

  it.each([false, true])('ignores child lists from an expired owner revision (return to A: %s)', async (returnToA) => {
    const slow = deferred<ParentChild[]>()
    getMyChildrenMock.mockReturnValue(slow.promise)
    await act(async () => { render(<Probe />) })
    setTenantScope({ parishId: 'PARISH-B', userId: 'PARENT-B' })
    if (returnToA) setTenantScope({ parishId: 'PARISH-A', userId: 'PARENT-A' })
    slow.resolve(children)
    await flush()
    expect(screen.getByTestId('children').textContent).toBe('')
    expect(getStudentReportCardMock).not.toHaveBeenCalled()
  })

  it('ignores report failures belonging to an expired owner revision', async () => {
    const slow = deferred<ReportCardDTO>()
    getStudentReportCardMock.mockReturnValue(slow.promise)
    await act(async () => { render(<Probe />) })
    await flush()
    setTenantScope({ parishId: 'PARISH-B', userId: 'PARENT-B' })
    slow.reject({ status: 403 })
    await flush()
    expect(screen.getByTestId('report-error').textContent).toBe('')
  })

  it('đổi năm học hoạt động sẽ tải lại phiếu điểm theo năm mới', async () => {
    getStudentReportCardMock.mockImplementation(async (childId: string, year: string) => reportFor(childId, year))

    await act(async () => { render(<Probe />) })
    await flush()
    expect(getStudentReportCardMock).toHaveBeenCalledTimes(1)

    yearState.year = '2026-2027'
    await act(async () => {
      for (const listener of yearListeners) listener({ resolveActiveYear: () => yearState.year })
    })
    await flush()

    expect(getStudentReportCardMock).toHaveBeenCalledTimes(2)
    expect(getStudentReportCardMock).toHaveBeenLastCalledWith('child-1', '2026-2027')
  })
})
