import React, { useState, useEffect } from 'react'
import { Users, CheckCircle2, AlertCircle, Sparkles, Filter } from 'lucide-react'
import { useFinanceStore } from '../../stores/financeStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useClassStore } from '../../stores/classStore'
import { formatVND } from '../../utils/receiptGenerator'
import { EmptyState } from '../common/StateFeedback'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ModalShell } from '../common/ModalShell'
import { StudentName } from '../common/StudentName'
import type { StudentFeeRecord, FeeType, WritableFeeStatus } from '../../types'

interface ClassFeeCollectionModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ClassFeeCollectionModal: React.FC<ClassFeeCollectionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { classFeeRecords, fetchClassFeeRecords, updateStudentFee, updateStudentFeesBatch, funds, isLoading } = useFinanceStore()
  const { currentYear } = useAcademicYearStore()
  const getClassList = useClassStore((s) => s.getClassList)
  const classesList = getClassList()

  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [feeType, setFeeType] = useState<FeeType>('NIEN_LIEM')
  const [defaultAmount, setDefaultAmount] = useState<number>(100000)
  const [autoCreateTx, setAutoCreateTx] = useState<boolean>(true)
  const [targetFundId, setTargetFundId] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [isCollectAllConfirmOpen, setIsCollectAllConfirmOpen] = useState(false)
  const [pendingCollectAll, setPendingCollectAll] = useState(false)
  const feeAcademicYear = classesList.find((item) => item.id === selectedClassId)?.academicYearId || currentYear

  useEffect(() => {
    if (isOpen) {
      if (classesList.length > 0 && !selectedClassId) {
        setSelectedClassId(classesList[0].id)
      }
      const defaultFund = funds.find((f) => f.isDefault) || funds[0]
      if (defaultFund) setTargetFundId(defaultFund.id)
    }
  }, [isOpen, funds, classesList, selectedClassId])

  useEffect(() => {
    if (selectedClassId && isOpen && feeAcademicYear) {
      fetchClassFeeRecords(selectedClassId, feeAcademicYear, feeType)
    }
  }, [selectedClassId, feeType, isOpen, feeAcademicYear, fetchClassFeeRecords])

  if (!isOpen) return null

  const handleTogglePaid = async (record: StudentFeeRecord) => {
    const isPaid = record.status === 'PAID'
    const newStatus: WritableFeeStatus = isPaid ? 'UNPAID' : 'PAID'
    const paidAmount = isPaid ? 0 : record.expectedAmount || defaultAmount

    await updateStudentFee(selectedClassId, {
      studentId: record.studentId,
      classId: selectedClassId,
      academicYear: feeAcademicYear,
      feeType,
      title: feeType === 'NIEN_LIEM' ? 'Niên liễm' : 'Đóng phí',
      expectedAmount: record.expectedAmount || defaultAmount,
      paidAmount,
      status: newStatus,
      createTransaction: autoCreateTx && !isPaid,
      fundId: targetFundId,
    })
  }

  const handleSetExempted = async (record: StudentFeeRecord) => {
    await updateStudentFee(selectedClassId, {
      studentId: record.studentId,
      classId: selectedClassId,
      academicYear: feeAcademicYear,
      feeType,
      title: feeType === 'NIEN_LIEM' ? 'Niên liễm' : 'Đóng phí',
      expectedAmount: record.expectedAmount || defaultAmount,
      paidAmount: 0,
      status: 'EXEMPTED',
      note: 'Miễn giảm hoàn cảnh khó khăn',
      createTransaction: false,
    })
  }

  const handleCollectAll = () => {
    const unpaid = classFeeRecords.filter((r) => r.status === 'UNPAID')
    if (unpaid.length === 0) return
    setPendingCollectAll(true)
    setIsCollectAllConfirmOpen(true)
  }

  const handleConfirmCollectAll = async () => {
    setIsCollectAllConfirmOpen(false)
    const unpaid = classFeeRecords.filter((r) => r.status === 'UNPAID')
    const records = unpaid.map((r) => ({
        studentId: r.studentId,
        classId: selectedClassId,
        academicYear: feeAcademicYear,
        feeType,
        title: feeType === 'NIEN_LIEM' ? 'Niên liễm' : 'Đóng phí',
        expectedAmount: r.expectedAmount || defaultAmount,
        paidAmount: r.expectedAmount || defaultAmount,
        status: 'PAID',
        createTransaction: autoCreateTx,
        fundId: targetFundId,
      } as const))
    try {
      await updateStudentFeesBatch(selectedClassId, records)
    } finally {
      setPendingCollectAll(false)
    }
  }

  const filteredRecords = classFeeRecords.filter((r) => {
    if (filterStatus === 'ALL') return true
    return r.status === filterStatus
  })

  const totalStudents = classFeeRecords.length
  const paidCount = classFeeRecords.filter((r) => r.status === 'PAID').length
  const exemptedCount = classFeeRecords.filter((r) => r.status === 'EXEMPTED').length
  const unpaidCount = totalStudents - paidCount - exemptedCount
  const totalCollected = classFeeRecords.reduce((sum, r) => sum + (r.paidAmount || 0), 0)
  const _totalExpected = classFeeRecords.reduce((sum, r) => sum + (r.expectedAmount || defaultAmount), 0)

  return (
    <>
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Sổ Thu Niên Liễm & Đóng Tiền Theo Lớp"
      subtitle="Theo dõi và ghi nhận đóng quỹ của đoàn sinh từng lớp"
      icon={<Users className="w-5 h-5" />}
      maxWidth="896px"
    >
      {/* Toolbar & Selectors */}
      <div className="p-4 bg-surface-hover/30 border-b border-surface-border space-y-3 -mt-4 -mx-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="form-group">
              <label className="form-label">Chọn Lớp Giáo Lý</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="form-select font-medium"
              >
                {classesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.branch})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Khoản Thu</label>
              <select
                value={feeType}
                onChange={(e) => setFeeType(e.target.value as FeeType)}
                className="form-select"
              >
                <option value="NIEN_LIEM">Niên Liễm Đầu Năm</option>
                <option value="TRAI_HE">Tiền Trại Hè / Sa Mạc</option>
                <option value="DONG_PHUC">Tiền Đồng Phục / Khăn</option>
                <option value="GIAO_LY">Sách Kinh Bổn & Tài Liệu</option>
                <option value="OTHER">Khoản Khác</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Mức Thu Chuẩn (VND)</label>
              <input
                type="number"
                step="10000"
                value={defaultAmount}
                onChange={(e) => setDefaultAmount(Number(e.target.value))}
                className="form-input font-bold"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 typography-body-sm font-medium text-text-main cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCreateTx}
                  onChange={(e) => setAutoCreateTx(e.target.checked)}
                  className="rounded text-parish-primary focus:ring-parish-primary w-4 h-4"
                />
                <span>Tự động tạo Phiếu Thu vào Quỹ Xứ Đoàn khi bấm Đã Nộp</span>
              </label>

              {autoCreateTx && (
                <select
                  value={targetFundId}
                  onChange={(e) => setTargetFundId(e.target.value)}
                  className="form-select h-7 text-xs w-auto px-2"
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      Quỹ: {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="pill-group" style={{ height: '32px' }}>
                <Filter className="w-3.5 h-3.5 text-text-muted ml-2" />
                <button
                  onClick={() => setFilterStatus('ALL')}
                  className={`pill-group-item ${filterStatus === 'ALL' ? 'active' : ''}`}
                >
                  Tất cả ({totalStudents})
                </button>
                <button
                  onClick={() => setFilterStatus('PAID')}
                  className={`pill-group-item ${filterStatus === 'PAID' ? 'active' : ''}`}
                  style={filterStatus === 'PAID' ? { background: 'var(--color-finance-income)', color: 'white' } : undefined}
                >
                  Đã nộp ({paidCount})
                </button>
                <button
                  onClick={() => setFilterStatus('UNPAID')}
                  className={`pill-group-item ${filterStatus === 'UNPAID' ? 'active' : ''}`}
                  style={filterStatus === 'UNPAID' ? { background: 'var(--color-parish-warning)', color: 'white' } : undefined}
                >
                  Chưa ({unpaidCount})
                </button>
              </div>

              {unpaidCount > 0 && (
                <button
                  onClick={handleCollectAll}
                  disabled={isLoading || pendingCollectAll}
                  className="btn btn-sm"
                  style={{ background: 'var(--color-finance-income)', color: 'white' }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Thu Tất Cả ({unpaidCount})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Metric Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 py-3 bg-surface-hover/20 border-b border-surface-border text-center typography-body-sm">
          <div>
            <span className="text-text-muted">Tổng đoàn sinh:</span>
            <span className="ml-1 font-bold text-text-main">{totalStudents} em</span>
          </div>
          <div>
            <span className="text-text-muted">Đã hoàn thành:</span>
            <span className="ml-1 font-bold" style={{ color: 'var(--color-finance-income)' }}>{paidCount} em ({totalStudents > 0 ? Math.round((paidCount / totalStudents) * 100) : 0}%)</span>
          </div>
          <div>
            <span className="text-text-muted">Miễn giảm:</span>
            <span className="ml-1 font-bold text-parish-info">{exemptedCount} em</span>
          </div>
          <div>
            <span className="text-text-muted">Tổng tiền đã thu:</span>
            <span className="ml-1 font-bold text-parish-primary">{formatVND(totalCollected)}</span>
          </div>
        </div>

        {/* Student Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredRecords.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Không có đoàn sinh"
              description="Không có đoàn sinh nào khớp với bộ lọc"
            />
          ) : (
            <div className="table-wrapper">
              <div className="table-scroll">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-surface-app text-text-muted text-xs font-bold uppercase tracking-wider border-b-2 border-surface-border">
                      <th className="py-2.5 px-3 w-12 text-center" scope="col">STT</th>
                      <th className="py-2.5 px-3" scope="col">Tên Thánh & Họ Tên</th>
                      <th className="py-2.5 px-3 w-28" scope="col">Mã Đoàn Sinh</th>
                      <th className="py-2.5 px-3 w-28 text-right" scope="col">Cần Đóng</th>
                      <th className="py-2.5 px-3 w-28 text-right" scope="col">Đã Nộp</th>
                      <th className="py-2.5 px-3 w-32 text-center" scope="col">Trạng Thái</th>
                      <th className="py-2.5 px-3 w-40 text-center" scope="col">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {filteredRecords.map((st, idx) => {
                      const isPaid = st.status === 'PAID'
                      const isExempted = st.status === 'EXEMPTED'

                      return (
                        <tr key={st.studentId} className="hover:bg-surface-hover/50 transition-colors">
                          <td className="py-2.5 px-3 text-center typography-body-sm text-text-muted">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <StudentName holyName={st.holyName} fullName={st.studentName} size="sm" />
                          </td>
                          <td className="py-2.5 px-3 typography-body-sm text-text-muted font-mono">{st.studentCode}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-text-main">
                            {formatVND(st.expectedAmount || defaultAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold" style={{ color: 'var(--color-finance-income)' }}>
                            {formatVND(st.paidAmount || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isPaid && (
                              <span className="badge badge-success">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Đã nộp
                              </span>
                            )}
                            {isExempted && (
                              <span className="badge badge-info">
                                Miễn giảm
                              </span>
                            )}
                            {!isPaid && !isExempted && (
                              <span className="badge badge-warning">
                                <AlertCircle className="w-3 h-3 mr-1" /> Chưa nộp
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleTogglePaid(st)}
                                disabled={isLoading || pendingCollectAll}
                                className={`btn btn-sm ${
                                  isPaid ? 'btn-secondary' : ''
                                }`}
                                style={!isPaid ? { background: 'var(--color-finance-income)', color: 'white' } : undefined}
                              >
                                {isPaid ? 'Hủy nộp' : 'Đã nộp'}
                              </button>
                              {!isExempted && !isPaid && (
                                <button
                                  type="button"
                                  onClick={() => handleSetExempted(st)}
                                  disabled={isLoading || pendingCollectAll}
                                  className="btn btn-sm btn-ghost"
                                  style={{ color: 'var(--color-finance-transfer)' }}
                                >
                                  Miễn
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-surface-border">
          <p className="typography-body-sm text-text-muted italic">
            * Mọi khoản thu đều được ghi nhận minh bạch vào sổ thu chi Xứ Đoàn
          </p>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
          >
            Đóng
          </button>
        </div>
    </ModalShell>

      {/* Confirm Collect All Dialog */}
      <ConfirmDialog
        isOpen={isCollectAllConfirmOpen}
        title="Thu tất cả"
        message={`Xác nhận đánh dấu ĐÃ NỘP cho toàn bộ ${classFeeRecords.filter((r) => r.status === 'UNPAID').length} học sinh chưa đóng?`}
        confirmText="Đồng ý thu"
        variant="warning"
        onConfirm={handleConfirmCollectAll}
        onCancel={() => { setIsCollectAllConfirmOpen(false); setPendingCollectAll(false) }}
      />
    </>
  )
}
