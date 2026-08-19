import * as Sentry from '@sentry/react'
import { useToastStore } from '../stores/toastStore'

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
      const url = htmlBlobUrl(htmlContent)
      previewWindow.location.href = url
      try {
        previewWindow.focus()
      } catch {}
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return true
    } catch (err) {
      Sentry.captureException(err)
      useToastStore.getState().addToast('Không thể mở cửa sổ xem trước!', 'error')
      return false
    }
  }

  /**
   * Triggers browser print dialog without locking the main application thread
   */
  public static print(htmlContent: string): void {
    try {
      const htmlWithPrint = injectAutoPrintScript(htmlContent)
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
      useToastStore.getState().addToast('Không thể mở cửa sổ in. Vui lòng cho phép Popup trên trình duyệt!', 'error')
    }
  }

  /**
   * Downloads standalone printable HTML file
   */
  public static downloadHTML(htmlContent: string, filename: string): void {
    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
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
      useToastStore.getState().addToast('Lỗi khi tải file HTML!', 'error')
    }
  }

  /**
   * Export as PDF: trực tiếp sinh file nhị phân PDF và kích hoạt tải về máy của người dùng (Direct Download).
   * Có cơ chế fallback mở cửa sổ in ấn dự phòng nếu trình duyệt gặp sự cố canvas.
   */
  public static async exportPdf(htmlContent: string, filename: string): Promise<void> {
    const pdfFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    try {
      useToastStore.getState().addToast('Đang tạo và tải file PDF về máy...', 'info', 3000)

      // Tạo một container ẩn để parse và render HTML chính xác
      const container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.top = '-99999px'
      container.style.left = '-99999px'
      container.style.width = '210mm'
      container.innerHTML = htmlContent
      document.body.appendChild(container)

      const targetElement = container.querySelector('.Section1') || container.querySelector('body') || container

      const html2pdfModule = await import('html2pdf.js')
      const html2pdf = html2pdfModule.default || html2pdfModule

      const opt = {
        margin: [0, 0, 0, 0],
        filename: pdfFilename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
        },
        pagebreak: {
          mode: ['avoid-all', 'css', 'legacy'],
          after: ['.batch-exam-page', '.student-exam-page'],
        },
      }

      await (html2pdf() as any).set(opt).from(targetElement as HTMLElement).save()
      if (document.body.contains(container)) {
        document.body.removeChild(container)
      }
      useToastStore.getState().addToast(`Đã tải về máy file PDF: ${pdfFilename}`, 'success')
    } catch (err) {
      Sentry.captureException(err)
      console.error('Error generating direct PDF:', err)
      // Fallback: Mở cửa sổ in ấn dự phòng
      try {
        const url = htmlBlobUrl(htmlContent)
        const pdfWindow = window.open(url, '_blank')
        if (pdfWindow) {
          pdfWindow.onload = () => {
            try {
              pdfWindow.focus()
              pdfWindow.print()
            } catch {}
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000)
        }
      } catch {}
      useToastStore.getState().addToast('Đã mở cửa sổ in/lưu PDF dự phòng!', 'info')
    }
  }
}
