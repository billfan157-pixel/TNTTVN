const AVATAR_PALETTES = [
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-600 to-teal-600',
] as const

/** Gradient deterministic theo id — cùng 1 thiếu nhi luôn cùng màu trên mọi màn hình. */
export function childAvatarGradient(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length]
}

export function childInitials(holyName?: string | null, fullName = ''): string {
  const source = holyName?.trim() || fullName.trim()
  const parts = source.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}

/** Màu chữ học lực — khớp nhãn từ utils/grades.getClassificationLabel. */
export function classificationTextClass(label: string): string {
  switch (label) {
    case 'Xuất Sắc': return 'text-amber-600 dark:text-amber-400'
    case 'Giỏi': return 'text-emerald-600 dark:text-emerald-400'
    case 'Khá': return 'text-sky-600 dark:text-sky-400'
    case 'Trung Bình': return 'text-slate-600 dark:text-slate-300'
    default: return 'text-rose-600 dark:text-rose-400'
  }
}

export function classificationChipClass(label: string): string {
  switch (label) {
    case 'Xuất Sắc': return 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
    case 'Giỏi': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
    case 'Khá': return 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-400'
    case 'Trung Bình': return 'bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-slate-300'
    default: return 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400'
  }
}

export interface PromotionToneStyle {
  wrap: string
  iconWrap: string
  text: string
}

/** Tông màu dải kết quả năm theo trạng thái thăng tiến. */
export function promotionTone(status: string): PromotionToneStyle {
  switch (status) {
    case 'PROMOTED':
    case 'GRADUATED':
      return {
        wrap: 'from-emerald-500/10 border-emerald-500/25',
        iconWrap: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        text: 'text-emerald-700 dark:text-emerald-400',
      }
    case 'CONDITIONALLY_PROMOTED':
      return {
        wrap: 'from-amber-500/10 border-amber-500/25',
        iconWrap: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        text: 'text-amber-700 dark:text-amber-400',
      }
    case 'RETAINED':
      return {
        wrap: 'from-rose-500/10 border-rose-500/25',
        iconWrap: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        text: 'text-rose-700 dark:text-rose-400',
      }
    default:
      return {
        wrap: 'from-sky-500/10 border-sky-500/25',
        iconWrap: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
        text: 'text-sky-700 dark:text-sky-400',
      }
  }
}
