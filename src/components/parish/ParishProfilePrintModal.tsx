import React from 'react'
import { Printer, Building2, UserRound, Award, Calendar, FileText } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Button } from '../common/ui/Button'
import parishLogo from '../../assets/logo-gia-ton.png'
import { sortTermsByAuthority } from '../../utils/parishTerms'
import type { ParishProfileSnapshot } from '../../types/parishProfile'

interface ParishProfilePrintModalProps {
  isOpen: boolean
  onClose: () => void
  snapshot: ParishProfileSnapshot
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Chưa cập nhật'
  try {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
  } catch {
    return value
  }
}

export const ParishProfilePrintModal: React.FC<ParishProfilePrintModalProps> = ({
  isOpen,
  onClose,
  snapshot,
}) => {
  const { profile, people, units, terms, records } = snapshot
  const activePeople = people.filter((p) => p.serviceStatus === 'ACTIVE')
  const peopleById = new Map(people.map((p) => [p.id, p]))

  const boardUnit = units.find((u) => u.unitType === 'BOARD')
  const boardTerms = boardUnit ? sortTermsByAuthority(terms.filter((t) => t.unitId === boardUnit.id)) : []
  const milestones = records.filter((r) => r.recordType === 'MILESTONE')
  const achievements = records.filter((r) => r.recordType === 'ACHIEVEMENT')

  const handlePrint = () => {
    window.print()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="In / Xuất Hồ Sơ Xứ Đoàn"
      subtitle="Bản in hồ sơ chính thức chuẩn mực phục vụ lưu trữ giáo xứ và báo cáo giáo phận"
      icon={<FileText size={18} className="text-parish-primary" />}
      maxWidth="840px"
      mobileDisplay="fullscreen"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs text-text-muted hidden sm:inline">
            Khuyên dùng: Chọn khổ giấy <strong>A4</strong>, bật <strong>Background graphics</strong> khi in.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Đóng
            </Button>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Printer size={15} />}
              onClick={handlePrint}
            >
              In Hồ Sơ Ngay
            </Button>
          </div>
        </div>
      }
    >
      <div className="parish-dossier-preview p-4 sm:p-8 bg-surface-card text-text-main flex flex-col gap-6 selection:bg-parish-primary-light">
        {/* Catholic Official Header Block */}
        <div className="text-center border-b-2 border-parish-primary/30 pb-6 flex flex-col items-center gap-2">
          <div className="typography-caption font-bold tracking-widest text-text-muted">
            GIÁO PHẬN XUÂN LỘC • GIÁO HẠT GIA KIỆM
          </div>
          <div className="text-sm font-extrabold uppercase tracking-wider text-parish-primary">
            GIÁO XỨ GIA TÔN — XỨ ĐOÀN THIẾU NHI THÁNH THỂ ĐỨC MẸ FATIMA
          </div>

          <div className="my-3 flex items-center justify-center">
            <div className="w-20 h-20 p-2 rounded-2xl border border-surface-border bg-surface-app flex items-center justify-center shadow-xs">
              <img
                src={parishLogo}
                alt="Logo Xứ Đoàn Đức Mẹ Fatima"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-black uppercase text-text-main tracking-tight m-0">
            HỒ SƠ CĂN TÍNH & TỔ CHỨC XỨ ĐOÀN
          </h2>
          <p className="typography-body-sm italic text-parish-secondary font-semibold m-0">
            “{profile.motto || 'Cầu nguyện – Rước lễ – Hy sinh – Làm tông đồ'}”
          </p>
        </div>

        {/* Section 1: General Info */}
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-parish-primary flex items-center gap-2 border-b border-surface-border pb-1 m-0">
            <Building2 size={16} /> I. THÔNG TIN CHUNG & CĂN TÍNH PHỤNG VỤ
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-surface-app border border-surface-border flex flex-col gap-1">
              <span className="text-text-muted font-bold uppercase">Giáo Xứ & Địa Chỉ Sở Tại:</span>
              <strong className="text-sm text-text-main">Giáo Xứ Gia Tôn (Giáo phận Xuân Lộc)</strong>
              <span className="text-text-secondary typography-caption">Phường Trảng Bom, Khu Phố Sông Trầu 1, Ðồng Nai</span>
            </div>
            <div className="p-3 rounded-xl bg-surface-app border border-surface-border flex flex-col gap-1">
              <span className="text-text-muted font-bold uppercase">Linh Mục Chánh Xứ Đương Nhiệm:</span>
              <strong className="text-sm text-text-main">Cha Đaminh Nguyễn Khắc Tuyên</strong>
              <span className="text-text-secondary typography-caption">Sứ vụ Chánh xứ từ tháng 10/2023</span>
            </div>
            <div className="p-3 rounded-xl bg-surface-app border border-surface-border flex flex-col gap-1">
              <span className="text-text-muted font-bold uppercase">Bổn Mạng Giáo Xứ & Xứ Đoàn:</span>
              <strong className="text-text-main">Thánh Giuse (19/03) · Đức Mẹ Fatima (13/05)</strong>
              <span className="text-text-secondary typography-caption">Ngày chầu lượt: Chúa Nhật trước 19/03</span>
            </div>
            <div className="p-3 rounded-xl bg-surface-app border border-surface-border flex flex-col gap-1">
              <span className="text-text-muted font-bold uppercase">Giờ Thánh Lễ & Quy Mô:</span>
              <strong className="text-text-main">Hằng ngày & Chúa Nhật: 04:30 · 17:00</strong>
              <span className="text-text-secondary typography-caption">2.435 giáo dân · 650 hộ gia đình · 49 km²</span>
            </div>
            <div className="p-3 rounded-xl bg-surface-app border border-surface-border flex flex-col gap-1">
              <span className="text-text-muted font-bold uppercase">Tên Xứ Đoàn Chính Thức:</span>
              <strong className="text-sm text-text-main">{profile.displayName}</strong>
              <span className="text-text-secondary typography-caption">Khai sinh: {formatDate(profile.foundedDate)}</span>
            </div>
            <div className="p-3 rounded-xl bg-surface-app border border-surface-border flex flex-col gap-1">
              <span className="text-text-muted font-bold uppercase">Quy Mô Nhân Sự & Tổ Chức:</span>
              <strong className="text-text-main">
                {activePeople.length} Huynh trưởng / GLV đang phục vụ • {units.filter((u) => u.isActive).length} đơn vị hoạt động
              </strong>
              <span className="text-text-secondary typography-caption">Dòng tu: Đaminh Tam Hiệp (Tu xá Catarina)</span>
            </div>
          </div>

          {profile.description && (
            <div className="p-3 rounded-xl bg-surface-app border border-surface-border text-xs leading-relaxed">
              <span className="text-text-muted font-bold uppercase block mb-1">Mục Đích & Linh Đạo:</span>
              <p className="m-0 text-text-secondary whitespace-pre-wrap">{profile.description}</p>
            </div>
          )}
        </section>

        {/* Section 2: Executive Leadership */}
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-parish-primary flex items-center gap-2 border-b border-surface-border pb-1 m-0">
            <UserRound size={16} /> II. BAN ĐIỀU HÀNH & NHÂN SỰ CHỦ CHỐT ĐƯƠNG NHIỆM
          </h3>

          {boardTerms.length === 0 ? (
            <p className="text-xs text-text-muted italic m-0">Chưa có bản ghi nhiệm kỳ Ban Điều Hành.</p>
          ) : (
            <div className="border border-surface-border rounded-xl overflow-hidden text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-app border-b border-surface-border text-text-muted font-bold">
                    <th className="p-2.5 text-left">Chức vụ</th>
                    <th className="p-2.5 text-left">Huynh Trưởng / GLV</th>
                    <th className="p-2.5 text-left">Cấp bậc</th>
                    <th className="p-2.5 text-left">Nhiệm kỳ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {boardTerms.map((term) => {
                    const person = peopleById.get(term.personId)
                    return (
                      <tr key={term.id} className="hover:bg-surface-hover/50">
                        <td className="p-2.5 font-bold text-parish-primary">{term.positionTitle}</td>
                        <td className="p-2.5 font-semibold text-text-main">
                          {person ? (
                            <span>
                              {person.holyName && <span className="text-parish-primary mr-1">{person.holyName}</span>}
                              {person.fullName}
                            </span>
                          ) : (
                            'Chưa phân công'
                          )}
                        </td>
                        <td className="p-2.5 text-text-muted">{term.rankTitle || 'Huynh trưởng'}</td>
                        <td className="p-2.5 text-text-muted">
                          {formatDate(term.startDate)} – {term.endDate ? formatDate(term.endDate) : 'Hiện tại'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section 3: Sectors and Branches */}
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-parish-primary flex items-center gap-2 border-b border-surface-border pb-1 m-0">
            <Award size={16} /> III. CƠ CẤU CÁC NGÀNH & ĐƠN VỊ TRỰC THUỘC
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {units.map((unit) => (
              <div key={unit.id} className="p-2.5 rounded-xl border border-surface-border bg-surface-app flex items-center justify-between">
                <div>
                  <strong className="text-text-main block">{unit.name}</strong>
                  <span className="text-text-muted typography-caption">
                    {unit.unitType === 'BOARD' ? 'Ban Điều Hành' : unit.unitType === 'BRANCH' ? 'Ngành Đoàn Sinh' : unit.unitType === 'COMMITTEE' ? 'Ban Chuyên Môn' : 'Chi Đoàn'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full typography-caption font-bold bg-parish-primary-light text-parish-primary">
                  {unit.isActive ? 'Đang hoạt động' : 'Tạm ngưng'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Milestones & Achievements Highlights */}
        {(milestones.length > 0 || achievements.length > 0) && (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-parish-primary flex items-center gap-2 border-b border-surface-border pb-1 m-0">
              <Calendar size={16} /> IV. CỘT MỐC LỊCH SỬ & THÀNH TÍCH TIÊU BIỂU
            </h3>

            <div className="flex flex-col gap-2 text-xs">
              {[...milestones, ...achievements].slice(0, 6).map((rec) => (
                <div key={rec.id} className="p-2.5 rounded-xl border border-surface-border bg-surface-app flex items-start gap-2.5">
                  <span className="px-2 py-0.5 rounded-md typography-caption font-bold bg-parish-primary-light text-parish-primary shrink-0 mt-0.5">
                    {formatDate(rec.occurredOn)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <strong className="text-text-main block">{rec.title}</strong>
                    {rec.summary && <p className="text-text-muted m-0 mt-0.5 line-clamp-2">{rec.summary}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Signature & Seal Block */}
        <div className="mt-8 pt-6 border-t-2 border-dashed border-surface-border grid grid-cols-2 text-center text-xs gap-4">
          <div className="flex flex-col items-center">
            <span className="text-text-muted font-bold uppercase">XỨ ĐOÀN TRƯỞNG XÁC NHẬN</span>
            <span className="typography-caption text-text-muted mt-1">(Ký, ghi rõ họ tên)</span>
            <div className="h-20" />
            <strong className="text-text-main border-t border-dotted border-surface-border pt-1 w-44 inline-block">
              {boardTerms[0] ? peopleById.get(boardTerms[0].personId)?.fullName || 'Ban Điều Hành' : 'Ban Điều Hành Xứ Đoàn'}
            </strong>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-text-muted font-bold uppercase">LINH MỤC TUYÊN ÚY / CHÁNH XỨ</span>
            <span className="typography-caption text-text-muted mt-1">(Chuẩn nhận & đóng dấu)</span>
            <div className="h-20" />
            <strong className="text-text-main border-t border-dotted border-surface-border pt-1 w-44 inline-block">
              Cha Đaminh Nguyễn Khắc Tuyên
            </strong>
            <span className="typography-caption text-text-muted mt-0.5">Linh mục Chánh xứ Gia Tôn</span>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
export default ParishProfilePrintModal
