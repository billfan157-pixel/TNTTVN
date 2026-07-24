import { useState } from 'react'
import { DesktopGradeMatrix } from '../components/desktop/DesktopGradeMatrix'
import { DesktopGradeCards } from '../components/desktop/DesktopGradeCards'
import { DesktopGradeComparison } from '../components/desktop/DesktopGradeComparison'
import { DesktopDailyGradeEntry } from '../components/desktop/DesktopDailyGradeEntry'
import { MobileGradeView } from '../components/mobile/MobileGradeView'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { Grid3X3, FileSpreadsheet, Columns3, Calculator } from 'lucide-react'

type GradeViewMode = 'matrix' | 'cards' | 'comparison' | 'daily'

const VIEW_TABS: { id: GradeViewMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'matrix', label: 'Ma Trận', icon: <Grid3X3 size={16} />, desc: 'Nhập điểm hàng loạt' },
  { id: 'cards', label: 'Thẻ Điểm', icon: <FileSpreadsheet size={16} />, desc: 'Xem từng em' },
  { id: 'comparison', label: 'So Sánh', icon: <Columns3 size={16} />, desc: 'HK I vs HK II' },
  { id: 'daily', label: 'Hằng Ngày', icon: <Calculator size={16} />, desc: 'Nhập nhiều lần' },
]

export function GradesPage() {
  const effectiveMode = useEffectiveMode()
  const { openReport } = useUIStore()
  const [viewMode, setViewMode] = useState<GradeViewMode>('matrix')

  if (effectiveMode === 'desktop') {
    return (
      <div className="flex flex-col gap-4">
        {/* View Mode Tabs */}
        <div className="bg-white rounded-2xl p-1.5 border border-surface-border shadow-card inline-flex self-start gap-1">
          {VIEW_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                viewMode === tab.id
                  ? 'bg-parish-primary text-white shadow-xs'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`text-[10px] hidden sm:inline ${viewMode === tab.id ? 'text-white/70' : 'text-text-muted'}`}>
                {tab.desc}
              </span>
            </button>
          ))}
        </div>

        {/* Active View */}
        {viewMode === 'matrix' && <DesktopGradeMatrix />}
        {viewMode === 'cards' && <DesktopGradeCards onViewReport={openReport} />}
        {viewMode === 'comparison' && <DesktopGradeComparison />}
        {viewMode === 'daily' && <DesktopDailyGradeEntry />}
      </div>
    )
  }

  return <MobileGradeView onViewReport={openReport} />
}

export default GradesPage
