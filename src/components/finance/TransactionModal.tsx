import React, { useState, useEffect } from 'react'
import { ArrowDownRight, ArrowUpRight, ArrowRightLeft, DollarSign, Calendar, User, FileText, Tag } from 'lucide-react'
import { useFinanceStore } from '../../stores/financeStore'
import { formatVND, numberToVietnameseWords } from '../../utils/receiptGenerator'
import type { TransactionType, CreateTransactionInput } from '../../types/finance'
import { ModalShell } from '../common/ModalShell'

interface TransactionModalProps {
  isOpen: boolean
  onClose: () => void
  initialType?: TransactionType
}

const CATEGORY_PRESETS: Record<TransactionType, string[]> = {
  INCOME: ['Niên liễm', 'Ủng hộ / Tài trợ', 'Trại hè / Sa mạc', 'Bán đồng phục / Khăn', 'Bác ái', 'Khác'],
  EXPENSE: ['Phần thưởng / Quà tặng', 'Trại hè / Sa mạc', 'Lễ hội / Sự kiện', 'In ấn / Tài liệu', 'Bác ái', 'Bồi dưỡng / Sinh hoạt', 'Mua sắm trang thiết bị', 'Khác'],
  TRANSFER: ['Trích quỹ hoạt động', 'Chuyển quỹ bác ái', 'Tạm ứng sự kiện', 'Hoàn ứng', 'Khác'],
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  initialType = 'INCOME',
}) => {
  const { funds, createTransaction, isLoading } = useFinanceStore()

  const [type, setType] = useState<TransactionType>(initialType)
  const [fundId, setFundId] = useState<string>('')
  const [targetFundId, setTargetFundId] = useState<string>('')
  const [amount, setAmount] = useState<number | ''>('')
  const [category, setCategory] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [personName, setPersonName] = useState<string>('')
  const [personPhone, setPersonPhone] = useState<string>('')
  const [transactionDate, setTransactionDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setType(initialType)
      const defaultFund = funds.find((f) => f.isDefault) || funds[0]
      if (defaultFund) setFundId(defaultFund.id)
      if (funds.length > 1) {
        const otherFund = funds.find((f) => f.id !== defaultFund?.id)
        if (otherFund) setTargetFundId(otherFund.id)
      }
      setCategory(CATEGORY_PRESETS[initialType][0] || '')
      setTitle('')
      setDescription('')
      setPersonName('')
      setPersonPhone('')
      setAmount('')
      setFormError(null)
    }
  }, [isOpen, initialType, funds])

  if (!isOpen) return null

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType)
    setCategory(CATEGORY_PRESETS[newType][0] || '')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!fundId) {
      setFormError('Vui lòng chọn quỹ nguồn')
      return
    }
    if (!amount || amount <= 0) {
      setFormError('Số tiền giao dịch phải lớn hơn 0')
      return
    }
    if (!title.trim()) {
      setFormError('Vui lòng nhập trích yếu / lý do')
      return
    }
    if (type === 'TRANSFER' && (!targetFundId || targetFundId === fundId)) {
      setFormError('Vui lòng chọn Quỹ nhận khác với Quỹ nguồn')
      return
    }

    const payload: CreateTransactionInput = {
      fundId,
      type,
      amount: Number(amount),
      category: category.trim() || 'Khác',
      title: title.trim(),
      description: description.trim() || undefined,
      personName: personName.trim() || undefined,
      personPhone: personPhone.trim() || undefined,
      transactionDate,
      targetFundId: type === 'TRANSFER' ? targetFundId : undefined,
    }

    const res = await createTransaction(payload)
    if (res) {
      onClose()
    }
  }

  const numericAmount = typeof amount === 'number' ? amount : 0
  const typeIcon = type === 'INCOME' ? <ArrowDownRight className="w-5 h-5" /> : type === 'EXPENSE' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowRightLeft className="w-5 h-5" />

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={type === 'INCOME' ? 'Tạo Phiếu Thu (Nhập Quỹ)' : type === 'EXPENSE' ? 'Tạo Phiếu Chi (Xuất Quỹ)' : 'Lập Lệnh Chuyển Quỹ'}
      subtitle="Ghi nhận vào sổ quỹ kế toán Xứ Đoàn TNTT"
      icon={typeIcon}
      maxWidth="576px"
    >
      {/* Type Selector Tabs — pill-group */}
      <div className="p-2 bg-surface-hover/30 border-b border-surface-border -mt-4 -mx-6 mb-4">
        <div className="pill-group">
            <button
              type="button"
              onClick={() => handleTypeChange('INCOME')}
              className={`pill-group-item ${type === 'INCOME' ? 'active' : ''}`}
              style={type === 'INCOME' ? { background: 'var(--color-finance-income)', color: 'white' } : undefined}
            >
              <ArrowDownRight className="w-3.5 h-3.5" />
              PHIẾU THU
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('EXPENSE')}
              className={`pill-group-item ${type === 'EXPENSE' ? 'active' : ''}`}
              style={type === 'EXPENSE' ? { background: 'var(--color-finance-expense)', color: 'white' } : undefined}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              PHIẾU CHI
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('TRANSFER')}
              className={`pill-group-item ${type === 'TRANSFER' ? 'active' : ''}`}
              style={type === 'TRANSFER' ? { background: 'var(--color-finance-transfer)', color: 'white' } : undefined}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              CHUYỂN QUỸ
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 text-xs font-medium rounded-lg" style={{ background: 'var(--color-finance-expense-bg)', color: 'var(--color-finance-expense)', border: '1px solid color-mix(in srgb, var(--color-finance-expense) 30%, transparent)' }}>
              {formError}
            </div>
          )}

          {/* Fund Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">
                {type === 'TRANSFER' ? 'Quỹ Nguồn (Trích từ)*' : 'Chọn Quỹ Hoạt Động*'}
              </label>
              <select
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
                className="form-select"
              >
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({formatVND(f.currentBalance)})
                  </option>
                ))}
              </select>
            </div>

            {type === 'TRANSFER' && (
              <div className="form-group">
                <label className="form-label">Quỹ Nhận (Chuyển sang)*</label>
                <select
                  value={targetFundId}
                  onChange={(e) => setTargetFundId(e.target.value)}
                  className="form-select"
                >
                  {funds
                    .filter((f) => f.id !== fundId)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({formatVND(f.currentBalance)})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Ngày Giao Dịch*</label>
              <div className="relative">
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                />
                <Calendar className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="form-group">
            <label className="form-label">Số Tiền (VND)*</label>
            <div className="relative">
              <input
                type="number"
                min="1000"
                step="1000"
                placeholder="Nhập số tiền (VD: 150000)"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                className="form-input font-bold text-base"
                style={{ paddingLeft: '36px', height: '44px' }}
              />
              <DollarSign className="w-4 h-4 text-text-muted absolute left-3 top-3.5 pointer-events-none" />
            </div>
            {numericAmount > 0 && (
              <p className="form-help-text italic" style={{ color: 'var(--color-parish-primary)' }}>
                Bằng chữ: {numberToVietnameseWords(numericAmount)}
              </p>
            )}
          </div>

          {/* Category & Presets */}
          <div className="form-group">
            <label className="form-label">Hạng Mục*</label>
            <div className="relative mb-2">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Chọn hoặc nhập hạng mục"
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
              <Tag className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_PRESETS[type].map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setCategory(preset)}
                  className={`pill-btn text-[11px] ${
                    category === preset ? 'pill-btn-primary' : 'pill-btn-secondary'
                  }`}
                  style={{ height: '28px', padding: '0 10px' }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Title / Description */}
          <div className="form-group">
            <label className="form-label">Lý Do / Trích Yếu*</label>
            <div className="relative">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Thu niên liễm Lớp Bao Đồng 1, Mua quà Trung Thu..."
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
              <FileText className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Person Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">
                {type === 'INCOME' ? 'Họ Tên Người Nộp' : type === 'EXPENSE' ? 'Họ Tên Người Nhận' : 'Người Thực Hiện'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  placeholder="VD: Trưởng Maria Nguyễn Thị C"
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                />
                <User className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Số Điện Thoại</label>
              <input
                type="text"
                value={personPhone}
                onChange={(e) => setPersonPhone(e.target.value)}
                placeholder="VD: 0901234567"
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Ghi Chú Thêm</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú chi tiết hóa đơn, chứng từ..."
              className="form-textarea"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={`btn ${isLoading ? 'btn-loading' : ''}`}
              style={{
                background: type === 'INCOME' ? 'var(--color-finance-income)' : type === 'EXPENSE' ? 'var(--color-finance-expense)' : 'var(--color-finance-transfer)',
                color: 'white',
              }}
            >
              {isLoading ? 'Đang lưu...' : type === 'INCOME' ? 'Lập Phiếu Thu' : type === 'EXPENSE' ? 'Lập Phiếu Chi' : 'Thực Hiện Chuyển Quỹ'}
            </button>
          </div>
        </form>
    </ModalShell>
  )
}
