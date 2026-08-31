/**
 * Convert numbers to Vietnamese words for official receipts & financial vouchers.
 */
import { useToastStore } from '../stores/toastStore'
import { PARISH_LOGO_DATA_URI } from './parishLogo'

export function numberToVietnameseWords(n: number): string {
  if (n === 0) return 'Không đồng'
  if (n < 0) return 'Âm ' + numberToVietnameseWords(-n)

  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']

  function readThreeDigits(num: number, isHighest: boolean): string {
    const h = Math.floor(num / 100)
    const t = Math.floor((num % 100) / 10)
    const u = num % 10

    if (h === 0 && t === 0 && u === 0) return ''

    let result = ''
    if (h > 0 || !isHighest) {
      result += digits[h] + ' trăm '
    }

    if (t > 1) {
      result += digits[t] + ' mươi '
      if (u === 1) result += 'mốt '
      else if (u === 5) result += 'lăm '
      else if (u > 0) result += digits[u] + ' '
    } else if (t === 1) {
      result += 'mười '
      if (u === 5) result += 'lăm '
      else if (u > 0) result += digits[u] + ' '
    } else {
      if ((h > 0 || !isHighest) && u > 0) result += 'lẻ '
      if (u > 0) result += digits[u] + ' '
    }

    return result.trim()
  }

  const parts: number[] = []
  let temp = Math.floor(n)
  while (temp > 0) {
    parts.push(temp % 1000)
    temp = Math.floor(temp / 1000)
  }

  let resultWords = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const chunk = parts[i]
    if (chunk === 0) continue
    const chunkText = readThreeDigits(chunk, i === parts.length - 1)
    if (chunkText) {
      resultWords += (resultWords ? ' ' : '') + chunkText + (units[i] ? ' ' + units[i] : '')
    }
  }

  resultWords = resultWords.trim()
  if (!resultWords) return 'Không đồng'

  // Capitalize first letter and append "đồng chẵn"
  const formatted = resultWords.charAt(0).toUpperCase() + resultWords.slice(1) + ' đồng chẵn.'
  return formatted
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0)
}

export interface ReceiptPrintData {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  receiptNumber: string
  date: string // YYYY-MM-DD
  personName: string
  personPhone?: string
  className?: string
  amount: number
  category: string
  title: string
  description?: string
  fundName: string
  targetFundName?: string
  recordedByName: string
  parishName?: string
  dioceseName?: string
  unitName?: string
  pastorName?: string
  leaderName?: string
}

export function buildReceiptHtml(data: ReceiptPrintData): string {
  const isIncome = data.type === 'INCOME'
  const isTransfer = data.type === 'TRANSFER'
  const voucherTitle = isIncome ? 'PHIẾU THU' : isTransfer ? 'PHIẾU CHUYỂN QUỸ' : 'PHIẾU CHI'
  const personLabel = isIncome ? 'Họ và tên người nộp:' : isTransfer ? 'Người thực hiện chuyển:' : 'Họ và tên người nhận:'
  const amountWords = numberToVietnameseWords(data.amount)

  const formattedDate = (() => {
    try {
      const [y, m, d] = data.date.split('-')
      return `Ngày ${d} tháng ${m} năm ${y}`
    } catch {
      return `Ngày ${data.date}`
    }
  })()

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${voucherTitle} - ${data.receiptNumber}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Times New Roman', Times, serif;
    }
    body {
      background: #f4f4f4;
      padding: 20px;
      color: #111;
    }
    .page-container {
      background: #fff;
      max-width: 800px;
      margin: 0 auto;
      padding: 30px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      border-radius: 4px;
    }
    .header-table {
      width: 100%;
      margin-bottom: 20px;
      border-collapse: collapse;
    }
    .header-left {
      width: 60%;
      text-align: center;
      font-size: 13px;
      line-height: 1.4;
    }
    .header-left.with-logo { display: flex; align-items: center; gap: 10px; text-align: left; }
    .header-left .parish-logo { width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; }
    .header-left-text { flex: 1; text-align: center; }
    .header-left .unit {
      font-weight: bold;
      text-transform: uppercase;
      color: #b91c1c;
      font-size: 14px;
    }
    .header-right {
      width: 40%;
      text-align: right;
      font-size: 13px;
      line-height: 1.5;
    }
    .voucher-title {
      text-align: center;
      margin: 15px 0 5px 0;
    }
    .voucher-title h1 {
      font-size: 24px;
      font-weight: bold;
      letter-spacing: 1px;
      color: ${isIncome ? '#15803d' : isTransfer ? '#1d4ed8' : '#b91c1c'};
    }
    .voucher-date {
      text-align: center;
      font-style: italic;
      font-size: 13px;
      margin-bottom: 20px;
      color: #555;
    }
    .content-table {
      width: 100%;
      margin-bottom: 25px;
      border-collapse: collapse;
      font-size: 14.5px;
      line-height: 1.8;
    }
    .content-table td {
      padding: 6px 4px;
      vertical-align: top;
    }
    .label {
      width: 28%;
      font-weight: 500;
    }
    .dots {
      border-bottom: 1px dotted #777;
      font-weight: bold;
    }
    .amount-box {
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      padding: 10px 14px;
      border-radius: 6px;
      margin: 15px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .amount-highlight {
      font-size: 20px;
      font-weight: bold;
      color: ${isIncome ? '#166534' : isTransfer ? '#1e40af' : '#991b1b'};
    }
    .signatures-table {
      width: 100%;
      margin-top: 30px;
      border-collapse: collapse;
      text-align: center;
      font-size: 13.5px;
    }
    .signatures-table th {
      font-weight: bold;
      padding-bottom: 8px;
    }
    .signatures-table td {
      height: 90px;
      vertical-align: bottom;
      font-style: italic;
      color: #444;
    }
    .divider {
      border-top: 1.5px dashed #aaa;
      margin: 35px 0;
      position: relative;
    }
    .divider::after {
      content: '✂ Cắt theo đường này';
      position: absolute;
      top: -10px;
      right: 20px;
      background: #fff;
      padding: 0 10px;
      font-size: 11px;
      color: #888;
    }
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .page-container {
        box-shadow: none;
        padding: 0;
        max-width: 100%;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td class="header-left with-logo">
          <img src="${PARISH_LOGO_DATA_URI}" alt="Logo Xứ Đoàn Đức Mẹ Fatima" class="parish-logo" style="width:52px;height:52px;object-fit:contain;" />
          <div class="header-left-text">
            <div>${data.dioceseName || 'GIÁO PHẬN'} — ${data.parishName || 'GIÁO XỨ GIA TÔN'}</div>
            <div class="unit">${data.unitName || 'XỨ ĐOÀN ĐỨC MẸ FATIMA'}</div>
            <div>Số sổ: <strong>${data.fundName}</strong></div>
          </div>
        </td>
        <td class="header-right">
          <div><strong>Mẫu số: 01-${isIncome ? 'TT' : 'TC'}</strong></div>
          <div>Số phiếu: <strong style="color: #b91c1c;">${data.receiptNumber}</strong></div>
          <div>Niên khóa: <strong>2025-2026</strong></div>
        </td>
      </tr>
    </table>

    <!-- Title -->
    <div class="voucher-title">
      <h1>${voucherTitle}</h1>
    </div>
    <div class="voucher-date">${formattedDate}</div>

    <!-- Content -->
    <table class="content-table">
      <tr>
        <td class="label">${personLabel}</td>
        <td class="dots">${data.personName || '(Chưa xác định)'} ${data.className ? `— ${data.className}` : ''} ${data.personPhone ? `(SĐT: ${data.personPhone})` : ''}</td>
      </tr>
      <tr>
        <td class="label">Hạng mục thu/chi:</td>
        <td class="dots">${data.category}</td>
      </tr>
      <tr>
        <td class="label">Lý do / Trích yếu:</td>
        <td class="dots">${data.title}</td>
      </tr>
      ${data.description ? `
      <tr>
        <td class="label">Diễn giải chi tiết:</td>
        <td class="dots">${data.description}</td>
      </tr>` : ''}
      ${isTransfer && data.targetFundName ? `
      <tr>
        <td class="label">Chuyển đến quỹ:</td>
        <td class="dots"><strong>${data.targetFundName}</strong></td>
      </tr>` : ''}
    </table>

    <!-- Amount Box -->
    <div class="amount-box">
      <div>
        <div style="font-size: 12px; text-transform: uppercase; color: #64748b;">Số tiền giao dịch:</div>
        <div class="amount-highlight">${formatVND(data.amount)}</div>
      </div>
      <div style="text-align: right; max-width: 60%;">
        <div style="font-size: 12px; color: #64748b;">Bằng chữ:</div>
        <div style="font-weight: bold; font-style: italic;">${amountWords}</div>
      </div>
    </div>

    <!-- Signatures -->
    <table class="signatures-table">
      <tr>
        <th>Cha Tuyên Úy</th>
        <th>Xứ Đoàn Trưởng</th>
        <th>Thủ Quỹ</th>
        <th>${isIncome ? 'Người nộp tiền' : 'Người nhận tiền'}</th>
      </tr>
      <tr>
        <td>${data.pastorName || '(Ký & ghi rõ họ tên)'}</td>
        <td>${data.leaderName || '(Ký & ghi rõ họ tên)'}</td>
        <td>${data.recordedByName || '(Ký & ghi rõ họ tên)'}</td>
        <td>${data.personName || '(Ký & ghi rõ họ tên)'}</td>
      </tr>
    </table>
  </div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      // Auto print trigger if needed
    })
  </script>
</body>
</html>`
}

export function printReceipt(data: ReceiptPrintData): void {
  const html = buildReceiptHtml(data)
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    useToastStore.getState().addToast('Trình duyệt đang chặn cửa sổ pop-up. Vui lòng cho phép pop-up để in phiếu.', 'info', 6000)
    return
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 350)
}
