/**
 * Mirror đồng bộ (localStorage) cho UI state persist qua IndexedDB.
 *
 * PHA 2 (audit desktop 2026-08-22 — findings A3/A24): `viewMode` và `theme`
 * được persist qua dexieStorage (IndexedDB) — rehydrate ASYNC, nên first paint
 * luôn dùng default ('auto'/'light') → flash layout sai + light-flash trên dark mode.
 *
 * Giải pháp 2 lớp:
 *  1. Store ghi mirror vào localStorage MỖI KHI đổi giá trị (+ sau rehydrate).
 *  2. Đọc đồng bộ mirror lúc khởi tạo store / inline script trong index.html
 *     (dark class trước CSS paint).
 */
const KEY = 'parish_ui_boot'

export interface BootUIState {
  viewMode?: 'auto' | 'desktop' | 'mobile'
  theme?: 'light' | 'dark'
}

export function readBootUI(): BootUIState {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function writeBootUI(patch: BootUIState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readBootUI(), ...patch }))
  } catch {
    // Private mode / quota — mirror là best-effort, không chặn app
  }
}
