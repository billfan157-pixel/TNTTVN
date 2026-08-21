import * as Sentry from '@sentry/react'
import { useToastStore } from '../stores/toastStore'
import { prepareExamDocumentForOutputIfApplicable } from '../lib/examPrintSafety'

// SECURITY_AUDIT_A01 Phase 2 — KHÔNG còn document.write. Nội dung HTML (đã escape ở
// tầng builder — xem utils/pdfGenerator) được render qua Blob URL thay vì ghi trực tiếp
// vào document, loại bỏ sink nơi dữ liệu user có thể thành script trong popup about:blank.

// B2 leftover (polish plan 2026-08-14): thay native alert() bằng toast (useToastStore) —
// native alert chặn PWA mobile, không style được.

function htmlBlobUrl(htmlContent: string): string {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
  return URL.createObjectURL(blob)
}

function injectAutoPrintScript(html: string): string {
  if (html.includes('window.print()')) return html
  const printScript = `
<script>
  window.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      try {
        window.focus();
        window.print();
      } catch (e) {
        console.warn('Auto print failed:', e);
      }
    }, 250);
  });
</script>
`
  if (html.includes('</body>')) {
    return html.replace('</body>', `${printScript}</body>`)
  }
  return `${html}${printScript}`
}

function prepareOutput(htmlContent: string): string {
  return prepareExamDocumentForOutputIfApplicable(htmlContent)
}

/**
 * EP-F1 (audit 2026-08-21): làm sạch tên file xuất tài liệu.
 * - Thay ký tự bất hợp lệ trên filesystem Windows (`\ / : * ? " < > |`) bằng `_`.
 * - Chặn sập sink `<title>` khi tên file được inject vào HTML PDF export
 *   (subject do GLV nhập, ví dụ `X</title><img src=x onerror=…>`).
 */
export function sanitizeFilename(name: string): string {
  return String(name || '').replace(/[<>:"/\\|?*]/g, '_').trim()
}

/**
 * EP-F1: chèn `<title>` cho tài liệu PDF export từ tên file ĐÃ sanitize.
 * Hàm thuần để regression-test được mà không cần DOM.
 */
export function applyPdfTitle(html: string, rawFilename: string): string {
  const pdfTitle = sanitizeFilename(rawFilename).replace(/\.pdf$/i, '')
  if (html.includes('<title>')) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${pdfTitle}</title>`)
  }
  return html.replace('<head>', `<head><title>${pdfTitle}</title>`)
}

export class ReportExportService {
  /**
   * Opens print preview window in a new tab
   */
  public static preview(htmlContent: string): boolean {
    try {
      const previewWindow = window.open('', '_blank')
      if (!previewWindow) {
        useToastStore.getState().addToast('Cửa sổ Xem trước bị trình duyệt chặn (Popup Blocked). Vui lòng cho phép Popup cho trang web này!', 'info', 6000)
        return false
      }
      const url = htmlBlobUrl(prepareOutput(htmlContent))
      previewWindow.location.href = url
      try {
        previewWindow.focus()
      } catch {}
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return true
    } catch (err) {
      Sentry.captureException(err)
      const message = err instanceof Error ? err.message : 'Không thể mở cửa sổ xem trước!'
      useToastStore.getState().addToast(message, 'error', 7000)
      return false
    }
  }

  /**
   * Triggers browser print dialog without locking the main application thread
   */
  public static print(htmlContent: string): void {
    try {
      const safeHtml = prepareOutput(htmlContent)
      const htmlWithPrint = injectAutoPrintScript(safeHtml)
      const url = htmlBlobUrl(htmlWithPrint)

      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        // A-NEW-23 (2026-08-11): fallback popup bị chặn — iframe dùng Blob URL thay srcdoc:
        // srcdoc KẾ THỪA CSP của parent (style-src 'self' chặn <style> element) → layout vỡ.
        // Blob URL = document riêng, không kế thừa CSP, <style> inline vẫn hoạt động.
        let iframe = document.getElementById('__tntt_print_frame__') as HTMLIFrameElement | null
        if (!iframe) {
          iframe = document.createElement('iframe')
          iframe.id = '__tntt_print_frame__'
          iframe.style.position = 'fixed'
          iframe.style.right = '0'
          iframe.style.bottom = '0'
          iframe.style.width = '0'
          iframe.style.height = '0'
          iframe.style.border = '0'
          iframe.style.visibility = 'hidden'
          document.body.appendChild(iframe)
        }

        iframe.src = url
        iframe.onload = () => {
          try {
            iframe?.contentWindow?.focus()
            iframe?.contentWindow?.print()
          } catch {}
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
        return
      }

      let printed = false
      printWindow.location.href = url
      try {
        printWindow.focus()
      } catch {}

      printWindow.onload = () => {
        if (printed) return
        printed = true
        try {
          printWindow.print()
        } catch {}
      }

      // Giữ Blob URL sống 60s để driver in đọc đầy đủ ảnh/SVG, không thu hồi sớm sau 2s
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 60_000)
    } catch (err) {
      Sentry.captureException(err)
      const message = err instanceof Error ? err.message : 'Không thể mở cửa sổ in. Vui lòng cho phép Popup trên trình duyệt!'
      useToastStore.getState().addToast(message, 'error', 7000)
    }
  }

  /**
   * Downloads standalone printable HTML file
   */
  public static downloadHTML(htmlContent: string, filename: string): void {
    try {
      const blob = new Blob([prepareOutput(htmlContent)], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename.endsWith('.html') ? filename : `${filename}.html`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)
    } catch (err) {
      Sentry.captureException(err)
      const message = err instanceof Error ? err.message : 'Lỗi khi tải file HTML!'
      useToastStore.getState().addToast(message, 'error', 7000)
    }
  }

  /**
   * Export as PDF: Sử dụng engine vector chuẩn của trình duyệt thông qua hidden iframe,
   * đặt title chính xác bằng filename để khi lưu file PDF tự động đặt đúng tên file.
   * Đảm bảo 100% chất lượng vector, không bị lệch chữ, không mất chữ, không mờ nét như canvas.
   */
  public static exportPdf(htmlContent: string, filename: string): void {
    try {
      // EP-F1 (2026-08-21): title/filename ĐÃ sanitize qua applyPdfTitle — trước
      // đây pdfTitle raw được inject vào <title> → stored XSS qua subject của
      // phiên chấm khi nạn nhân bấm "Tải PDF" (blob URL = same-origin document).
      const customHtml = applyPdfTitle(prepareOutput(htmlContent), filename)
      const pdfTitle = sanitizeFilename(filename).replace(/\.pdf$/i, '')

      useToastStore.getState().addToast(`Đang mở hộp thoại lưu PDF "${pdfTitle}.pdf"... Vui lòng chọn "Lưu dưới dạng PDF" (Save as PDF)`, 'info', 5000)

      let iframe = document.getElementById('__tntt_pdf_export_frame__') as HTMLIFrameElement | null
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }

      iframe = document.createElement('iframe')
      iframe.id = '__tntt_pdf_export_frame__'
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.style.visibility = 'hidden'
      document.body.appendChild(iframe)

      const url = htmlBlobUrl(customHtml)
      iframe.src = url
      iframe.onload = () => {
        try {
          iframe?.contentWindow?.focus()
          iframe?.contentWindow?.print()
        } catch (printErr) {
          console.error('Error printing via iframe:', printErr)
        }
        setTimeout(() => {
          if (iframe && iframe.parentNode) {
            iframe.parentNode.removeChild(iframe)
          }
          URL.revokeObjectURL(url)
        }, 120_000)
      }
    } catch (err) {
      Sentry.captureException(err)
      console.error('Error in exportPdf:', err)
      const message = err instanceof Error ? err.message : 'Lỗi khi xuất PDF!'
      useToastStore.getState().addToast(message, 'error', 7000)
    }
  }
}
