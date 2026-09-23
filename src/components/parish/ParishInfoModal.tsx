import { useState } from 'react'
import {
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  MapPin,
  UserCheck,
} from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Button, Surface } from '../common/ui'
import { GIA_TON_PARISH_INFO } from '../../constants/parishInfo'
import parishLogo from '../../assets/logo-gia-ton.png'

interface ParishInfoModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'overview' | 'history' | 'priests' | 'stats'

export function ParishInfoModal({ isOpen, onClose }: ParishInfoModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const info = GIA_TON_PARISH_INFO

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Thông Tin Giáo Xứ Gia Tôn"
      subtitle={`${info.diocese} · ${info.deanery}`}
      maxWidth="780px"
      mobileDisplay="fullscreen"
      footer={
        <div className="flex items-center justify-between w-full">
          <a
            href={info.officialSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-parish-primary transition-colors"
          >
            <span>Cổng thông tin Giáo phận</span>
            <ExternalLink size={13} aria-hidden="true" />
          </a>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Identity Header Card */}
        <Surface variant="card" className="p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 bg-surface-app/40 border border-surface-border">
          <div className="h-20 w-20 sm:h-22 sm:w-22 shrink-0 rounded-2xl border border-surface-border bg-surface-card p-2 flex items-center justify-center shadow-xs">
            <img src={parishLogo} alt={`Huy hiệu ${info.name}`} className="h-full w-full object-contain" />
          </div>
          <div className="flex-1 text-center sm:text-left min-w-0 space-y-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
              <span className="badge badge-primary font-bold">{info.diocese}</span>
              <span className="badge badge-info">{info.deanery}</span>
              <span className="badge badge-neutral">Thành lập 2007</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-text-main m-0 tracking-tight">
              {info.name}
            </h2>
            <p className="typography-caption text-text-muted m-0 flex items-center justify-center sm:justify-start gap-1">
              <MapPin size={13} className="text-parish-primary shrink-0" aria-hidden="true" />
              <span>{info.address}</span>
            </p>
          </div>
        </Surface>

        {/* Tab Navigation Controls */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-surface-border scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-colors min-h-11 ${
              activeTab === 'overview'
                ? 'bg-parish-primary text-text-inverse shadow-xs'
                : 'text-text-muted hover:text-text-main hover:bg-surface-app'
            }`}
          >
            Tổng Quan & Giờ Lễ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-colors min-h-11 ${
              activeTab === 'history'
                ? 'bg-parish-primary text-text-inverse shadow-xs'
                : 'text-text-muted hover:text-text-main hover:bg-surface-app'
            }`}
          >
            Lịch Sử Giáo Xứ ({info.historySummary.milestones.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('priests')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-colors min-h-11 ${
              activeTab === 'priests'
                ? 'bg-parish-primary text-text-inverse shadow-xs'
                : 'text-text-muted hover:text-text-main hover:bg-surface-app'
            }`}
          >
            Các Đời Cha Xứ ({info.priestHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-colors min-h-11 ${
              activeTab === 'stats'
                ? 'bg-parish-primary text-text-inverse shadow-xs'
                : 'text-text-muted hover:text-text-main hover:bg-surface-app'
            }`}
          >
            Số Liệu Thống Kê
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Quick KPI stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Surface variant="card" className="p-3">
                <div className="text-xs font-bold uppercase text-text-muted">Giáo dân</div>
                <div className="mt-1 text-base font-extrabold text-parish-primary">
                  {info.currentStats.parishioners.toLocaleString('vi-VN')}
                </div>
                <div className="typography-caption text-text-muted">Trên {info.currentStats.population.toLocaleString('vi-VN')} dân số</div>
              </Surface>
              <Surface variant="card" className="p-3">
                <div className="text-xs font-bold uppercase text-text-muted">Gia đình</div>
                <div className="mt-1 text-base font-extrabold text-text-main">
                  {info.currentStats.families.toLocaleString('vi-VN')}
                </div>
                <div className="typography-caption text-text-muted">Hộ công giáo</div>
              </Surface>
              <Surface variant="card" className="p-3">
                <div className="text-xs font-bold uppercase text-text-muted">Linh mục & Tu sĩ</div>
                <div className="mt-1 text-base font-extrabold text-text-main">
                  {info.currentStats.religious} tu sĩ
                </div>
                <div className="typography-caption text-text-muted">Đaminh Tam Hiệp</div>
              </Surface>
              <Surface variant="card" className="p-3">
                <div className="text-xs font-bold uppercase text-text-muted">Diện tích</div>
                <div className="mt-1 text-base font-extrabold text-text-main">
                  {info.areaKm2} km²
                </div>
                <div className="typography-caption text-text-muted">Địa dư rộng lớn</div>
              </Surface>
            </div>

            {/* Pastor & Patron saint */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <Surface variant="card" className="p-3.5 space-y-2 border border-surface-border">
                <div className="flex items-center gap-2 text-parish-primary font-bold uppercase tracking-wider text-xs">
                  <UserCheck size={15} aria-hidden="true" />
                  <span>Linh Mục Đương Nhiệm</span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface-app space-y-1">
                  <div className="text-sm font-extrabold text-text-main">
                    Cha {info.currentPastor.holyName} {info.currentPastor.fullName}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {info.currentPastor.title} ({info.currentPastor.period})
                  </div>
                  <a
                    href={info.currentPastor.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-parish-primary hover:underline mt-1"
                  >
                    Xem lý lịch linh mục trên cổng giáo phận
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </div>
              </Surface>

              <Surface variant="card" className="p-3.5 space-y-2 border border-surface-border">
                <div className="flex items-center gap-2 text-parish-primary font-bold uppercase tracking-wider text-xs">
                  <Calendar size={15} aria-hidden="true" />
                  <span>Quan Thầy & Bổn Mạng</span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface-app space-y-1">
                  <div className="text-sm font-extrabold text-text-main">
                    {info.patronSaint.name}
                  </div>
                  <div className="text-xs text-text-secondary">
                    Lễ kính: <strong>{info.patronSaint.feastDay}</strong> · Ngày chầu lượt: <strong>{info.patronSaint.adorationDay}</strong>
                  </div>
                  <div className="typography-caption text-text-muted pt-1">
                    Bổn mạng Xứ Đoàn TNTT: <strong>{info.youthUnit.patronName}</strong> ({info.youthUnit.feastDay})
                  </div>
                </div>
              </Surface>
            </div>

            {/* Mass Schedule Card */}
            <Surface variant="card" className="p-3.5 space-y-2 border border-surface-border">
              <div className="flex items-center gap-2 text-parish-primary font-bold uppercase tracking-wider text-xs">
                <Clock size={15} aria-hidden="true" />
                <span>Giờ Cử Hành Thánh Lễ</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-surface-app flex items-center justify-between">
                  <span className="font-bold text-text-main">Ngày Thường (Thứ 2 – Thứ 7)</span>
                  <div className="flex gap-1.5">
                    {info.massSchedule.weekday.map(time => (
                      <span key={time} className="px-2 py-0.5 rounded-md font-extrabold bg-parish-primary/10 text-parish-primary">
                        {time}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-surface-app flex items-center justify-between">
                  <span className="font-bold text-text-main">Chúa Nhật</span>
                  <div className="flex gap-1.5">
                    {info.massSchedule.sunday.map(time => (
                      <span key={time} className="px-2 py-0.5 rounded-md font-extrabold bg-parish-primary/10 text-parish-primary">
                        {time}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="typography-caption text-text-muted m-0">
                Lưu ý: Giờ Thánh Lễ có thể thay đổi vào các dịp Đại Lễ (Giáng Sinh, Tuần Thánh, Phục Sinh, Bổn Mạng).
              </p>
            </Surface>

            {/* Geography and Community */}
            <Surface variant="card" className="p-3.5 space-y-2 border border-surface-border text-xs">
              <div className="flex items-center gap-2 text-parish-primary font-bold uppercase tracking-wider text-xs">
                <Building2 size={15} aria-hidden="true" />
                <span>Địa Dư & Dòng Tu Phục Vụ</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2 rounded-lg bg-surface-app text-center">
                  <span className="text-text-muted block typography-caption">Phía Đông</span>
                  <strong className="text-text-main">{info.boundaries.east}</strong>
                </div>
                <div className="p-2 rounded-lg bg-surface-app text-center">
                  <span className="text-text-muted block typography-caption">Phía Tây</span>
                  <strong className="text-text-main">{info.boundaries.west}</strong>
                </div>
                <div className="p-2 rounded-lg bg-surface-app text-center">
                  <span className="text-text-muted block typography-caption">Phía Nam</span>
                  <strong className="text-text-main">{info.boundaries.south}</strong>
                </div>
                <div className="p-2 rounded-lg bg-surface-app text-center">
                  <span className="text-text-muted block typography-caption">Phía Bắc</span>
                  <strong className="text-text-main">{info.boundaries.north}</strong>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-text-secondary">
                  Cộng đoàn dòng tu: <strong>{info.religiousOrder.name} ({info.religiousOrder.community})</strong>
                </span>
                <a
                  href={info.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-parish-primary hover:underline"
                >
                  <MapPin size={13} aria-hidden="true" />
                  <span>Google Maps</span>
                </a>
              </div>
            </Surface>
          </div>
        )}

        {/* Tab 2: History Timeline */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <p className="typography-body-sm text-text-secondary leading-relaxed p-3 rounded-xl bg-surface-app border border-surface-border m-0">
              {info.historySummary.overview}
            </p>

            <div className="relative pl-6 border-l-2 border-parish-primary/30 space-y-4 pt-1">
              {info.historySummary.milestones.map((milestone, idx) => (
                <div key={idx} className="relative">
                  <span
                    className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-surface-card bg-parish-primary"
                    aria-hidden="true"
                  />
                  <Surface variant="card" className="p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md typography-caption font-bold bg-parish-primary-light text-parish-primary">
                        {milestone.time}
                      </span>
                      <h4 className="text-xs font-bold text-text-main m-0">{milestone.title}</h4>
                    </div>
                    <p className="typography-body-sm text-text-secondary m-0 leading-relaxed">
                      {milestone.detail}
                    </p>
                  </Surface>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Priests History */}
        {activeTab === 'priests' && (
          <div className="space-y-3 text-xs">
            <p className="text-text-secondary m-0">
              Danh sách các Linh mục đã và đang phụ trách mục vụ tại Giáo Xứ Gia Tôn từ ngày thành lập:
            </p>

            <div className="border border-surface-border rounded-xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-app border-b border-surface-border text-text-muted font-bold text-left">
                    <th className="p-2.5">STT</th>
                    <th className="p-2.5">Linh Mục</th>
                    <th className="p-2.5">Trách vụ</th>
                    <th className="p-2.5">Thời gian</th>
                    <th className="p-2.5 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {info.priestHistory.map(priest => (
                    <tr key={priest.order} className="hover:bg-surface-hover/50">
                      <td className="p-2.5 text-text-muted font-semibold">{priest.order}</td>
                      <td className="p-2.5 font-bold text-text-main">
                        <span className="text-parish-primary font-semibold mr-1">{priest.holyName}</span>
                        {priest.fullName}
                      </td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded-full typography-caption font-bold ${
                          priest.role === 'Chánh xứ'
                            ? 'bg-parish-primary-light text-parish-primary'
                            : 'bg-surface-app text-text-secondary'
                        }`}>
                          {priest.role}
                        </span>
                      </td>
                      <td className="p-2.5 text-text-secondary">{priest.period}</td>
                      <td className="p-2.5 text-right">
                        {priest.profileUrl ? (
                          <a
                            href={priest.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-parish-primary hover:underline font-semibold"
                          >
                            <span>Hồ sơ</span>
                            <ExternalLink size={11} aria-hidden="true" />
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Historical Statistics */}
        {activeTab === 'stats' && (
          <div className="space-y-3 text-xs">
            <p className="text-text-secondary m-0">
              Số liệu thống kê nhân sự và gia đình Giáo Xứ Gia Tôn qua các thời kỳ:
            </p>

            <div className="border border-surface-border rounded-xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-app border-b border-surface-border text-text-muted font-bold text-left">
                    <th className="p-2.5">Năm</th>
                    <th className="p-2.5">Giáo dân</th>
                    <th className="p-2.5">Hộ gia đình</th>
                    <th className="p-2.5">Tu sĩ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {info.historicalStats.map(stat => (
                    <tr key={stat.year} className="hover:bg-surface-hover/50">
                      <td className="p-2.5 font-extrabold text-parish-primary">{stat.year}</td>
                      <td className="p-2.5 font-bold text-text-main">{stat.parishioners}</td>
                      <td className="p-2.5 text-text-secondary">{stat.families}</td>
                      <td className="p-2.5 text-text-secondary">{stat.religious}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="typography-caption text-text-muted m-0">
              * Dữ liệu năm 2026 đang tiếp tục được cập nhật theo niên giám Giáo phận Xuân Lộc.
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
