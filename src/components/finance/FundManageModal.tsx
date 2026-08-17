import React, { useState } from 'react'
import { Plus, Wallet } from 'lucide-react'
import { useFinanceStore } from '../../stores/financeStore'
import { formatVND } from '../../utils/receiptGenerator'
import type { CreateFundInput } from '../../types/finance'
import { ModalShell } from '../common/ModalShell'

interface FundManageModalProps {
  isOpen: boolean
  onClose: () => void
}

export const FundManageModal: React.FC<FundManageModalProps> = ({ isOpen, onClose }) => {
  const { funds, createFund, isLoading } = useFinanceStore()

  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [initialBalance, setInitialBalance] = useState<number | ''>('')
  const [formError, setFormError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError('Vui lòng nhập tên quỹ')
      return
    }

    const payload: CreateFundInput = {
      name: name.trim(),
      code: code.trim() || undefined,
      description: description.trim() || undefined,
      initialBalance: initialBalance ? Number(initialBalance) : 0,
    }

    const res = await createFund(payload)
    if (res) {
      setName('')
      setCode('')
      setDescription('')
      setInitialBalance('')
      setIsAdding(false)
    }
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Quản Lý Danh Mục Quỹ Xứ Đoàn"
      subtitle="Theo dõi và thiết lập các quỹ tài chính độc lập"
      icon={<Wallet className="w-5 h-5" />}
      maxWidth="672px"
    >
      <div className="space-y-6">
          {/* Action button */}
          {!isAdding ? (
            <div className="flex justify-between items-center">
              <span className="typography-caption">
                Danh sách các quỹ ({funds.length})
              </span>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="btn btn-sm btn-primary"
              >
                <Plus className="w-4 h-4" />
                Thêm Quỹ Mới
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="p-4 bg-surface-hover/30 border border-surface-border rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="typography-card-title flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-parish-primary" />
                  Thêm Quỹ Mới
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="btn btn-sm btn-ghost"
                >
                  Hủy
                </button>
              </div>

              {formError && (
                <div className="form-error p-2 rounded" style={{ background: 'var(--color-finance-expense-bg)' }}>
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label">Tên Quỹ*</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="VD: Quỹ Xây Dựng, Quỹ Huấn Luyện..."
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mã Quỹ (Tự động)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="VD: XAY_DUNG"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label">Số Dư Ban Đầu (VND)</label>
                  <input
                    type="number"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mô Tả Quỹ</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Mục đích sử dụng của quỹ..."
                    className="form-input"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`btn btn-sm btn-primary ${isLoading ? 'btn-loading' : ''}`}
                >
                  {isLoading ? 'Đang lưu...' : 'Lưu Quỹ Mới'}
                </button>
              </div>
            </form>
          )}

          {/* Funds List Cards */}
          <div className="grid grid-cols-1 gap-3">
            {funds.map((f) => (
              <div
                key={f.id}
                className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="typography-card-title">{f.name}</span>
                    {f.isDefault && (
                      <span className="badge badge-primary">
                        Mặc định
                      </span>
                    )}
                    <span className="badge badge-neutral font-mono text-[10px]">
                      {f.code}
                    </span>
                  </div>
                  {f.description && (
                    <p className="typography-body-sm text-text-muted mt-1">{f.description}</p>
                  )}
                  <div className="flex items-center gap-4 typography-body-sm text-text-muted mt-2">
                    <span>Thu: <strong className="font-semibold" style={{ color: 'var(--color-finance-income)' }}>{formatVND(f.totalIncome)}</strong></span>
                    <span>Chi: <strong className="font-semibold" style={{ color: 'var(--color-finance-expense)' }}>{formatVND(f.totalExpense)}</strong></span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="typography-body-sm text-text-muted">Số dư khả dụng:</div>
                  <div className="typography-numeric-emphasis text-lg">{formatVND(f.currentBalance)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 mt-4 border-t border-surface-border">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
          >
            Hoàn Tất
          </button>
        </div>
    </ModalShell>
  )
}
