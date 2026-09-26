import React, { useState, useCallback } from 'react'
import {
  User,
  Phone,
  MessageSquare,
  Copy,
  Edit3,
  Printer,
  Award,
  Church,
  BookOpen,
  HeartHandshake,
  CheckCircle2,
  Clock,
  AlertCircle,
  QrCode,
  Download,
  MapPin,
  ShieldCheck,
  FileText,
  Sparkles,
  Check,
  ExternalLink,
  TrendingUp,
} from 'lucide-react'
import type { Student } from '../../types'
import { ModalShell } from './ModalShell'
import { StudentName } from './StudentName'
import { Badge, type BadgeTone } from './ui/Badge'
import { Button, IconButton } from './ui/Button'
import { Surface } from './ui/Surface'
import { useUIStore } from '../../stores/uiStore'
import { useClassStore, canUserEditStudent } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useToastStore } from '../../stores/toastStore'
import { useAuth } from '../../hooks/useAuth'
import { BRANCHES } from '../../constants/branches'
import { getSacramentStatus, getAge, checkPromotionEligibility } from '../../utils/sacraments'
import { generateStudentQrSvg } from '../../lib/qr'

export interface StudentProfileModalProps {
  isOpen: boolean
  onClose: () => void
  student: Student | null
}

type ProfileTab = 'overview' | 'family' | 'academic' | 'card'

const TAB_CONFIG: Array<{ id: ProfileTab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Tổng Quan & Bí Tích', icon: <Church size={15} /> },
  { id: 'family', label: 'Gia Đình & Liên Hệ', icon: <HeartHandshake size={15} /> },
  { id: 'academic', label: 'Học Tập & Chuyên Cần', icon: <BookOpen size={15} /> },
  { id: 'card', label: 'Thẻ Số & Mã QR', icon: <QrCode size={15} /> },
]

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Chưa cập nhật'
  try {
    const d = new Date(value.includes('T') ? value : `${value.slice(0, 10)}T00:00:00Z`)
    if (isNaN(d.getTime())) return value
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d)
  } catch {
    return value
  }
}

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  isOpen,
  onClose,
  student,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const { openEditStudent, openReport, openPhotoCard } = useUIStore()
  const findClassById = useClassStore((s) => s.findClassById)
  const currentAcademicYear = useAcademicYearStore((s) => s.currentYear)
  const resolveActiveYear = useAcademicYearStore((s) => s.resolveActiveYear)
  const getYearRange = useAcademicYearStore((s) => s.getYearRange)
  const parishSettings = useSettingsStore((s) => s.settings)
  const getStudentGrade = useGradeStore((s) => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore((s) => s.calculateStudentAvg)
  const getStudentAttendanceRate = useAttendanceStore((s) => s.getStudentAttendanceRate)
  const rawAttendance = useAttendanceStore((s) => s.attendance)
  const addToast = useToastStore((s) => s.addToast)

  const { role, isAdmin } = useAuth()
  const classes = useClassStore((s) => s.classes)
  const canEdit = (isAdmin || role === 'chunhiem') && canUserEditStudent(student, classes, role)

  const copyToClipboard = useCallback(
    (text: string, label: string, fieldId: string) => {
      if (!text) return
      void navigator.clipboard.writeText(text).then(() => {
        setCopiedField(fieldId)
        addToast(`Đã sao chép ${label}`, 'success', 2500)
        setTimeout(() => setCopiedField(null), 2000)
      })
    },
    [addToast],
  )

  const downloadQrCode = useCallback(() => {
    if (!student?.code) return
    const svgContent = generateStudentQrSvg(student.code, 8)
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `QR_${student.code}_${student.fullName.replace(/\s+/g, '_')}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    addToast('Đã tải mã QR học viên', 'success')
  }, [student, addToast])

  if (!isOpen || !student) return null

  const classInfo = findClassById(student.classId)
  const branch = BRANCHES[student.branch]
  const sacStatus = getSacramentStatus(student)
  const age = getAge(student.dateOfBirth)

  const activeYear = resolveActiveYear()
  const yearRange = getYearRange(activeYear)

  // Điểm số HK1, HK2 & Cả năm
  const gradeHK1 = getStudentGrade(student.id, 1, activeYear)
  const gradeHK2 = getStudentGrade(student.id, 2, activeYear)
  const avgHK1 = calculateStudentAvg(student.id, 1, activeYear)
  const avgHK2 = calculateStudentAvg(student.id, 2, activeYear)

  let yearlyAvg: number | null = null
  if (avgHK1.score !== null && avgHK2.score !== null) {
    yearlyAvg = Number(((avgHK1.score + avgHK2.score) / 2).toFixed(1))
  } else if (avgHK1.score !== null) {
    yearlyAvg = avgHK1.score
  } else if (avgHK2.score !== null) {
    yearlyAvg = avgHK2.score
  }

  // Chuyên cần
  const attRate = getStudentAttendanceRate(student.id, activeYear)
  const studentYearRecords = rawAttendance.filter(
    (a) => a.studentId === student.id && a.date >= yearRange.startDate && a.date <= yearRange.endDate,
  )

  const sundayMassCount = studentYearRecords.filter((a) => a.type === 'SundayMass')
  const sundayMassPresent = sundayMassCount.filter((a) => a.status === 'Present').length

  const catechismCount = studentYearRecords.filter((a) => a.type === 'CatechismClass')
  const catechismPresent = catechismCount.filter((a) => a.status === 'Present').length

  const adorationCount = studentYearRecords.filter((a) => a.type === 'EucharisticAdoration')
  const adorationPresent = adorationCount.filter((a) => a.status === 'Present').length

  const absentExcusedCount = studentYearRecords.filter((a) => a.status === 'AbsentExcused').length
  const absentUnexcusedCount = studentYearRecords.filter((a) => a.status === 'AbsentUnexcused').length

  // Đánh giá thăng tiến
  const promoResult = checkPromotionEligibility(
    student,
    yearlyAvg,
    attRate.rate,
    2,
    parishSettings.promotionPolicy,
  )

  const statusTone: BadgeTone =
    student.status === 'Đang học'
      ? 'success'
      : student.status === 'Tạm vắng'
      ? 'warning'
      : 'neutral'

  const qrSvg = generateStudentQrSvg(student.code, 4)

  const handleEditClick = () => {
    onClose()
    openEditStudent(student)
  }

  const handleReportClick = () => {
    openReport(student)
  }

  const handlePhotoCardClick = () => {
    openPhotoCard(student)
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Hồ Sơ Thiếu Nhi"
      subtitle={`${parishSettings.parishName || 'Giáo Xứ'} • Năm học ${currentAcademicYear}`}
      icon={<User className="text-parish-primary" size={20} />}
      maxWidth="840px"
      mobileDisplay="bottom-sheet"
      headerActions={
        <div className="flex items-center gap-1.5">
          <IconButton
            onClick={handleReportClick}
            title="Xem & in phiếu điểm"
            label="Xem phiếu điểm"
            icon={<FileText aria-hidden="true" size={16} />}
            variant="secondary"
            size="sm"
            className="hidden sm:inline-flex"
          />
          <IconButton
            onClick={handlePhotoCardClick}
            title="In thẻ đeo học sinh"
            label="In thẻ đeo"
            icon={<Printer aria-hidden="true" size={16} />}
            variant="secondary"
            size="sm"
            className="hidden sm:inline-flex"
          />
          {canEdit && (
            <Button
              onClick={handleEditClick}
              variant="primary"
              size="sm"
              leadingIcon={<Edit3 aria-hidden="true" size={14} />}
              className="text-xs font-bold"
            >
              Chỉnh Sửa
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5 p-4 sm:p-6 bg-surface-app/40">
        {/* HERO IDENTITY BANNER */}
        <Surface
          variant="card"
          className="p-4 sm:p-5 border border-surface-border rounded-2xl flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5 relative overflow-hidden bg-surface-card shadow-sm"
        >
          {/* Subtle branch background glow */}
          <div
            className="absolute top-0 right-0 w-36 h-36 rounded-full blur-3xl opacity-15 pointer-events-none"
            style={{ backgroundColor: branch?.scarfColor || 'var(--color-parish-primary)' }}
            aria-hidden="true"
          />

          {/* AVATAR */}
          <div className="relative shrink-0">
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.fullName}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full object-cover border-2 shadow-sm"
                style={{ borderColor: branch?.scarfColor || 'var(--color-parish-primary)' }}
              />
            ) : (
              <div
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center font-extrabold text-2xl border-2 shadow-sm transition-transform select-none"
                style={{
                  backgroundColor: branch?.badgeBg || 'var(--color-parish-primary-light)',
                  color: branch?.textColor || 'var(--color-parish-primary)',
                  borderColor: branch?.scarfColor || 'var(--color-parish-primary)',
                }}
              >
                <span>{student.holyName?.charAt(0) || student.fullName.charAt(0)}</span>
              </div>
            )}
            <span
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-surface-card flex items-center justify-center text-xs font-black text-text-inverse shadow-xs"
              style={{ backgroundColor: branch?.scarfColor || 'var(--color-parish-primary)' }}
              title={`Ngành ${branch?.name}`}
            >
              {student.branch.slice(0, 2).toUpperCase()}
            </span>
          </div>

          {/* IDENTITY TEXT & DETAILS */}
          <div className="flex-1 min-w-0 text-center sm:text-left flex flex-col gap-1.5">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
              <StudentName
                holyName={student.holyName}
                fullName={student.fullName}
                size="lg"
                layout="inline"
              />
              <Badge tone={statusTone} className="self-center sm:self-auto text-xs font-bold uppercase tracking-wider">
                {student.status}
              </Badge>
            </div>

            {/* BADGES & ATTRIBUTES */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-xs text-text-secondary mt-1">
              <span
                className="px-2.5 py-0.5 rounded-full font-bold text-xs inline-flex items-center gap-1 border border-transparent"
                style={{ backgroundColor: branch?.badgeBg, color: branch?.textColor }}
              >
                {branch?.name}
              </span>

              <Badge tone="primary" className="font-bold">
                Lớp: {classInfo?.name || student.classId}
              </Badge>

              <Badge tone="neutral" className="font-semibold">
                {student.gender} • {age > 0 ? `${age} tuổi` : '—'}
              </Badge>

              <button
                type="button"
                onClick={() => copyToClipboard(student.code, 'Mã học viên', 'code')}
                className="inline-flex items-center gap-1 font-mono font-bold text-text-muted hover:text-parish-primary bg-surface-hover px-2 py-0.5 rounded-md border border-surface-border text-xs transition-colors cursor-pointer"
                title="Bấm để sao chép mã học sinh"
                aria-label={`Sao chép mã học sinh ${student.code}`}
              >
                <span>{student.code}</span>
                {copiedField === 'code' ? (
                  <Check size={12} className="text-parish-success" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
          </div>
        </Surface>

        {/* TABS NAVIGATION */}
        <div className="flex items-center gap-1 border-b border-surface-border overflow-x-auto pb-px no-scrollbar">
          {TAB_CONFIG.map((t) => {
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer min-h-[44px] ${
                  isActive
                    ? 'border-parish-primary text-parish-primary'
                    : 'border-transparent text-text-muted hover:text-text-main hover:border-surface-border'
                }`}
                role="tab"
                aria-selected={isActive}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* TAB 1: OVERVIEW & SACRAMENTS */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* CÁ NHÂN & LÝ LỊCH */}
              <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-3.5">
                <div className="flex items-center gap-2 text-sm font-extrabold text-text-main border-b border-surface-border pb-2">
                  <User size={16} className="text-parish-primary" />
                  <span>Thông Tin Cá Nhân</span>
                </div>

                <div className="flex flex-col gap-2.5 text-xs">
                  <div className="flex justify-between items-baseline py-1 border-b border-surface-border/40">
                    <span className="text-text-muted">Ngày sinh</span>
                    <span className="font-bold text-text-main tabular-nums">
                      {formatDate(student.dateOfBirth)} {age > 0 ? `(${age} tuổi)` : ''}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline py-1 border-b border-surface-border/40">
                    <span className="text-text-muted">Giới tính</span>
                    <span className="font-bold text-text-main">{student.gender}</span>
                  </div>

                  <div className="flex justify-between items-baseline py-1 border-b border-surface-border/40">
                    <span className="text-text-muted">Địa chỉ thường trú</span>
                    <span className="font-semibold text-text-main text-right max-w-[65%] truncate" title={student.address}>
                      {student.address || 'Chưa cập nhật'}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline py-1 border-b border-surface-border/40">
                    <span className="text-text-muted">Huynh trưởng chủ nhiệm</span>
                    <span className="font-bold text-parish-primary text-right max-w-[65%] truncate">
                      {classInfo?.catechistLeader || 'Chưa phân công'}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline py-1">
                    <span className="text-text-muted">Phòng học</span>
                    <span className="font-bold text-text-main">
                      {classInfo?.room || 'Chưa xếp phòng'}
                    </span>
                  </div>
                </div>
              </Surface>

              {/* HÀNH TRÌNH BÍ TÍCH */}
              <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-3.5">
                <div className="flex items-center justify-between border-b border-surface-border pb-2">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-text-main">
                    <Church size={16} className="text-amber-900 dark:text-amber-400" />
                    <span>Hành Trình Bí Tích</span>
                  </div>
                  <span className="text-xs font-bold text-text-muted">
                    {sacStatus.nextSacrament === 'Hoàn tất (đã lãnh nhận 3 Bí tích)'
                      ? 'Đủ 3 Bí Tích'
                      : `Mục tiêu: ${sacStatus.nextSacrament}`}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {/* RỬA TỘI */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      sacStatus.baptism.done
                        ? 'bg-parish-success-bg/40 border-parish-success/30 text-parish-success'
                        : 'bg-surface-app border-surface-border/60 text-text-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          sacStatus.baptism.done
                            ? 'bg-parish-success text-text-inverse'
                            : 'bg-surface-border text-text-muted'
                        }`}
                      >
                        <CheckCircle2 size={15} />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-text-main">1. Bí Tích Rửa Tội</div>
                        <div className="text-xs text-text-muted">Khai mở đời sống Kitô hữu</div>
                      </div>
                    </div>
                    <span className="text-xs font-bold tabular-nums">
                      {sacStatus.baptism.done ? formatDate(sacStatus.baptism.date) : 'Chưa nhận'}
                    </span>
                  </div>

                  {/* RƯỚC LỄ LẦN ĐẦU */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      sacStatus.firstCommunion.done
                        ? 'bg-parish-success-bg/40 border-parish-success/30 text-parish-success'
                        : 'bg-surface-app border-surface-border/60 text-text-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          sacStatus.firstCommunion.done
                            ? 'bg-parish-success text-text-inverse'
                            : 'bg-surface-border text-text-muted'
                        }`}
                      >
                        <CheckCircle2 size={15} />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-text-main">2. Rước Lễ Lần Đầu</div>
                        <div className="text-xs text-text-muted">Hiệp thông Thánh Thể</div>
                      </div>
                    </div>
                    <span className="text-xs font-bold tabular-nums">
                      {sacStatus.firstCommunion.done ? formatDate(sacStatus.firstCommunion.date) : 'Chưa nhận'}
                    </span>
                  </div>

                  {/* THÊM SỨC */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      sacStatus.confirmation.done
                        ? 'bg-parish-success-bg/40 border-parish-success/30 text-parish-success'
                        : 'bg-surface-app border-surface-border/60 text-text-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          sacStatus.confirmation.done
                            ? 'bg-parish-success text-text-inverse'
                            : 'bg-surface-border text-text-muted'
                        }`}
                      >
                        <CheckCircle2 size={15} />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-text-main">3. Bí Tích Thêm Sức</div>
                        <div className="text-xs text-text-muted">Ấn tín Chúa Thánh Thần</div>
                      </div>
                    </div>
                    <span className="text-xs font-bold tabular-nums">
                      {sacStatus.confirmation.done ? formatDate(sacStatus.confirmation.date) : 'Chưa nhận'}
                    </span>
                  </div>
                </div>
              </Surface>
            </div>

            {/* GHI CHÚ SƯ PHẠM */}
            <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-extrabold text-text-main">
                <Sparkles size={16} className="text-amber-500" />
                <span>Ghi Chú Sư Phạm & Đặc Điểm Học Viên</span>
              </div>
              {student.notes?.trim() ? (
                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed bg-surface-app p-3 rounded-xl border border-surface-border/60 italic">
                  "{student.notes.trim()}"
                </p>
              ) : (
                <p className="text-xs text-text-muted italic bg-surface-app/50 p-3 rounded-xl border border-surface-border/40">
                  Chưa có ghi chú đặc biệt nào từ Giáo lý viên hoặc Ban Điều Hành cho học viên này.
                </p>
              )}
            </Surface>
          </div>
        )}

        {/* TAB 2: FAMILY & CONTACTS */}
        {activeTab === 'family' && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* LIÊN HỆ PHỤ HUYNH */}
              <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm font-extrabold text-text-main border-b border-surface-border pb-2">
                  <HeartHandshake size={16} className="text-parish-primary" />
                  <span>Người Giám Hộ / Phụ Huynh</span>
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-xs text-text-muted">Họ và tên Phụ huynh</div>
                    <div className="text-base font-extrabold text-text-main mt-0.5">
                      {student.parentName || 'Chưa cập nhật thông tin'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-text-muted">Số điện thoại liên lạc</div>
                    <div className="text-base font-bold font-mono text-parish-primary mt-0.5">
                      {student.parentPhone || 'Chưa có số điện thoại'}
                    </div>
                  </div>

                  {student.parentPhone && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-surface-border/60">
                      <a
                        href={`tel:${student.parentPhone}`}
                        className="btn btn-primary min-h-[44px] px-3.5 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 no-underline"
                      >
                        <Phone size={14} /> Gọi Điện
                      </a>
                      <a
                        href={`sms:${student.parentPhone}`}
                        className="btn btn-secondary min-h-[44px] px-3.5 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 no-underline"
                      >
                        <MessageSquare size={14} /> Gửi SMS
                      </a>
                      <Button
                        type="button"
                        onClick={() => copyToClipboard(student.parentPhone, 'Số điện thoại', 'parentPhone')}
                        variant="plain"
                        size="sm"
                        className="min-h-[44px] px-3 text-xs font-bold"
                        leadingIcon={
                          copiedField === 'parentPhone' ? (
                            <Check size={14} className="text-parish-success" />
                          ) : (
                            <Copy size={14} />
                          )
                        }
                      >
                        Sao chép SĐT
                      </Button>
                    </div>
                  )}
                </div>
              </Surface>

              {/* TÀI KHOẢN APP PHỤ HUYNH */}
              <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm font-extrabold text-text-main border-b border-surface-border pb-2">
                  <ShieldCheck size={16} className="text-parish-info" />
                  <span>Tài Khoản Phụ Huynh (Cổng Phụ Huynh)</span>
                </div>

                <div className="flex flex-col gap-2.5 text-xs text-text-secondary leading-relaxed">
                  <p>
                    Ứng dụng Catevia cung cấp tính năng cho phép Phụ huynh đăng nhập bằng <strong>chính số điện thoại</strong> để xem kết quả học tập, chuyên cần và nhận thông báo chính thức từ giáo xứ.
                  </p>

                  <div className="bg-surface-app p-3 rounded-xl border border-surface-border/60 flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-text-main">Trạng thái định danh</div>
                      <div className="text-xs text-text-muted">
                        {student.parentPhone ? 'Đã có số điện thoại định danh' : 'Cần cập nhật số điện thoại trước'}
                      </div>
                    </div>
                    <Badge tone={student.parentPhone ? 'success' : 'warning'} className="font-bold">
                      {student.parentPhone ? 'Sẵn sàng liên kết' : 'Thiếu SĐT'}
                    </Badge>
                  </div>

                  {canEdit && (
                    <div className="pt-2">
                      <Button
                        type="button"
                        onClick={handleEditClick}
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs font-bold min-h-[44px]"
                        leadingIcon={<Edit3 size={14} />}
                      >
                        Cập nhật thông tin / Cấp tài khoản ở form Chỉnh Sửa
                      </Button>
                    </div>
                  )}
                </div>
              </Surface>
            </div>

            {/* ĐỊA CHỈ GIA ĐÌNH */}
            <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-extrabold text-text-main">
                <MapPin size={16} className="text-parish-danger" />
                <span>Địa Chỉ Gia Đình & Giáo Họ Cư Trú</span>
              </div>
              <div className="text-xs sm:text-sm text-text-main bg-surface-app p-3.5 rounded-xl border border-surface-border/60 flex items-center justify-between">
                <span>{student.address || 'Chưa có thông tin địa chỉ thường trú'}</span>
                {student.address && (
                  <Button
                    type="button"
                    onClick={() => copyToClipboard(student.address, 'Địa chỉ gia đình', 'address')}
                    variant="plain"
                    size="sm"
                    className="text-xs font-bold"
                    leadingIcon={copiedField === 'address' ? <Check size={12} className="text-parish-success" /> : <Copy size={12} />}
                  >
                    Sao chép
                  </Button>
                )}
              </div>
            </Surface>
          </div>
        )}

        {/* TAB 3: ACADEMIC & ATTENDANCE */}
        {activeTab === 'academic' && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            {/* 3 METRIC TIÊU ĐIỂM */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Surface variant="card" className="p-3.5 rounded-xl border border-surface-border text-center flex flex-col items-center justify-center">
                <div className="text-xs font-bold text-text-muted">ĐTB Học Kỳ 1</div>
                <div className="text-2xl font-black text-parish-primary mt-1 tabular-nums">
                  {avgHK1.score !== null ? avgHK1.score : '—'}
                </div>
                <Badge tone="primary" className="mt-1 font-bold text-xs">
                  {avgHK1.label}
                </Badge>
              </Surface>

              <Surface variant="card" className="p-3.5 rounded-xl border border-surface-border text-center flex flex-col items-center justify-center">
                <div className="text-xs font-bold text-text-muted">ĐTB Học Kỳ 2</div>
                <div className="text-2xl font-black text-parish-primary mt-1 tabular-nums">
                  {avgHK2.score !== null ? avgHK2.score : '—'}
                </div>
                <Badge tone="primary" className="mt-1 font-bold text-xs">
                  {avgHK2.label}
                </Badge>
              </Surface>

              <Surface variant="card" className="p-3.5 rounded-xl border border-surface-border text-center flex flex-col items-center justify-center">
                <div className="text-xs font-bold text-text-muted">Tỷ Lệ Chuyên Cần</div>
                <div className="text-2xl font-black text-parish-success mt-1 tabular-nums">
                  {attRate.rate}%
                </div>
                <span className="text-xs text-text-muted mt-1 font-semibold">
                  Hiện diện {attRate.presentCount}/{attRate.totalCount} buổi
                </span>
              </Surface>
            </div>

            {/* BẢNG ĐIỂM CHI TIẾT */}
            <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-surface-border pb-2">
                <div className="flex items-center gap-2 text-sm font-extrabold text-text-main">
                  <Award size={16} className="text-parish-secondary" />
                  <span>Bảng Điểm Chi Tiết (Năm Học {activeYear})</span>
                </div>
                <Button
                  onClick={handleReportClick}
                  variant="plain"
                  size="sm"
                  className="text-xs font-bold text-parish-primary"
                  trailingIcon={<ExternalLink size={12} />}
                >
                  Xem phiếu điểm in
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-app text-text-muted border-b border-surface-border">
                      <th className="p-2 font-bold">Học Kỳ</th>
                      <th className="p-2 font-bold text-center">Miệng</th>
                      <th className="p-2 font-bold text-center">15 Phút</th>
                      <th className="p-2 font-bold text-center">1 Tiết</th>
                      <th className="p-2 font-bold text-center">Giữa Kỳ</th>
                      <th className="p-2 font-bold text-center">Thi HK</th>
                      <th className="p-2 font-bold text-center">Đạo Đức</th>
                      <th className="p-2 font-bold text-right">ĐTB</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-surface-border/50">
                      <td className="p-2 font-extrabold text-text-main">Học kỳ 1</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK1?.scoreOral ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK1?.score15m ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK1?.score1Period ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK1?.scoreMidterm ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums font-bold">{gradeHK1?.scoreFinal ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK1?.scoreDaoDuc ?? '—'}</td>
                      <td className="p-2 text-right font-black text-parish-primary tabular-nums">
                        {avgHK1.score !== null ? avgHK1.score : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 font-extrabold text-text-main">Học kỳ 2</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK2?.scoreOral ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK2?.score15m ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK2?.score1Period ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK2?.scoreMidterm ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums font-bold">{gradeHK2?.scoreFinal ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{gradeHK2?.scoreDaoDuc ?? '—'}</td>
                      <td className="p-2 text-right font-black text-parish-primary tabular-nums">
                        {avgHK2.score !== null ? avgHK2.score : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Surface>

            {/* CHUYÊN CẦN PHÂN LOẠI & ĐÁNH GIÁ THĂNG TIẾN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Surface variant="card" className="p-4 rounded-2xl border border-surface-border flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-text-main border-b border-surface-border pb-1.5">
                  <Clock size={14} className="text-parish-primary" />
                  <span>Chi Tiết Điểm Danh Theo Hoạt Động</span>
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-surface-border/40">
                    <span className="text-text-muted">Thánh Lễ Chúa Nhật</span>
                    <span className="font-bold text-text-main tabular-nums">
                      {sundayMassPresent}/{sundayMassCount.length} buổi
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-surface-border/40">
                    <span className="text-text-muted">Học Giáo Lý</span>
                    <span className="font-bold text-text-main tabular-nums">
                      {catechismPresent}/{catechismCount.length} buổi
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-surface-border/40">
                    <span className="text-text-muted">Giờ Chầu Thánh Thể</span>
                    <span className="font-bold text-text-main tabular-nums">
                      {adorationPresent}/{adorationCount.length} buổi
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-text-muted">Vắng có phép / Không phép</span>
                    <span className="font-bold text-text-secondary tabular-nums">
                      {absentExcusedCount} phép • {absentUnexcusedCount} không phép
                    </span>
                  </div>
                </div>
              </Surface>

              <Surface variant="card" className="p-4 rounded-2xl border border-surface-border flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-text-main border-b border-surface-border pb-1.5">
                  <TrendingUp size={14} className="text-parish-success" />
                  <span>Dự Báo Thăng Tiến Lớp / Ngành</span>
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Tình trạng xét duyệt</span>
                    <Badge tone={promoResult.canPromote ? 'success' : 'warning'} className="font-bold">
                      {promoResult.canPromote ? 'Đủ điều kiện thăng tiến' : 'Cần cố gắng thêm'}
                    </Badge>
                  </div>
                  {promoResult.reasons.length > 0 ? (
                    <div className="bg-parish-warning-bg/40 border border-parish-warning/30 p-2.5 rounded-xl text-xs text-parish-warning flex flex-col gap-1">
                      {promoResult.reasons.map((r, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <AlertCircle size={12} className="shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-parish-success-bg/40 border border-parish-success/30 p-2.5 rounded-xl text-xs text-parish-success flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="shrink-0" />
                      <span>Học lực và chuyên cần đạt tiêu chuẩn thăng cấp xứ đoàn.</span>
                    </div>
                  )}
                </div>
              </Surface>
            </div>
          </div>
        )}

        {/* TAB 4: DIGITAL CARD & QR CODE */}
        {activeTab === 'card' && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2 animate-in fade-in duration-200">
            {/* THẺ SỐ THIẾU NHI THÁNH THỂ */}
            <div
              className="w-full max-w-[320px] rounded-2xl p-5 border-2 shadow-md bg-surface-card flex flex-col gap-4 text-center relative overflow-hidden"
              style={{ borderColor: branch?.scarfColor || 'var(--color-parish-primary)' }}
            >
              {/* TOP HEADER */}
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-text-muted">
                  {parishSettings.parishName || 'Giáo Xứ Gia Tôn'}
                </div>
                <div className="text-sm font-black text-parish-primary mt-0.5">
                  Thiếu Nhi Thánh Thể
                </div>
                <div
                  className="w-12 h-0.5 mx-auto my-2 rounded-full"
                  style={{ backgroundColor: branch?.scarfColor || 'var(--color-parish-primary)' }}
                />
              </div>

              {/* CARD AVATAR & NAME */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black border-2 shadow-xs"
                  style={{
                    backgroundColor: branch?.badgeBg,
                    color: branch?.textColor,
                    borderColor: branch?.scarfColor,
                  }}
                >
                  {student.holyName?.charAt(0) || student.fullName.charAt(0)}
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-950 dark:text-amber-400">
                    {student.holyName || '—'}
                  </div>
                  <div className="text-base font-extrabold text-text-main">
                    {student.fullName}
                  </div>
                  <div className="text-xs font-mono font-bold text-text-muted mt-0.5">
                    Mã: {student.code}
                  </div>
                </div>
              </div>

              {/* DETAILS */}
              <div className="flex flex-col gap-1 text-xs border-t border-surface-border pt-2.5 text-left">
                <div className="flex justify-between">
                  <span className="text-text-muted">Ngành</span>
                  <span className="font-bold" style={{ color: branch?.textColor }}>
                    {branch?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Lớp</span>
                  <span className="font-bold text-parish-primary">{classInfo?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Trạng thái</span>
                  <span className="font-bold">{student.status}</span>
                </div>
              </div>

              {/* FOOTER */}
              <div className="text-xs text-text-muted border-t border-surface-border/60 pt-2 font-mono">
                Catevia Digital ID • {currentAcademicYear}
              </div>
            </div>

            {/* QR CODE DISPLAY & ACTIONS */}
            <div className="flex flex-col items-center gap-4 max-w-[280px] text-center">
              <div
                className="p-3 bg-white rounded-2xl border-2 border-surface-border shadow-sm flex items-center justify-center [&>svg]:w-44 [&>svg]:h-44"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />

              <div className="text-xs text-text-muted leading-relaxed">
                Mã QR sinh tự động từ mã số <strong>{student.code}</strong>, hỗ trợ máy quét và camera điểm danh của Huynh trưởng.
              </div>

              <div className="flex flex-col w-full gap-2">
                <Button
                  onClick={downloadQrCode}
                  variant="primary"
                  size="sm"
                  className="w-full text-xs font-bold min-h-[44px]"
                  leadingIcon={<Download size={14} />}
                >
                  Tải Ảnh Mã QR (SVG)
                </Button>
                <Button
                  onClick={handlePhotoCardClick}
                  variant="secondary"
                  size="sm"
                  className="w-full text-xs font-bold min-h-[44px]"
                  leadingIcon={<Printer size={14} />}
                >
                  Mở Mẫu In Thẻ Đeo Ngực
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

export default StudentProfileModal
