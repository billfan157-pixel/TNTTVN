/**
 * PERF-XLSX-1 (2026-08-24): lazy-loader cho SheetJS (xlsx).
 *
 * Trước đây xlsx (~400KB minified) bị static-import ở 8 module → nằm sẵn trong
 * chunk của các trang Students/Grades/Reports/Exam dù user không mở tính năng
 * import/export nào. Thông qua loader này, chunk xlsx chỉ được tải ở lần gọi
 * đầu tiên (cache promise — các lần sau miễn phí), và Vite tự tách nó thành
 * async chunk riêng.
 */
type XlsxModule = typeof import('xlsx')

let cached: Promise<XlsxModule> | null = null

export function loadXlsx(): Promise<XlsxModule> {
  if (!cached) {
    cached = import('xlsx').then((mod) => {
      // Một số build xuất default export, một số xuất namespace trực tiếp.
      const resolved = ((mod as unknown as { default?: XlsxModule }).default ?? mod) as XlsxModule
      return resolved
    }).catch((err) => {
      cached = null // cho phép retry lần sau nếu mạng lỗi khi fetch chunk
      throw err
    })
  }
  return cached
}
