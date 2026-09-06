import React, { useState, useEffect, useMemo } from 'react';
import { Student, BranchType } from '../../types';
import { useStudentStore } from '../../stores/studentStore';
import { useClassStore, getFilteredClassList } from '../../stores/classStore';
import { BRANCHES } from '../../constants/branches';
import { X, Save, UserPlus, KeyRound, Copy, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import { SacramentSection } from './SacramentSection';
import { useToastStore } from '../../stores/toastStore';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { ModalPortal } from './ModalPortal';

// ADR-026 tiện ích (2026-08-22): admin tạo nhanh tài khoản phụ huynh ngay trong
// modal học sinh khi đã nhập đủ Tên PH + SĐT (10 số) — dùng chung POST /users
// (username = SĐT chuẩn hóa, temp password trả 1 lần, FORCE_PASSWORD_CHANGE).
type ParentAccountState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'done'; username: string; tempPassword: string; copied: boolean }
  | { status: 'error'; alreadyExists: boolean; message: string }

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentToEdit?: Student | null;
  onGoToClasses?: () => void;
}

export const StudentModal: React.FC<StudentModalProps> = ({ isOpen, onClose, studentToEdit, onGoToClasses }) => {
  const addStudent = useStudentStore(s => s.addStudent)
  const updateStudent = useStudentStore(s => s.updateStudent)
  const rawClasses = useClassStore(s => s.classes)

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
    notes: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [membershipChangeReason, setMembershipChangeReason] = useState('')
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [parentAccount, setParentAccount] = useState<ParentAccountState>({ status: 'idle' });

  const parentPhoneValid = /^[0-9]{10}$/.test(formData.parentPhone.trim());
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
  const rawClassesRef = React.useRef(rawClasses);
  rawClassesRef.current = rawClasses;
  useEffect(() => {
    const liveClasses = rawClassesRef.current;
    setErrors({});
    setMembershipChangeReason('');
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
        notes: studentToEdit.notes || ''
      });
    } else {
      const defaultBranch = (liveClasses[0]?.branchId as BranchType) || 'AuNhi';
      const defaultClassId = liveClasses[0]?.id || 'AU1';
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
        notes: ''
      });
    }
  }, [studentToEdit, isOpen]);

  const classList = useMemo(() => getFilteredClassList(rawClasses), [rawClasses]);
  const membershipChanged = Boolean(studentToEdit && (
    formData.classId !== studentToEdit.classId || formData.branch !== studentToEdit.branch
  ));

  const { dialogRef: modalRef } = useAccessibleDialog(isOpen, onClose)

  if (!isOpen) return null;

  if (!studentToEdit && classList.length === 0) {
    return (
      <ModalPortal>
      <div className="modal-overlay app-modal-layer" role="dialog" aria-modal="true" aria-labelledby="add-student-title" onClick={onClose}>
        <div ref={modalRef} className="modal-content max-w-[480px]" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-5 border-b border-surface-border pb-3">
            <div className="flex items-center gap-2">
              <UserPlus size={20} className="text-parish-primary" />
              <h3 id="add-student-title" className="text-lg font-bold m-0 text-parish-primary">Thêm Hồ Sơ Thiếu Nhi Mới</h3>
            </div>
            <button onClick={onClose} aria-label="Đóng" className="mobile-touch-target bg-transparent border-0 cursor-pointer text-text-muted">
              <X size={20} />
            </button>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col items-start gap-3">
            <div className="flex items-center gap-2">
              <UserPlus size={20} className="text-amber-600" />
              <p className="text-sm font-bold text-amber-800 m-0">Chưa có lớp học nào</p>
            </div>
            <p className="text-sm text-amber-700 m-0 font-medium leading-relaxed">
              Quy trình sử dụng: <strong>Tạo Năm Học → Tạo Lớp Học → Nhập Danh Sách Thiếu Nhi</strong>.
              Hãy tạo lớp học trước khi thêm học sinh.
            </p>
            {onGoToClasses && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { onClose(); onGoToClasses() }}
              >
                <UserPlus size={14} /> Quản Lý Lớp Học Trong Trang Thiếu Nhi
              </button>
            )}
          </div>
        </div>
      </div>
      </ModalPortal>
    );
  }

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
        if (value.trim() && !/^[0-9]{10}$/.test(value.trim())) {
          return 'Số điện thoại phải gồm 10 chữ số.';
        }
        return '';
      default:
        return '';
    }
  };

  const handleBlur = (field: string) => {
    const errorMsg = validateField(field, (formData as any)[field] || '');
    if (errorMsg) {
      setErrors(prev => ({ ...prev, [field]: errorMsg }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const fieldsToValidate = ['holyName', 'fullName', 'gender', 'dateOfBirth', 'parentPhone'];
    for (const field of fieldsToValidate) {
      const err = validateField(field, (formData as any)[field] || '');
      if (err) newErrors[field] = err;
    }
    if (membershipChanged && membershipChangeReason.trim().length < 5) {
      newErrors.membershipChangeReason = 'Vui lòng nhập lý do chuyển lớp/ngành (ít nhất 5 ký tự).';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const addToast = useToastStore.getState().addToast
    const studentPayload = {
      ...formData,
      gender: formData.gender as 'Nam' | 'Nữ',
      ...(membershipChanged ? { membershipChangeReason: membershipChangeReason.trim() } : {}),
    }
    setIsSubmitting(true)
    try {
      if (studentToEdit) {
        await updateStudent(studentToEdit.id, studentPayload);
        addToast('Đã lưu cập nhật trên thiết bị và đưa vào hàng đợi đồng bộ.', 'success')
      } else {
        await addStudent(studentPayload);
        addToast('Đã lưu hồ sơ trên thiết bị và đưa vào hàng đợi đồng bộ.', 'success')
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể lưu hồ sơ trên thiết bị.'
      addToast(message, 'error', 5000)
    } finally {
      setIsSubmitting(false)
    }
  };

  const filteredClasses = classList.filter(c => c.branch === formData.branch);

  const titleId = studentToEdit ? 'edit-student-title' : 'add-student-title'

  return (
    <ModalPortal>
    <div className="modal-overlay app-modal-layer" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div ref={modalRef} className="modal-content max-w-[600px]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5 border-b border-surface-border pb-3">
          <div className="flex items-center gap-2">
              <UserPlus size={20} className="text-parish-primary" />
            <h3 id={titleId} className="text-lg font-bold m-0 text-parish-primary">
              {studentToEdit ? 'Chỉnh Sửa Thông Tin Thiếu Nhi' : 'Thêm Hồ Sơ Thiếu Nhi Mới'}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="mobile-touch-target bg-transparent border-0 cursor-pointer text-text-muted">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Tên Thánh & Họ Tên */}
          <div className="grid grid-cols-[1fr_2fr_1fr] gap-3.5">
            <div className="form-group">
              <label htmlFor="student-holyName" className="form-label">Tên Thánh *</label>
              <input
                id="student-holyName"
                className={`form-input ${errors.holyName ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                type="text"
                placeholder="VD: Maria, Giuse..."
                value={formData.holyName}
                onBlur={() => handleBlur('holyName')}
                onChange={e => {
                  setFormData({ ...formData, holyName: e.target.value });
                  if (errors.holyName) setErrors(prev => ({ ...prev, holyName: '' }));
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
              <label htmlFor="student-fullName" className="form-label">Họ và Tên Thiếu Nhi *</label>
              <input
                id="student-fullName"
                className={`form-input ${errors.fullName ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                type="text"
                placeholder="VD: Nguyễn Văn An"
                value={formData.fullName}
                onBlur={() => handleBlur('fullName')}
                onChange={e => {
                  setFormData({ ...formData, fullName: e.target.value });
                  if (errors.fullName) setErrors(prev => ({ ...prev, fullName: '' }));
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
              <label htmlFor="student-gender" className="form-label">Giới tính *</label>
              <select
                id="student-gender"
                className={`form-select ${errors.gender ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                value={formData.gender}
                onBlur={() => handleBlur('gender')}
                onChange={e => {
                  setFormData({ ...formData, gender: e.target.value as 'Nam' | 'Nữ' });
                  if (errors.gender) setErrors(prev => ({ ...prev, gender: '' }));
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

          {/* Ngành & Lớp */}
          <div className="grid grid-cols-3 gap-3.5">
            <div className="form-group">
              <label className="form-label">Phân Ngành TNTT</label>
              <select
                className="form-select"
                value={formData.branch}
                onChange={e => {
                  const b = e.target.value as BranchType;
                  const firstCls = classList.find(c => c.branch === b);
                  setFormData({ ...formData, branch: b, classId: firstCls ? firstCls.id : '' });
                }}
              >
                {Object.values(BRANCHES).map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.ageRange})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Lớp Giáo Lý</label>
              <select
                className="form-select"
                value={formData.classId}
                onChange={e => setFormData({ ...formData, classId: e.target.value })}
              >
                {filteredClasses.length > 0 ? (
                  filteredClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))
                ) : (
                  classList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))
                )}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Trạng thái học</label>
              <select
                className="form-select"
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as 'Đang học' | 'Nghỉ học' | 'Tạm vắng' })}
              >
                <option value="Đang học">Đang học</option>
                <option value="Tạm vắng">Tạm vắng</option>
                <option value="Nghỉ học">Nghỉ học</option>
              </select>
            </div>
          </div>

          {membershipChanged && (
            <div className="form-group">
              <label htmlFor="student-membership-reason" className="form-label">Lý do chuyển lớp/ngành *</label>
              <textarea
                id="student-membership-reason"
                className={`form-textarea ${errors.membershipChangeReason ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                rows={2}
                maxLength={500}
                placeholder="VD: Điều chỉnh xếp lớp do nhập nhầm hồ sơ"
                value={membershipChangeReason}
                onChange={e => {
                  setMembershipChangeReason(e.target.value)
                  if (errors.membershipChangeReason) setErrors(prev => ({ ...prev, membershipChangeReason: '' }))
                }}
                aria-invalid={errors.membershipChangeReason ? 'true' : undefined}
                aria-describedby={errors.membershipChangeReason ? 'membershipChangeReason-error' : undefined}
              />
              {errors.membershipChangeReason && (
                <span id="membershipChangeReason-error" role="alert" className="text-xs text-parish-danger mt-1 block font-medium">
                  {errors.membershipChangeReason}
                </span>
              )}
            </div>
          )}

          {/* Ngày sinh & Các Bí Tích */}
          <div className="grid grid-cols-3 gap-3.5">
            <div className="form-group">
              <label htmlFor="student-dateOfBirth" className="form-label">Ngày sinh *</label>
              <input
                id="student-dateOfBirth"
                className={`form-input ${errors.dateOfBirth ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                type="date"
                value={formData.dateOfBirth}
                onBlur={() => handleBlur('dateOfBirth')}
                onChange={e => {
                  setFormData({ ...formData, dateOfBirth: e.target.value });
                  if (errors.dateOfBirth) setErrors(prev => ({ ...prev, dateOfBirth: '' }));
                }}
                aria-invalid={errors.dateOfBirth ? 'true' : undefined}
                aria-describedby={errors.dateOfBirth ? 'dateOfBirth-error' : undefined}
              />
              {errors.dateOfBirth && (
                <span id="dateOfBirth-error" role="alert" className="text-xs text-parish-danger mt-1 block font-medium">
                  {errors.dateOfBirth}
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Ngày Rửa Tội</label>
              <input
                className="form-input"
                type="date"
                value={formData.baptismDate}
                onChange={e => setFormData({ ...formData, baptismDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Ngày Rước Lễ Lần Đầu</label>
              <input
                className="form-input"
                type="date"
                value={formData.firstCommunionDate}
                onChange={e => setFormData({ ...formData, firstCommunionDate: e.target.value })}
              />
            </div>
          </div>

          {/* Phụ huynh & SĐT */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="form-group">
              <label className="form-label">Tên Phụ Huynh / Phụ Trách</label>
              <input
                className="form-input"
                type="text"
                placeholder="VD: Nguyễn Văn Bình"
                value={formData.parentName}
                onChange={e => {
                  setFormData({ ...formData, parentName: e.target.value });
                  // Sửa Tên PH/SĐT sau khi đã tạo tài khoản → kết quả cũ không còn chính xác
                  setParentAccount(prev => (prev.status === 'idle' ? prev : { status: 'idle' }));
                }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="student-parentPhone" className="form-label">Số Điện Thoại Phụ Huynh</label>
              <input
                id="student-parentPhone"
                className={`form-input ${errors.parentPhone ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
                type="text"
                placeholder="VD: 0903123456"
                value={formData.parentPhone}
                onBlur={() => handleBlur('parentPhone')}
                onChange={e => {
                  setFormData({ ...formData, parentPhone: e.target.value });
                  setParentAccount(prev => (prev.status === 'idle' ? prev : { status: 'idle' }));
                  if (errors.parentPhone) setErrors(prev => ({ ...prev, parentPhone: '' }));
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!parentAccountReady || parentAccount.status === 'creating'}
                  onClick={handleCreateParentAccount}
                  title={!parentPhoneValid ? 'Nhập SĐT phụ huynh đúng 10 số để bật nút' : !formData.parentName.trim() ? 'Nhập Tên Phụ Huynh trước' : 'Tạo tài khoản đăng nhập cho phụ huynh (username = SĐT)'}
                >
                  {parentAccount.status === 'creating' ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  <span>Tạo Tài Khoản Phụ Huynh</span>
                </button>
                {!parentAccountReady && (
                  <span className="text-[11px] text-text-muted">Cần SĐT đúng 10 số + Tên phụ huynh để tạo tài khoản đăng nhập</span>
                )}
              </div>
              {parentAccount.status === 'done' && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs flex flex-col gap-1">
                  <p className="m-0 font-bold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Đã tạo tài khoản phụ huynh
                  </p>
                  <div className="flex items-center gap-2 font-mono text-text-main flex-wrap">
                    <span>Đăng nhập: <strong>{parentAccount.username}</strong></span>
                    <span className="text-text-muted">·</span>
                    <span>Mật khẩu tạm: <strong>{parentAccount.tempPassword}</strong></span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={handleCopyParentCredential}>
                      <Copy size={12} />
                      <span>{parentAccount.copied ? 'Đã chép' : 'Chép'}</span>
                    </button>
                  </div>
                  <p className="m-0 text-emerald-700 leading-relaxed">
                    Chỉ hiển thị 1 lần — giao cho phụ huynh qua kênh riêng (Zalo/gặp trực tiếp). Lần đăng nhập đầu sẽ bắt buộc đổi mật khẩu.
                  </p>
                </div>
              )}
              {parentAccount.status === 'error' && (
                <div
                  className={`p-3 rounded-xl text-xs border flex items-start gap-2 ${
                    parentAccount.alreadyExists
                      ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900 text-amber-700'
                      : 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900 text-rose-600'
                  }`}
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{parentAccount.message}</span>
                </div>
              )}
            </div>
          )}

          {/* Hành Trình Bí Tích */}
          {studentToEdit && (
            <SacramentSection student={studentToEdit} />
          )}

          {/* Địa chỉ & Ghi chú */}
          <div className="form-group">
            <label className="form-label">Địa chỉ gia đình</label>
            <input
              className="form-input"
              type="text"
              placeholder="Địa chỉ nhà, khu phố, giáo họ..."
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Ghi chú từ Huynh Trưởng</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="VD: Tham gia ca đoàn, lễ sinh, khiếu nại điểm..."
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 mt-2 pt-3 border-t border-surface-border">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSubmitting ? 'Đang lưu...' : studentToEdit ? 'Lưu Thay Đổi' : 'Thêm Thiếu Nhi'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
};
