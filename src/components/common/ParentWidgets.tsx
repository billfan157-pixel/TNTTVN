import { Church, BookOpen } from 'lucide-react'
import { childAvatarGradient, childInitials, promotionTone } from '../../utils/parentDisplay'

/**
 * Widget trình bày dùng chung cho 2 màn hình Cổng Phụ Huynh (ParentDashboard + ParentPage).
 * Thuần presentation — không fetch, không store. Bám DS token (surface-*, parish-primary,
 * text-main/muted) nên tự thích ứng dark mode. Helper thuần nằm ở utils/parentDisplay.ts.
 */

interface ChildAvatarProps {
  id: string
  holyName?: string | null
  fullName: string
  size?: number
  className?: string
}

export const ChildAvatar: React.FC<ChildAvatarProps> = ({ id, holyName, fullName, size = 36, className = '' }) => (
  <span
    aria-hidden
    style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    className={`shrink-0 inline-flex items-center justify-center rounded-full bg-gradient-to-br ${childAvatarGradient(id)} text-white font-bold select-none ${className}`}
  >
    {childInitials(holyName, fullName)}
  </span>
)

interface AttendanceBarProps {
  kind: 'mass' | 'catechism'
  present: number
  total: number
}

/** Thanh tiến độ chuyên cần — màu xanh khi tốt, hổ phách khi thấp. */
export const AttendanceBar: React.FC<AttendanceBarProps> = ({ kind, present, total }) => {
  const pct = total > 0 ? Math.round((present / total) * 100) : 100
  const barTone = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  const Icon = kind === 'mass' ? Church : BookOpen
  const label = kind === 'mass' ? 'Thánh Lễ' : 'Giáo Lý'
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted min-w-0">
          <Icon size={13} className="text-parish-primary shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="text-xs font-bold text-text-main tabular-nums shrink-0">
          {present}/{total} buổi
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-hover overflow-hidden" role="presentation">
        <div
          className={`h-full rounded-full ${barTone} transition-all duration-700`}
          style={{ width: `${pct}%` }}
          data-testid={`attendance-bar-${kind}`}
        />
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: React.ReactNode
  valueClassName?: string
  children?: React.ReactNode
}

/** Thẻ số liệu học tập — nền loang nhẹ từ surface-hover, giá trị tô màu theo ngữ nghĩa. */
export const StatCard: React.FC<StatCardProps> = ({ label, value, valueClassName = '', children }) => (
  <div className="relative overflow-hidden p-3.5 rounded-xl border border-surface-border bg-gradient-to-br from-surface-hover to-transparent">
    <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
    <span className={`block leading-tight font-extrabold text-text-main ${valueClassName}`}>{value}</span>
    {children}
  </div>
)

interface DonutRingProps {
  percent: number
  size?: number
  strokeWidth?: number
  trackClassName?: string
  segmentClassName?: string
}

/** Vòng tròn tiến độ SVG thuần (không phụ thuộc thư viện chart). */
export const DonutRing: React.FC<DonutRingProps> = ({
  percent,
  size = 46,
  strokeWidth = 5,
  trackClassName = 'stroke-surface-border',
  segmentClassName,
}) => {
  const clamped = Math.min(100, Math.max(0, percent))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (clamped / 100) * circumference
  const autoTone = clamped >= 90 ? 'stroke-emerald-500' : clamped >= 75 ? 'stroke-amber-500' : 'stroke-rose-500'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className={trackClassName} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        className={`${segmentClassName ?? autoTone} transition-[stroke-dasharray] duration-700`}
      />
    </svg>
  )
}

/** Dải kết quả năm học — icon huy hiệu + nhãn trạng thái, tông màu theo kết quả. */
export const PromotionBanner: React.FC<{
  status: string
  label: string
  icon: React.ReactNode
}> = ({ status, label, icon }) => {
  const tone = promotionTone(status)
  return (
    <div className={`flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r ${tone.wrap} border`}>
      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${tone.iconWrap}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="m-0 text-xs font-medium text-text-muted">Kết quả năm học</p>
        <p className={`m-0 mt-0.5 text-sm font-bold truncate ${tone.text}`}>{label}</p>
      </div>
    </div>
  )
}
