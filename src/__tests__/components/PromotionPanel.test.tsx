import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PromotionPanel } from '../../components/desktop/PromotionPanel'

const mocks = vi.hoisted(() => ({
  askConfirm: vi.fn(),
  evaluateStudent: vi.fn(),
  batchApproveStudents: vi.fn(),
  applyLocalPromotions: vi.fn(),
}))

const student = {
  id: 'ST-1', code: 'TN1', holyName: 'Maria', fullName: 'Nguyễn An', gender: 'Nữ',
  dateOfBirth: '2014-01-01', parentName: '', parentPhone: '', address: '',
  branch: 'AuNhi', classId: 'AU1', status: 'Đang học',
}

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: (selector: any) => selector({ students: [student], applyLocalPromotions: mocks.applyLocalPromotions }),
}))
vi.mock('../../stores/gradeStore', () => ({
  useGradeStore: (selector: any) => selector({ calculateStudentAvg: () => ({ score: 8 }) }),
}))
vi.mock('../../stores/attendanceStore', () => ({
  useAttendanceStore: (selector: any) => selector({ getStudentAttendanceRate: () => ({ rate: 100 }) }),
}))
vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector: any) => selector({
    settings: {
      promotionPolicy: { minGpa: 5, minAttendance: 80 },
      gradeWeights: { oral: 1, fifteenMin: 1, onePeriod: 2, midterm: 2, final: 3, roundingDecimal: 1 },
    },
  }),
}))
vi.mock('../../stores/classStore', () => ({
  useClassStore: (selector: any) => selector({
    getClassList: () => [
      { id: 'AU1', name: 'Ấu Nhi 1', branch: 'AuNhi' },
      { id: 'AU2', name: 'Ấu Nhi 2', branch: 'AuNhi' },
    ],
  }),
}))
vi.mock('../../stores/promotionStore', () => ({
  usePromotionStore: (selector: any) => selector({
    evaluateStudent: mocks.evaluateStudent,
    batchApproveStudents: mocks.batchApproveStudents,
    done: false,
    setDone: vi.fn(),
  }),
}))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ can: () => true }) }))
vi.mock('../../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ askConfirm: mocks.askConfirm, dialog: null }),
}))
vi.mock('../../lib/api', () => ({ isAuthenticated: () => true }))
vi.mock('../../utils/sacraments', () => ({
  getAcademicYear: () => '2025-2026',
  checkPromotionEligibility: () => ({ canPromote: true, reasons: [] }),
  computeNextClassForStudent: () => ({ classId: 'AU2', nextBranch: null, matchedBy: 'grade' }),
  getSacramentStatus: () => ({ baptism: { done: false }, firstCommunion: { done: false }, confirmation: { done: false }, nextSacrament: null }),
  getClassIdForBranch: () => 'AU2',
}))
vi.mock('../../utils/grades', () => ({
  getClassificationLabel: () => 'Giỏi',
  calculateYearlyGpa: () => ({ gpa: 8 }),
}))
vi.mock('../../components/common/ModalShell', () => ({
  ModalShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../components/common/StudentName', () => ({
  StudentName: ({ fullName }: { fullName: string }) => <span>{fullName}</span>,
}))
vi.mock('lucide-react', () => ({
  ArrowRight: () => null, CheckCircle2: () => null, XCircle: () => null,
  ChevronRight: () => null, Award: () => null, IdCard: () => null,
  Upload: () => null, Loader2: () => null, AlertTriangle: () => null,
  TrendingUp: () => null,
}))
vi.mock('../../constants/branches', () => ({
  BRANCHES: { AuNhi: { name: 'Ấu Nhi', badgeBg: '#fff', textColor: '#000' } },
}))

describe('PromotionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.askConfirm.mockResolvedValue(true)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
  })

  it('fails closed offline without evaluating, mutating locally, or queueing a generic student update', async () => {
    render(<PromotionPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Thực Hiện Thăng Tiến/i }))
    fireEvent.click(screen.getByRole('button', { name: /Xác Nhận & Thực Hiện/i }))

    await waitFor(() => expect(mocks.askConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Cần kết nối máy chủ',
      variant: 'warning',
    })))
    expect(mocks.evaluateStudent).not.toHaveBeenCalled()
    expect(mocks.batchApproveStudents).not.toHaveBeenCalled()
    expect(mocks.applyLocalPromotions).not.toHaveBeenCalled()
  })
})
