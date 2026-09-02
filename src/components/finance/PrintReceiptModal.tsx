import React, { useState } from 'react'
import { Printer, Download, FileText } from 'lucide-react'
import { buildReceiptHtml, printReceipt } from '../../utils/receiptGenerator'
import type { FinancialTransaction } from '../../types/finance'
import { ModalShell } from '../common/ModalShell'

interface PrintReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  transaction: FinancialTransaction | null
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  isOpen,
  onClose,
  transaction,
}) => {
  const [pastorName, _setPastorName] = useState('Lm. Tuyên Úy')
  const [leaderName, _setLeaderName] = useState('Trưởng Ban Quản Trị')

  if (!isOpen || !transaction) return null

  const receiptData = {
    type: transaction.type,
    receiptNumber: transaction.receiptNumber || `PT-${transaction.id.slice(-6)}`,
    date: transaction.transactionDate,
    personName: transaction.personName || transaction.studentName || 'Người nộp/nhận',
    personPhone: transaction.personPhone || undefined,
    className: transaction.className || undefined,
    amount: transaction.amount,
    category: transaction.category,
    title: transaction.title,
    description: transaction.description || undefined,
    fundName: transaction.fundName || 'Quỹ Chung',
    targetFundName: transaction.targetFundName || undefined,
    recordedByName: transaction.recordedByName || 'Thủ Quỹ',
    pastorName,
    leaderName,
    parishName: 'GIÁO XỨ GIA TÔN',
    dioceseName: 'GIÁO PHẬN XUÂN LỘC',
    unitName: 'XỨ ĐOÀN THIẾU NHI THÁNH THỂ',
  }

  const html = buildReceiptHtml(receiptData)

  const handlePrint = () => {
    printReceipt(receiptData)
  }

  const handleDownload = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeReceiptNumber = receiptData.receiptNumber.replace(/[<>:"/\\|?*]/g, '_').trim() || 'receipt'
    a.download = `${transaction.type}_${safeReceiptNumber}.html`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Xem Trước & In ${transaction.type === 'INCOME' ? 'Phiếu Thu' : transaction.type === 'EXPENSE' ? 'Phiếu Chi' : 'Phiếu Chuyển Quỹ'}`}
      subtitle={`Mã chứng từ: ${receiptData.receiptNumber}`}
      icon={<FileText className="w-5 h-5" />}
      maxWidth="896px"
      headerActions={
        <>
          <button
            onClick={handleDownload}
            className="btn btn-sm btn-secondary"
          >
            <Download className="w-3.5 h-3.5" />
            Tải HTML
          </button>
          <button
            onClick={handlePrint}
            className="btn btn-sm btn-primary"
          >
            <Printer className="w-3.5 h-3.5" />
            In Phiếu (A4/A5)
          </button>
        </>
      }
    >
      {/* Live Preview Iframe */}
      <div className="bg-surface-app p-4 overflow-hidden rounded-lg">
        <iframe
          title="Receipt Preview"
          srcDoc={html}
          sandbox=""
          className="w-full h-[70vh] border border-surface-border rounded-lg bg-white shadow-md"
        />
      </div>
    </ModalShell>
  )
}
