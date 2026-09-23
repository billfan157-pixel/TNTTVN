import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TiniAttendanceImportPanel } from '../../components/attendance/TiniAttendanceImportPanel'
import { tiniImportApi } from '../../lib/api/tiniImport'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { hasUnsettledLocalAttendanceInSelectedScope } from '../../lib/tiniImportPreflight'

vi.mock('../../lib/api/tiniImport', () => ({ tiniImportApi: {
  preview: vi.fn(), links: vi.fn(), candidates: vi.fn(), commit: vi.fn(), saveLink: vi.fn(),
  saveSuggestedLinks: vi.fn(), retireLink: vi.fn(),
} }))
vi.mock('../../stores/attendanceStore', () => ({ useAttendanceStore: {
  getState: vi.fn(),
} }))
vi.mock('../../lib/tiniImportPreflight', () => ({
  hasUnsettledLocalAttendanceInSelectedScope: vi.fn(),
}))

const raw = '{"format":"catevia-tini-dom-attendance","academicYear":{"externalId":"2"}}'
const preview = {
  runId: 'EIR-test', previewDigest: 'digest', partial: true, renderedStudentRows: 1,
  rowErrors: [], sourceYear: '2026-2027', sourceSchemaVersion: 2,
  profileComparisonAvailable: true, studentProfileSuggestions: [], identityLinkSuggestions: [], counts: { new: 1 },
  items: [{ index: 0, observationHash: 'hash', classification: 'new', targetStudentId: 'ST-1',
    expectedVersion: 0, normalized: { type: 'SundayMass', status: 'Present' },
    observation: { externalStudentId: '1000001', studentName: 'Học viên Mẫu',
      externalClassId: 'l_22', className: 'ẤU NHI 1A', date: '2026-09-20',
      sourceTitle: 'Có mặt Thánh lễ', sourceFingerprint: 'a'.repeat(64), late: false } }],
}

describe('admin TINI import preview and confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(tiniImportApi.preview).mockResolvedValue(preview as any)
    vi.mocked(tiniImportApi.links).mockResolvedValue([])
    vi.mocked(tiniImportApi.candidates).mockResolvedValue({ classes: [], students: [] })
    vi.mocked(tiniImportApi.commit).mockResolvedValue({ runId: 'EIR-test',
      receipts: [{ index: 0, outcome: 'created', attendanceId: 'ATT-1', version: 1 }] })
    vi.mocked(tiniImportApi.saveSuggestedLinks).mockResolvedValue({ runId: 'EIR-test', links: [] })
    vi.mocked(hasUnsettledLocalAttendanceInSelectedScope).mockResolvedValue(false)
    vi.mocked(useAttendanceStore.getState).mockReturnValue({ fetchAttendance: vi.fn().mockResolvedValue(undefined) } as any)
  })

  it('requires a selected item and explicit confirmation, then pulls authoritative Attendance', async () => {
    render(<TiniAttendanceImportPanel />)
    const file = new File([raw], 'source.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => raw })
    fireEvent.change(screen.getByLabelText('Tệp xuất từ TINI'), { target: { files: [file] } })
    await screen.findByText(/Trang nguồn còn nút/)
    const commit = screen.getByRole('button', { name: 'Xác nhận nhập 0 lượt' })
    expect(commit).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn lượt 1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã đối chiếu/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhập 1 lượt' }))
    await waitFor(() => expect(tiniImportApi.commit).toHaveBeenCalledWith('EIR-test', raw, [0]))
    await waitFor(() => expect(useAttendanceStore.getState().fetchAttendance).toHaveBeenCalled())
    expect(await screen.findByText(/Đã xử lý 1 lượt/)).toBeInTheDocument()
  })

  it('blocks commit while this device has unsettled Attendance in the selected scope', async () => {
    vi.mocked(hasUnsettledLocalAttendanceInSelectedScope).mockResolvedValue(true)
    render(<TiniAttendanceImportPanel />)
    const file = new File([raw], 'source.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => raw })
    fireEvent.change(screen.getByLabelText('Tệp xuất từ TINI'), { target: { files: [file] } })
    await screen.findByText(/Trang nguồn còn nút/)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn lượt 1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã đối chiếu/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhập 1 lượt' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/còn điểm danh chưa đồng bộ/)
    expect(tiniImportApi.commit).not.toHaveBeenCalled()
  })

  it('shows profile differences as review-only proposals', async () => {
    vi.mocked(tiniImportApi.preview).mockResolvedValue({
      ...preview,
      studentProfileSuggestions: [{
        externalStudentId: '1000001', targetStudentId: 'ST-1', targetStudentCode: 'TN260001',
        identityBasis: 'reviewed_external_id_link',
        differences: [
          { field: 'displayName', kind: 'content', cateviaValue: 'Phaolô Nguyễn Văn Cũ',
            tiniValue: 'Phaolô Nguyễn Văn Đúng', recommendation: 'review_name_parts' },
          { field: 'dateOfBirth', kind: 'birth_date', cateviaValue: '2015-01-01',
            tiniValue: '2015-02-02', recommendation: 'review_birth_date' },
          { field: 'classMembership', kind: 'membership', cateviaValue: 'Ấu Nhi 1B',
            tiniValue: 'Ấu Nhi 1A', proposedClassId: 'CLS-1A',
            recommendation: 'use_membership_correction_workflow' },
        ],
      }],
    } as any)
    render(<TiniAttendanceImportPanel />)
    const file = new File([raw], 'source.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => raw })
    fireEvent.change(screen.getByLabelText('Tệp xuất từ TINI'), { target: { files: [file] } })
    expect(await screen.findByRole('heading', { name: 'Đề xuất đồng bộ thông tin học viên' })).toBeInTheDocument()
    expect(screen.getByText('Tên hiển thị khác nội dung')).toBeInTheDocument()
    expect(screen.getByText('Ngày sinh khác TINI')).toBeInTheDocument()
    expect(screen.getByText('Lớp đang học khác TINI')).toBeInTheDocument()
    expect(screen.getByText(/không tự sửa dữ liệu/)).toBeInTheDocument()
  })

  it('requires explicit selection of a high-confidence match before batch review', async () => {
    vi.mocked(tiniImportApi.preview)
      .mockResolvedValueOnce({
        ...preview,
        identityLinkSuggestions: [{
          entityKind: 'student', externalScope: '', externalId: '1000001',
          sourceName: 'Phaolô Học viên Mẫu', sourceDateOfBirth: '2015-01-01',
          status: 'high_confidence', recommendedTargetId: 'ST-1', candidates: [{
            targetId: 'ST-1', targetCode: 'TN260001', targetName: 'Phaolô Học viên Mẫu',
            targetClassId: 'CLS-1', targetClassName: 'Ấu Nhi 1A',
            evidence: ['name_exact', 'date_of_birth_exact', 'class_link_reviewed'],
          }],
        }],
      } as any)
      .mockResolvedValueOnce(preview as any)
    render(<TiniAttendanceImportPanel />)
    const file = new File([raw], 'source.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => raw })
    fireEvent.change(screen.getByLabelText('Tệp xuất từ TINI'), { target: { files: [file] } })
    expect(await screen.findByText('Đủ bằng chứng để đề xuất')).toBeInTheDocument()
    const suggestion = screen.getByRole('checkbox', { name: 'Chọn đề xuất 1000001' })
    expect(suggestion).not.toBeChecked()
    fireEvent.click(suggestion)
    fireEvent.change(screen.getByLabelText('Lý do duyệt liên kết'), {
      target: { value: 'Đã đối chiếu tên ngày sinh và lớp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt 1 liên kết đề xuất' }))
    await waitFor(() => expect(tiniImportApi.saveSuggestedLinks).toHaveBeenCalledWith({
      runId: 'EIR-test', sourceFile: raw,
      selected: [{ entityKind: 'student', externalId: '1000001', targetId: 'ST-1' }],
      reason: 'Đã đối chiếu tên ngày sinh và lớp',
    }))
  })

  it('warns that legacy files cannot support trusted profile comparison', async () => {
    vi.mocked(tiniImportApi.preview).mockResolvedValue({
      ...preview, sourceSchemaVersion: 1, profileComparisonAvailable: false,
    } as any)
    render(<TiniAttendanceImportPanel />)
    const file = new File([raw], 'legacy.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => raw })
    fireEvent.change(screen.getByLabelText('Tệp xuất từ TINI'), { target: { files: [file] } })
    expect(await screen.findByText(/định dạng cũ/)).toBeInTheDocument()
  })
})
