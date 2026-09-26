import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Student, BranchType } from '../../types';
import { useStudentStore } from '../../stores/studentStore';
import { useClassStore, getFilteredClassList, canUserEditStudent, canUserAccessClass, scopeClassesForAssignedWrites } from '../../stores/classStore';
import { BRANCHES } from '../../constants/branches';
import {
  Save,
  UserPlus,
  UserCheck,
  KeyRound,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Church,
  HeartHandshake,
  FileText,
  Layers,
  Info,
  Lock,
} from 'lucide-react';
import { SacramentSection } from './SacramentSection';
import { useToastStore } from '../../stores/toastStore';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { ModalShell } from './ModalShell';
import { Surface } from './ui/Surface';

// ADR-026 tiện ích (2026-08-22): admin tạo nhanh tài khoản phụ huynh ngay trong
// modal học sinh khi đã nhập đủ Tên PH + SĐT — dùng chung POST /users
// (username = SĐT chuẩn hóa, temp password trả 1 lần, FORCE_PASSWORD_CHANGE).
// A8-04: SĐT hợp lệ = 10-11 số bắt đầu 0 hoặc định dạng +84 (khớp backend).
export const STUDENT_PARENT_PHONE_RE = /^(\+84|0)\d{9,10}$/;
export const STUDENT_PARENT_PHONE_HINT = 'Số điện thoại gồm 10-11 chữ số (bắt đầu bằng 0) hoặc định dạng +84.';

type ParentAccountState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'done'; username: string; tempPassword: string; copied: boolean }
  | { status: 'error'; alreadyExists: boolean; message: string };

type FormTab = 'all' | 'personal' | 'sacraments' | 'family' | 'notes';

const FORM_TABS: Array<{ id: FormTab; label: string; icon: React.ReactNode }> = [
  { id: 'all', label: 'Tất cả các mục', icon: <Layers size={14} /> },
  { id: 'personal', label: 'Cá nhân & Phân lớp', icon: <User size={14} /> },
  { id: 'sacraments', label: 'Bí tích', icon: <Church size={14} /> },
  { id: 'family', label: 'Gia đình & Liên hệ', icon: <HeartHandshake size={14} /> },
  { id: 'notes', label: 'Ghi chú', icon: <FileText size={14} /> },
];

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentToEdit?: Student | null;
  onGoToClasses?: () => void;
}

export const StudentModal: React.FC<StudentModalProps> = ({ isOpen, onClose, studentToEdit, onGoToClasses }) => {
  const addStudent = useStudentStore((s) => s.addStudent);
  const updateStudent = useStudentStore((s) => s.updateStudent);
  const rawClasses = useClassStore((s) => s.classes);

  const [activeTab, setActiveTab] = useState<FormTab>('all');
  const [formData, setFormData] = useState({
    holyName: '',
    fullName: '',
    gender: '' as 'Nam' | 'Nữ' | '',
    dateOfBirth: '',
    baptismDate: '',
    firstCommunionDate: '',
    confirmationDate: '',
    parentName: '',
    parentPhone: '',
    address: '',
    branch: 'AuNhi' as BranchType,
    classId: 'AU1',
    status: 'Đang học' as 'Đang học' | 'Nghỉ học' | 'Tạm vắng',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [membershipChangeReason, setMembershipChangeReason] = useState('');
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const canEditCurrent = !studentToEdit || canUserEditStudent(studentToEdit, rawClasses, currentUser?.role);
  const [parentAccount, setParentAccount] = useState<ParentAccountState>({ status: 'idle' });

  // A8-04 (audit 2026-09-19): mirror the backend/import rule (plus-84 or
  // leading-zero, 10-11 digits) from server routes/students.ts and the import
  // PHONE_RE. The previous 10-digit-only rule blocked editing students
  // imported with international or 11-digit numbers. Parent-account creation
  // stays safe: createUser normalizes to 0-form server-side before deriving
  // the username.
  const parentPhoneValid = STUDENT_PARENT_PHONE_RE.test(formData.parentPhone.trim());
  const parentAccountReady = isAdmin && parentPhoneValid && formData.parentName.trim().length >= 2;

  const handleCreateParentAccount = async () => {
    if (!parentAccountReady || parentAccount.status === 'creating') return;
    setParentAccount({ status: 'creating' });
    try {
      const res = await api.createUser({
        fullName: formData.parentName.trim(),
        phone: formData.parentPhone.trim(),
        role: 'phuhuynh',
      });
      setParentAccount({ status: 'done', username: res.username, tempPassword: res.tempPassword, copied: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo tài khoản phụ huynh';
      const alreadyExists = /tồn tại|exists/i.test(msg);
      setParentAccount({
        status: 'error',
        alreadyExists,
        message: alreadyExists
          ? 'Số điện thoại này ĐÃ có tài khoản phụ huynh. Xem lại mật khẩu tạm ở tab Tài Khoản Phụ Huynh.'
          : msg,
      });
    }
  };

  const handleCopyParentCredential = async () => {
    if (parentAccount.status !== 'done') return;
    try {
      await navigator.clipboard.writeText(
        `${formData.parentName.trim()} — Đăng nhập: ${parentAccount.username} — Mật khẩu tạm: ${parentAccount.tempPassword}`,
      );
      setParentAccount({ ...parentAccount, copied: true });
      setTimeout(() => setParentAccount((prev) => (prev.status === 'done' ? { ...prev, copied: false } : prev)), 1500);
    } catch {
      // Clipboard bị chặn — admin tự sao chép tay
    }
  };

  useEffect(() => {
    setParentAccount({ status: 'idle' });
  }, [isOpen]);

  // E2E-root-cause (2026-09-04): effect này từng deps `rawClasses` — bất kỳ
  // store update nào (sync nền pull classes, tạo lớp ở tab khác) cũng reset
  // toàn bộ form đang nhập (mất tên đã gõ + lớp đã chọn → submit fail thầm lặng).
  // Chỉ init khi mở dialog hoặc đổi đối tượng sửa; rawClasses đọc qua ref để
  // lấy default tại thời điểm mở (user tự chọn lớp trong select nếu load sau).
  // Ref thay vì deps trực tiếp để exhaustive-deps không bắt re-run (giữ bug).
  const rawClassesRef = useRef(rawClasses);
  rawClassesRef.current = rawClasses;
  useEffect(() => {
    const liveClasses = rawClassesRef.current;
    setErrors({});
    setMembershipChangeReason('');
    setActiveTab('all');
    if (studentToEdit) {
      setFormData({
        holyName: studentToEdit.holyName || '',
        fullName: studentToEdit.fullName || '',
        gender: studentToEdit.gender || 'Nam',
        dateOfBirth: studentToEdit.dateOfBirth || '',
        baptismDate: studentToEdit.baptismDate || '',
        firstCommunionDate: studentToEdit.firstCommunionDate || '',
        confirmationDate: studentToEdit.confirmationDate || '',
        parentName: studentToEdit.parentName || '',
        parentPhone: studentToEdit.parentPhone || '',
        address: studentToEdit.address || '',
        branch: studentToEdit.branch || 'AuNhi',
        classId: studentToEdit.classId || 'AU1',
        status: studentToEdit.status || 'Đang học',
        notes: studentToEdit.notes || '',
      });
    } else {
      const liveClassList = getFilteredClassList(liveClasses);
      const writableLiveClasses = scopeClassesForAssignedWrites(liveClassList, currentUser?.role);
      const defaultClass = writableLiveClasses[0] || liveClassList[0];
      const defaultBranch = (defaultClass?.branch as BranchType) || 'AuNhi';
      const defaultClassId = defaultClass?.id || 'AU1';
      setFormData({
        holyName: '',
        fullName: '',
        gender: '',
        dateOfBirth: '',
        baptismDate: '',
        firstCommunionDate: '',
        confirmationDate: '',
        parentName: '',
        parentPhone: '',
        address: '',
        branch: defaultBranch,
        classId: defaultClassId,
        status: 'Đang học',
        notes: '',
      });
    }
  }, [studentToEdit, isOpen, currentUser?.role]);

  const classList = useMemo(() => getFilteredClassList(rawClasses), [rawClasses]);
  const writableClassList = useMemo(
    () => scopeClassesForAssignedWrites(classList, currentUser?.role),
    [classList, currentUser?.role],
  );
  const currentBranch = BRANCHES[formData.branch] || BRANCHES.AuNhi;

  const membershipChanged = Boolean(
    studentToEdit && (formData.classId !== studentToEdit.classId || formData.branch !== studentToEdit.branch),
  );

  const validateField = (field: string, value: string) => {
    switch (field) {
      case 'holyName':
        return !value.trim() ? 'Vui lòng nhập Tên Thánh.' : '';
      case 'fullName':
        return !value.trim() ? 'Vui lòng nhập Họ và Tên.' : '';
      case 'gender':
        return !value ? 'Vui lòng chọn Giới tính.' : '';
      case 'dateOfBirth':
        if (!value) return 'Vui lòng chọn Ngày sinh.';
        if (new Date(value) > new Date()) return 'Ngày sinh không thể ở tương lai.';
        return '';
      case 'parentPhone':
        if (value.trim() && !STUDENT_PARENT_PHONE_RE.test(value.trim())) {
          return STUDENT_PARENT_PHONE_HINT;
        }
        return '';
      default:
        return '';
    }
  };

  const handleBlur = (field: string) => {
    const errorMsg = validateField(field, (formData as Record<string, any>)[field] || '');
    if (errorMsg) {
      setErrors((prev) => ({ ...prev, [field]: errorMsg }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const fieldsToValidate = ['holyName', 'fullName', 'gender', 'dateOfBirth', 'parentPhone'];
    for (const field of fieldsToValidate) {
      const err = validateField(field, (formData as Record<string, any>)[field] || '');
      if (err) newErrors[field] = err;
    }
    if (membershipChanged && membershipChangeReason.trim().length < 5) {
      newErrors.membershipChangeReason = 'Vui lòng nhập lý do chuyển lớp/ngành (ít nhất 5 ký tự).';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Nếu tab hiện tại đang ẩn trường có lỗi, tự động chuyển về 'all' để người dùng nhìn thấy ngay
      if (activeTab !== 'all') {
        const hasPersonalError =
          newErrors.holyName || newErrors.fullName || newErrors.gender || newErrors.dateOfBirth || newErrors.membershipChangeReason;
        const hasFamilyError = newErrors.parentPhone;
        if (
          (activeTab !== 'personal' && hasPersonalError) ||
          (activeTab !== 'family' && hasFamilyError)
        ) {
          setActiveTab('all');
        }
      }
      return;
    }

    const addToast = useToastStore.getState().addToast;

    if (studentToEdit && !canUserEditStudent(studentToEdit, rawClasses, currentUser?.role)) {
      addToast('Bạn không có quyền sửa thông tin học sinh của lớp khác.', 'error');
      return;
    }
    if (!canUserAccessClass(formData.classId, rawClasses, currentUser?.role)) {
      addToast('Bạn chỉ có thể gán học sinh vào lớp mình phụ trách.', 'error');
      return;
    }

    const studentPayload = {
      ...formData,
      gender: formData.gender as 'Nam' | 'Nữ',
      ...(membershipChanged ? { membershipChangeReason: membershipChangeReason.trim() } : {}),
    };
    setIsSubmitting(true);
    try {
      if (studentToEdit) {
        await updateStudent(studentToEdit.id, studentPayload);
        addToast('Đã lưu cập nhật trên thiết bị và đưa vào hàng đợi đồng bộ.', 'success');
      } else {
        await addStudent(studentPayload);
        addToast('Đã lưu hồ sơ trên thiết bị và đưa vào hàng đợi đồng bộ.', 'success');
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể lưu hồ sơ trên thiết bị.';
      addToast(message, 'error', 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Trường hợp chưa có lớp học nào trong hệ thống
  if (!studentToEdit && classList.length === 0) {
    return (
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Thêm Hồ Sơ Thiếu Nhi Mới"
        icon={<UserPlus size={20} className="text-parish-primary" />}
        maxWidth="480px"
        mobileDisplay="bottom-sheet"
      >
        <div className="bg-parish-warning-bg border border-parish-warning/30 rounded-xl p-5 flex flex-col items-start gap-3">
          <div className="flex items-center gap-2">
            <UserPlus size={20} className="text-parish-warning" />
            <p className="text-sm font-bold text-parish-warning m-0">Chưa có lớp học nào</p>
          </div>
          <p className="text-sm text-text-secondary m-0 font-medium leading-relaxed">
            Quy trình sử dụng: <strong>Tạo Năm Học → Tạo Lớp Học → Nhập Danh Sách Thiếu Nhi</strong>. Hãy tạo lớp học
            trước khi thêm học sinh.
          </p>
          {onGoToClasses && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onClose();
                onGoToClasses();
              }}
            >
              <UserPlus size={14} /> Quản Lý Lớp Học Trong Trang Thiếu Nhi
            </button>
          )}
        </div>
      </ModalShell>
    );
  }

  const modalTitle = studentToEdit ? 'Chỉnh Sửa Thông Tin Thiếu Nhi' : 'Thêm Hồ Sơ Thiếu Nhi Mới';
  const modalSubtitle = studentToEdit
    ? `${studentToEdit.holyName || ''} ${studentToEdit.fullName} • Lớp ${studentToEdit.classId}`
    : 'Khởi tạo hồ sơ thiếu nhi và thông tin bí tích trong năm học';

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      icon={
        studentToEdit ? (
          <UserCheck size={20} className="text-parish-primary" />
        ) : (
          <UserPlus size={20} className="text-parish-primary" />
        )
      }
      maxWidth="760px"
      mobileDisplay="bottom-sheet"
      closeOnOverlay={!isSubmitting}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between w-full gap-2.5">
          <div className="text-xs text-text-muted">
            <span className="text-parish-danger font-bold">*</span> Thông tin bắt buộc
          </div>
          <div className="flex items-center gap-2 justify-end w-full sm:w-auto">
            <button
              type="button"
              className="btn btn-secondary min-h-10 w-full sm:w-auto"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="student-modal-form"
              className="btn btn-primary min-h-10 w-full sm:w-auto font-bold"
              disabled={isSubmitting || !canEditCurrent}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{isSubmitting ? 'Đang lưu...' : studentToEdit ? 'Lưu Thay Đổi' : 'Thêm Thiếu Nhi'}</span>
            </button>
          </div>
        </div>
      }
    >
      <form id="student-modal-form" onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-5">
        {!canEditCurrent && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-2">
            <Lock size={16} className="shrink-0" />
            <span>Bạn không có quyền chỉnh sửa học sinh này vì không phụ trách lớp của em.</span>
          </div>
        )}
        {/* HERO IDENTITY BANNER — Đồng bộ nhận diện với StudentProfileModal */}
        <Surface
          variant="card"
          className="p-4 sm:p-5 border border-surface-border rounded-2xl flex flex-col sm:flex-row items-center sm:items-start gap-4 relative overflow-hidden bg-surface-card shadow-xs"
        >
          {/* Subtle branch background glow */}
          <div
            className="absolute top-0 right-0 w-36 h-36 rounded-full blur-3xl opacity-15 pointer-events-none"
            style={{ backgroundColor: currentBranch?.scarfColor || 'var(--color-parish-primary)' }}
            aria-hidden="true"
          />

          {/* AVATAR / INITIALS */}
          <div className="relative shrink-0">
            {studentToEdit?.avatarUrl ? (
              <img
                src={studentToEdit.avatarUrl}
                alt={formData.fullName || studentToEdit.fullName}
                className="w-16 h-16 sm:w-18 sm:h-18 rounded-full object-cover border-2 shadow-xs"
                style={{ borderColor: currentBranch?.scarfColor || 'var(--color-parish-primary)' }}
              />
            ) : (
              <div
                className="w-16 h-16 sm:w-18 sm:h-18 rounded-full flex flex-col items-center justify-center font-extrabold text-xl sm:text-2xl border-2 shadow-xs transition-transform select-none"
                style={{
                  backgroundColor: currentBranch?.badgeBg || 'var(--color-parish-primary-light)',
                  color: currentBranch?.textColor || 'var(--color-parish-primary)',
                  borderColor: currentBranch?.scarfColor || 'var(--color-parish-primary)',
                }}
              >
                <span>
                  {formData.holyName?.trim().charAt(0) ||
                    formData.fullName?.trim().charAt(0) ||
                    (studentToEdit ? studentToEdit.fullName.charAt(0) : '+')}
                </span>
              </div>
            )}
            <span
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-surface-card flex items-center justify-center text-xs font-black text-text-inverse shadow-xs"
              style={{ backgroundColor: currentBranch?.scarfColor || 'var(--color-parish-primary)' }}
              title={`Ngành ${currentBranch?.name}`}
            >
              {formData.branch.slice(0, 2).toUpperCase()}
            </span>
          </div>

          {/* IDENTITY TEXT & DETAILS */}
          <div className="flex-1 min-w-0 text-center sm:text-left flex flex-col gap-1">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
              <span className="text-xs font-semibold text-text-muted">
                {formData.holyName || (studentToEdit ? studentToEdit.holyName : 'Tên Thánh')}
              </span>
              <h4 className="text-base sm:text-lg font-bold text-text-main m-0 truncate">
                {formData.fullName || (studentToEdit ? studentToEdit.fullName : 'Họ và Tên Thiếu Nhi')}
              </h4>
            </div>

            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap pt-0.5">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border"
                style={{
                  borderColor: `${currentBranch?.scarfColor}40`,
                  backgroundColor: currentBranch?.badgeBg || 'var(--color-parish-primary-light)',
                  color: currentBranch?.textColor || 'var(--color-parish-primary)',
                }}
              >
                {currentBranch?.name}
              </span>
              {studentToEdit?.code && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-surface-hover text-text-secondary border border-surface-border">
                  Mã: {studentToEdit.code}
                </span>
              )}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                  formData.status === 'Đang học'
                    ? 'bg-parish-success-bg text-parish-success border border-parish-success/30'
                    : formData.status === 'Tạm vắng'
                    ? 'bg-parish-warning-bg text-parish-warning border border-parish-warning/30'
                    : 'bg-surface-hover text-text-muted border border-surface-border'
                }`}
              >
                {formData.status}
              </span>
            </div>
          </div>
        </Surface>

        {/* NAVIGATION TABS / PHÂN VÙNG NHANH */}
        <div
          role="tablist"
          className="flex items-center gap-1.5 p-1 bg-surface-card rounded-xl border border-surface-border overflow-x-auto no-scrollbar shrink-0"
        >
          {FORM_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap min-h-[36px] cursor-pointer ${
                  isActive
                    ? 'bg-parish-primary text-text-inverse shadow-xs'
                    : 'text-text-secondary hover:text-text-main hover:bg-surface-hover'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* KHỐI 1: CĂN TÍNH & THÔNG TIN CÁ NHÂN & PHÂN LỚP */}
        {(activeTab === 'all' || activeTab === 'personal') && (
          <Surface
            variant="card"
            className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-4 bg-surface-card shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-text-main">
                <User size={16} className="text-parish-primary" />
                <span>1. Căn Tính & Thông Tin Cá Nhân</span>
              </div>
              <span className="text-xs text-text-muted">Nhân thân & Phân lớp</span>
            </div>

            {/* Tên Thánh & Họ Tên & Giới tính */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr] gap-3.5">
              <div className="form-group">
                <label htmlFor="student-holyName" className="form-label">
                  Tên Thánh *
                </label>
                <input
                  id="student-holyName"
                  className={`form-input ${errors.holyName ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                  type="text"
                  placeholder="VD: Maria, Giuse..."
                  value={formData.holyName}
                  onBlur={() => handleBlur('holyName')}
                  onChange={(e) => {
                    setFormData({ ...formData, holyName: e.target.value });
                    if (errors.holyName) setErrors((prev) => ({ ...prev, holyName: '' }));
                  }}
                  aria-invalid={errors.holyName ? 'true' : undefined}
                  aria-describedby={errors.holyName ? 'holyName-error' : undefined}
                />
                {errors.holyName && (
                  <span id="holyName-error" role="alert" className="text-xs text-parish-danger mt-1 block font-medium">
                    {errors.holyName}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="student-fullName" className="form-label">
                  Họ và Tên Thiếu Nhi *
                </label>
                <input
                  id="student-fullName"
                  className={`form-input ${errors.fullName ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                  type="text"
                  placeholder="VD: Nguyễn Văn An"
                  value={formData.fullName}
                  onBlur={() => handleBlur('fullName')}
                  onChange={(e) => {
                    setFormData({ ...formData, fullName: e.target.value });
                    if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
                  }}
                  aria-invalid={errors.fullName ? 'true' : undefined}
                  aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                />
                {errors.fullName && (
                  <span id="fullName-error" role="alert" className="text-xs text-parish-danger mt-1 block font-medium">
                    {errors.fullName}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="student-gender" className="form-label">
                  Giới tính *
                </label>
                <select
                  id="student-gender"
                  className={`form-select ${errors.gender ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                  value={formData.gender}
                  onBlur={() => handleBlur('gender')}
                  onChange={(e) => {
                    setFormData({ ...formData, gender: e.target.value as 'Nam' | 'Nữ' });
                    if (errors.gender) setErrors((prev) => ({ ...prev, gender: '' }));
                  }}
                  aria-invalid={errors.gender ? 'true' : undefined}
                  aria-describedby={errors.gender ? 'gender-error' : undefined}
                >
                  <option value="">-- Chọn giới tính --</option>
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                </select>
                {errors.gender && (
                  <span id="gender-error" role="alert" className="text-xs text-parish-danger mt-1 block font-medium">
                    {errors.gender}
                  </span>
                )}
              </div>
            </div>

            {/* Phân Ngành & Lớp & Trạng Thái (Thứ tự combobox bảo toàn selects[1], selects[2], selects[3]) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="form-group">
                <label className="form-label">Phân Ngành TNTT</label>
                <select
                  className="form-select"
                  value={formData.branch}
                  disabled={!canEditCurrent}
                  onChange={(e) => {
                    const b = e.target.value as BranchType;
                    const firstCls = writableClassList.find((c) => c.branch === b) || classList.find((c) => c.branch === b);
                    setFormData({ ...formData, branch: b, classId: firstCls ? firstCls.id : '' });
                  }}
                >
                  {Object.values(BRANCHES).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.ageRange})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Lớp Giáo Lý</label>
                <select
                  className="form-select"
                  value={formData.classId}
                  disabled={!canEditCurrent}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const foundClass = rawClasses.find((c) => c.id === nextId) || classList.find((c) => c.id === nextId);
                    const nextBranch = (foundClass ? ('branch' in foundClass ? foundClass.branch : foundClass.branchId) : undefined) as BranchType | undefined;
                    setFormData({
                      ...formData,
                      classId: nextId,
                      ...(nextBranch ? { branch: nextBranch } : {}),
                    });
                  }}
                >
                  {formData.classId && !writableClassList.some(c => c.id === formData.classId) && (
                    <option value={formData.classId}>
                      {rawClasses.find(c => c.id === formData.classId)?.name || formData.classId} (Không phụ trách)
                    </option>
                  )}
                  {(() => {
                    const knownBranchClassIds = new Set<string>();
                    const groups = Object.values(BRANCHES).map((b) => {
                      const branchClasses = writableClassList.filter((c) => c.branch === b.id);
                      if (branchClasses.length === 0) return null;
                      branchClasses.forEach((c) => knownBranchClassIds.add(c.id));
                      return (
                        <optgroup key={b.id} label={`Ngành ${b.name}`}>
                          {branchClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    }).filter(Boolean);

                    const otherClasses = writableClassList.filter((c) => !knownBranchClassIds.has(c.id));
                    if (otherClasses.length > 0) {
                      groups.push(
                        <optgroup key="other" label="Khác">
                          {otherClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    }
                    if (groups.length === 0) {
                      return writableClassList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ));
                    }
                    return groups;
                  })()}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Trạng thái học</label>
                <select
                  className="form-select"
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as 'Đang học' | 'Nghỉ học' | 'Tạm vắng' })
                  }
                >
                  <option value="Đang học">Đang học</option>
                  <option value="Tạm vắng">Tạm vắng</option>
                  <option value="Nghỉ học">Nghỉ học</option>
                </select>
              </div>
            </div>

            {/* Lý do chuyển lớp/ngành nếu phát hiện thay đổi */}
            {membershipChanged && (
              <div className="p-3.5 rounded-xl bg-parish-warning-bg border border-parish-warning/30 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-parish-warning">
                  <AlertCircle size={15} />
                  <span>Xác nhận điều chỉnh phân lớp / phân ngành</span>
                </div>
                <div className="form-group mb-0">
                  <label htmlFor="student-membership-reason" className="form-label text-parish-warning">
                    Lý do chuyển lớp/ngành *
                  </label>
                  <textarea
                    id="student-membership-reason"
                    className={`form-textarea bg-surface-card ${
                      errors.membershipChangeReason ? 'border-parish-danger focus:ring-parish-danger' : ''
                    }`}
                    rows={2}
                    maxLength={500}
                    placeholder="VD: Điều chỉnh xếp lớp do nhập nhầm hồ sơ"
                    value={membershipChangeReason}
                    onChange={(e) => {
                      setMembershipChangeReason(e.target.value);
                      if (errors.membershipChangeReason)
                        setErrors((prev) => ({ ...prev, membershipChangeReason: '' }));
                    }}
                    aria-invalid={errors.membershipChangeReason ? 'true' : undefined}
                    aria-describedby={errors.membershipChangeReason ? 'membershipChangeReason-error' : undefined}
                  />
                  {errors.membershipChangeReason && (
                    <span
                      id="membershipChangeReason-error"
                      role="alert"
                      className="text-xs text-parish-danger mt-1 block font-medium"
                    >
                      {errors.membershipChangeReason}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Ngày sinh */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div className="form-group mb-0">
                <label htmlFor="student-dateOfBirth" className="form-label">
                  Ngày sinh *
                </label>
                <input
                  id="student-dateOfBirth"
                  className={`form-input ${errors.dateOfBirth ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                  type="date"
                  value={formData.dateOfBirth}
                  onBlur={() => handleBlur('dateOfBirth')}
                  onChange={(e) => {
                    setFormData({ ...formData, dateOfBirth: e.target.value });
                    if (errors.dateOfBirth) setErrors((prev) => ({ ...prev, dateOfBirth: '' }));
                  }}
                  aria-invalid={errors.dateOfBirth ? 'true' : undefined}
                  aria-describedby={errors.dateOfBirth ? 'dateOfBirth-error' : undefined}
                />
                {errors.dateOfBirth && (
                  <span
                    id="dateOfBirth-error"
                    role="alert"
                    className="text-xs text-parish-danger mt-1 block font-medium"
                  >
                    {errors.dateOfBirth}
                  </span>
                )}
              </div>
              <div className="flex items-center text-xs text-text-muted bg-surface-app p-3 rounded-xl border border-surface-border">
                <Info size={16} className="text-parish-primary shrink-0 mr-2" />
                <span>Ngày sinh dùng để tính tuổi tự động và xếp lớp phù hợp với quy chế giáo phận.</span>
              </div>
            </div>
          </Surface>
        )}

        {/* KHỐI 2: HÀNH TRÌNH BÍ TÍCH */}
        {(activeTab === 'all' || activeTab === 'sacraments') && (
          <Surface
            variant="card"
            className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-4 bg-surface-card shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-text-main">
                <Church size={16} className="text-parish-primary" />
                <span>2. Hành Trình Bí Tích</span>
              </div>
              <span className="text-xs text-text-muted">Các mốc lãnh nhận ơn Chúa</span>
            </div>

            {/* 3 mốc bí tích quan trọng */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="form-group">
                <label className="form-label">Ngày Rửa Tội</label>
                <input
                  className="form-input"
                  type="date"
                  value={formData.baptismDate}
                  onChange={(e) => setFormData({ ...formData, baptismDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày Rước Lễ Lần Đầu</label>
                <input
                  className="form-input"
                  type="date"
                  value={formData.firstCommunionDate}
                  onChange={(e) => setFormData({ ...formData, firstCommunionDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày Thêm Sức</label>
                <input
                  className="form-input"
                  type="date"
                  value={formData.confirmationDate}
                  onChange={(e) => setFormData({ ...formData, confirmationDate: e.target.value })}
                />
              </div>
            </div>

            {/* SacramentSection chi tiết nếu đang chỉnh sửa học sinh */}
            {studentToEdit && (
              <div className="pt-2 border-t border-surface-border/60">
                <SacramentSection student={studentToEdit} />
              </div>
            )}
          </Surface>
        )}

        {/* KHỐI 3: GIA ĐÌNH & LIÊN HỆ */}
        {(activeTab === 'all' || activeTab === 'family') && (
          <Surface
            variant="card"
            className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-4 bg-surface-card shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-text-main">
                <HeartHandshake size={16} className="text-parish-primary" />
                <span>3. Gia Đình & Liên Hệ</span>
              </div>
              <span className="text-xs text-text-muted">Phụ huynh & Địa chỉ gia đình</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="form-group">
                <label htmlFor="student-parentName" className="form-label">
                  Tên Phụ Huynh / Phụ Trách
                </label>
                <input
                  id="student-parentName"
                  className="form-input"
                  type="text"
                  placeholder="VD: Nguyễn Văn Bình"
                  value={formData.parentName}
                  onChange={(e) => {
                    setFormData({ ...formData, parentName: e.target.value });
                    setParentAccount((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }));
                  }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="student-parentPhone" className="form-label">
                  Số Điện Thoại Phụ Huynh
                </label>
                <input
                  id="student-parentPhone"
                  className={`form-input ${errors.parentPhone ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                  type="tel"
                  inputMode="tel"
                  placeholder="VD: 0903123456"
                  value={formData.parentPhone}
                  onBlur={() => handleBlur('parentPhone')}
                  onChange={(e) => {
                    setFormData({ ...formData, parentPhone: e.target.value });
                    setParentAccount((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }));
                    if (errors.parentPhone) setErrors((prev) => ({ ...prev, parentPhone: '' }));
                  }}
                  aria-invalid={errors.parentPhone ? 'true' : undefined}
                  aria-describedby={errors.parentPhone ? 'parentPhone-error' : undefined}
                />
                {errors.parentPhone && (
                  <span id="parentPhone-error" role="alert" className="text-xs text-parish-danger mt-1 block font-medium">
                    {errors.parentPhone}
                  </span>
                )}
              </div>
            </div>

            {/* ADR-026 (2026-08-22): tạo nhanh tài khoản phụ huynh từ SĐT vừa nhập — chỉ admin */}
            {isAdmin && (
              <div className="p-3.5 rounded-xl bg-surface-app border border-surface-border flex flex-col gap-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound size={16} className="text-parish-primary" />
                    <span className="text-xs font-bold text-text-main">Tiện ích tài khoản Phụ Huynh (ADR-026)</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!parentAccountReady || parentAccount.status === 'creating'}
                    onClick={handleCreateParentAccount}
                    title={
                      !parentPhoneValid
                        ? 'Nhập SĐT phụ huynh hợp lệ (10-11 số hoặc +84) để bật nút'
                        : !formData.parentName.trim()
                        ? 'Nhập Tên Phụ Huynh trước'
                        : 'Tạo tài khoản đăng nhập cho phụ huynh (username = SĐT)'
                    }
                  >
                    {parentAccount.status === 'creating' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <KeyRound size={14} />
                    )}
                    <span>Tạo Tài Khoản Phụ Huynh</span>
                  </button>
                </div>

                {!parentAccountReady && (
                  <span className="text-xs text-text-muted">
                    Cần SĐT hợp lệ (10-11 số hoặc +84) + Tên phụ huynh (≥ 2 ký tự) để tạo tài khoản đăng nhập.
                  </span>
                )}

                {parentAccount.status === 'done' && (
                  <div className="p-3 bg-parish-success-bg border border-parish-success/30 rounded-xl text-xs flex flex-col gap-1.5">
                    <p className="m-0 font-bold text-parish-success flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> Đã tạo tài khoản phụ huynh thành công
                    </p>
                    <div className="flex items-center gap-2 font-mono text-text-main flex-wrap bg-surface-card p-2 rounded-lg border border-parish-success/20">
                      <span>
                        Đăng nhập: <strong>{parentAccount.username}</strong>
                      </span>
                      <span className="text-text-muted">·</span>
                      <span>
                        Mật khẩu tạm: <strong>{parentAccount.tempPassword}</strong>
                      </span>
                      <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={handleCopyParentCredential}>
                        <Copy size={12} />
                        <span>{parentAccount.copied ? 'Đã chép' : 'Chép'}</span>
                      </button>
                    </div>
                    <p className="m-0 text-text-secondary leading-relaxed">
                      Chỉ hiển thị 1 lần — giao cho phụ huynh qua kênh riêng (Zalo/gặp trực tiếp). Lần đăng nhập đầu sẽ bắt buộc đổi mật khẩu.
                    </p>
                  </div>
                )}

                {parentAccount.status === 'error' && (
                  <div
                    className={`p-3 rounded-xl text-xs border flex items-start gap-2 ${
                      parentAccount.alreadyExists
                        ? 'bg-parish-warning-bg border-parish-warning/30 text-parish-warning'
                        : 'bg-parish-danger-bg border-parish-danger/30 text-parish-danger'
                    }`}
                  >
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{parentAccount.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* Địa chỉ gia đình */}
            <div className="form-group mb-0">
              <label htmlFor="student-address" className="form-label">
                Địa chỉ thường trú gia đình
              </label>
              <input
                id="student-address"
                className="form-input"
                type="text"
                placeholder="Địa chỉ nhà, khu phố, giáo họ..."
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
          </Surface>
        )}

        {/* KHỐI 4: GHI CHÚ SƯ PHẠM */}
        {(activeTab === 'all' || activeTab === 'notes') && (
          <Surface
            variant="card"
            className="p-4 sm:p-5 rounded-2xl border border-surface-border flex flex-col gap-4 bg-surface-card shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-text-main">
                <FileText size={16} className="text-parish-primary" />
                <span>4. Ghi Chú Sư Phạm & Huynh Trưởng</span>
              </div>
              <span className="text-xs text-text-muted">Nhật ký & Theo dõi rèn luyện</span>
            </div>

            <div className="form-group mb-0">
              <label htmlFor="student-notes" className="form-label">
                Ghi chú từ Huynh Trưởng
              </label>
              <textarea
                id="student-notes"
                className="form-textarea"
                rows={3}
                placeholder="VD: Tham gia ca đoàn, lễ sinh, năng nổ trong sinh hoạt, lưu ý sức khỏe..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </Surface>
        )}
      </form>
    </ModalShell>
  );
};
