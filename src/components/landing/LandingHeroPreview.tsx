import React, { useState } from 'react'
import {
  BookOpen,
  Building2,
  HeartHandshake,
  CheckCircle2,
  Calendar,
  Clock,
  UserCheck,
  TrendingUp,
  FileText,
  Award,
} from 'lucide-react'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { normalizeAcademicYear } from '../../utils/academicYear'

export type PreviewWorkspace = 'academic' | 'organization' | 'parent'

export interface LandingHeroPreviewProps {
  externalActiveTab?: PreviewWorkspace
  onTabChange?: (tab: PreviewWorkspace) => void
}

export function LandingHeroPreview({ externalActiveTab, onTabChange }: LandingHeroPreviewProps = {}) {
  const [internalTab, setInternalTab] = useState<PreviewWorkspace>('academic')
  const currentYear = useAcademicYearStore(s => s.currentYear)
  const activeYear = normalizeAcademicYear(currentYear) || '2025-2026'
  const displayYear = activeYear.replace('-', '–')

  const activeTab = externalActiveTab ?? internalTab

  const handleTabClick = (tab: PreviewWorkspace) => {
    setInternalTab(tab)
    onTabChange?.(tab)
  }

  return (
    <div className="relative group/mockup select-none [perspective:1200px]">
      {/* Lớp ánh sáng chiều sâu ambient đa tầng */}
      <div
        aria-hidden="true"
        className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-parish-primary/10 via-parish-secondary/5 to-parish-primary/5 blur-xl opacity-80 pointer-events-none"
      />

      {/* Khung thiết bị 2.5D với góc nghiêng tinh tế */}
      <div className="relative rounded-2xl border border-surface-border bg-surface-card shadow-card card-border-beam overflow-hidden transition-transform duration-300 motion-reduce:transform-none lg:[transform:rotateX(2deg)_rotateY(-2deg)] lg:group-hover/mockup:[transform:rotateX(0deg)_rotateY(0deg)]">
        {/* Top simulated browser / app title bar */}
        <div className="bg-surface-app border-b border-surface-border px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-parish-danger/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-parish-warning/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-parish-success/80" />
            <span className="ml-1 sm:ml-2 text-xs font-semibold text-text-muted truncate">Catevia · Bản minh họa</span>
          </div>
          <span className="text-xs font-medium text-parish-primary flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-parish-success animate-pulse" />
            Trực tuyến
          </span>
        </div>

      {/* Tabs chooser with sliding pill indicator */}
      <div className="p-2 sm:p-3 bg-surface-app/50 border-b border-surface-border">
        <div className="relative grid grid-cols-3 gap-1 bg-surface-app p-1 rounded-xl border border-surface-border" role="tablist" aria-label="Không gian làm việc minh họa">
          {/* Con trỏ viên nang trượt mượt mà (Sliding pill) */}
          <div
            aria-hidden="true"
            className="absolute top-1 bottom-1 w-[calc(33.333%-2px)] rounded-lg bg-surface-card shadow-sm border border-surface-border/50 mockup-tab-pill pointer-events-none"
            style={{
              transform: `translateX(${activeTab === 'academic' ? '2px' : activeTab === 'organization' ? 'calc(100% + 2px)' : 'calc(200% + 2px)'})`,
            }}
          />

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'academic'}
            onClick={() => handleTabClick('academic')}
            className={`relative z-10 min-h-11 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'academic'
                ? 'text-parish-primary'
                : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Học vụ</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'organization'}
            onClick={() => handleTabClick('organization')}
            className={`relative z-10 min-h-11 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'organization'
                ? 'text-parish-primary'
                : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Xứ đoàn</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'parent'}
            onClick={() => handleTabClick('parent')}
            className={`relative z-10 min-h-11 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'parent'
                ? 'text-parish-primary'
                : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <HeartHandshake className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Phụ huynh</span>
          </button>
        </div>
      </div>

      {/* Tab content panel */}
      <div key={activeTab} className="relative preview-panel-fade p-4 sm:p-5 flex flex-col gap-3 min-h-[260px] justify-between">
        {activeTab === 'academic' && (
          <div className="relative flex flex-col gap-3">
            {/* Tia laser quét OMR & điểm danh mô phỏng */}
            <div className="mockup-scanner-line" aria-hidden="true" />

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-xs font-extrabold text-text-main truncate">Lớp Thiếu Nhi 1A — niên khóa {displayYear}</p>
                <p className="m-0 text-xs text-text-muted truncate">GLV Chủ Nhiệm: Huynh trưởng Têrêsa</p>
              </div>
              <span className="badge badge-primary text-xs shrink-0">32 Thiếu Nhi</span>
            </div>

            {/* Simulated mini metric cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-surface-app border border-surface-border flex flex-col">
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-parish-success" /> Chuyên cần Lễ
                </span>
                <span className="text-base font-extrabold text-text-main mt-0.5">97.8%</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-app border border-surface-border flex flex-col">
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-parish-primary" /> Điểm TB Học Kỳ
                </span>
                <span className="text-base font-extrabold text-text-main mt-0.5">8.4 / 10</span>
              </div>
            </div>

            {/* Simulated mini attendance / grade rows */}
            <div className="space-y-1.5">
              {[
                { holy: 'Maria', name: 'Em A', mass: 'Có mặt', score: '9.5' },
                { holy: 'Giuse', name: 'Em B', mass: 'Có mặt', score: '8.8' },
                { holy: 'Anna', name: 'Em C', mass: 'Có phép', score: '9.0' },
              ].map(st => (
                <div key={st.name} className="flex items-center justify-between p-2 rounded-lg bg-surface-app/70 border border-surface-border text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-parish-primary shrink-0">{st.holy}</span>
                    <span className="font-bold text-text-main truncate">{st.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                      st.mass === 'Có mặt' ? 'bg-parish-success-bg text-parish-success' : 'bg-parish-warning-bg text-parish-warning-hover'
                    }`}>
                      {st.mass}
                    </span>
                    <span className="font-bold text-text-main">{st.score}đ</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'organization' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-xs font-extrabold text-text-main truncate">Xứ Đoàn Đức Mẹ Fatima</p>
                <p className="m-0 text-xs text-text-muted truncate">Giáo Xứ Gia Tôn — Ban Điều hành</p>
              </div>
              <span className="badge badge-info text-xs shrink-0">5 Ngành TNTT</span>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-xl bg-surface-app border border-surface-border flex items-start gap-2.5">
                <Calendar className="w-4 h-4 text-parish-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <p className="m-0 text-xs font-bold text-text-main">Thánh Lễ Bổn Mạng Xứ Đoàn</p>
                    <p className="m-0 text-xs text-text-muted">Chúa Nhật tuần III Phục Sinh · 07:00 tại thánh đường</p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-app border border-surface-border flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-parish-secondary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="m-0 text-xs font-bold text-text-main">Họp Ban Điều Hành &amp; GLV tháng 9</p>
                  <p className="m-0 text-xs text-text-muted">Triển khai chương trình thi đua và xét thăng ngành</p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-app border border-surface-border flex items-start gap-2.5">
                <FileText className="w-4 h-4 text-parish-success mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="m-0 text-xs font-bold text-text-main">Báo cáo tài chính &amp; quỹ xứ đoàn</p>
                  <p className="m-0 text-xs text-text-muted">Minh bạch thu chi niên khóa và quỹ học bổng</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'parent' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-xs font-extrabold text-text-main truncate">Sổ liên lạc điện tử</p>
                <p className="m-0 text-xs text-text-muted truncate">Con của bạn (Chi đoàn Thiếu 2)</p>
              </div>
              <span className="badge badge-success text-xs shrink-0">Đang theo học</span>
            </div>

            <div className="p-3 rounded-xl bg-parish-primary-light border border-parish-primary/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-secondary">Chuyên cần Thánh lễ:</span>
                <span className="font-bold text-parish-success flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 100% đầy đủ
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-secondary">Điểm trung bình Giáo lý:</span>
                <span className="font-extrabold text-parish-primary">8.8 — Giỏi</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-text-secondary">Học kỳ hiện tại:</span>
                <span className="font-medium text-text-main">Học kỳ 1 (2025–2026)</span>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-surface-app border border-surface-border flex items-center justify-between text-xs">
                <span className="text-text-muted">Đơn xin phép nghỉ trực tuyến</span>
              <span className="font-semibold text-parish-primary">Chạm để gửi</span>
            </div>
          </div>
        )}

        {/* Footnote */}
        <div className="pt-2 border-t border-surface-border flex items-center gap-1.5 text-xs text-text-muted">
          <Award className="w-3.5 h-3.5 text-parish-secondary shrink-0" />
          <span className="truncate">Ảnh minh họa — số liệu demo, không phải dữ liệu thật</span>
        </div>
      </div>
    </div>
  </div>
)
}
