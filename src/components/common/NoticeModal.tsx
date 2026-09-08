import React, { useState, useEffect } from 'react';
import { ParishNotice, BranchType, NoticeAudience } from '../../types';
import { useNoticeStore } from '../../stores/noticeStore';

import { BRANCHES } from '../../constants/branches';
import { Save, Bell } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import { ModalShell } from './ModalShell';
import { FormField } from './FormField';

interface NoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  noticeToEdit?: ParishNotice | null;
}

export const NoticeModal: React.FC<NoticeModalProps> = ({ isOpen, onClose, noticeToEdit }) => {
  const createNotice = useNoticeStore(s => s.createNotice);
  const updateNotice = useNoticeStore(s => s.updateNotice);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    date: new Date().toISOString().split('T')[0],
    priority: 'normal' as 'normal' | 'important' | 'urgent',
    targetBranch: 'All' as BranchType | 'All',
    targetAudience: 'all' as NoticeAudience,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setErrors({});
    if (noticeToEdit) {
      setFormData({
        title: noticeToEdit.title || '',
        content: noticeToEdit.content || '',
        date: noticeToEdit.date || new Date().toISOString().split('T')[0],
        priority: noticeToEdit.priority || 'normal',
        targetBranch: noticeToEdit.targetBranch || 'All',
        targetAudience: (noticeToEdit.targetAudience as NoticeAudience) || 'all',
      });
    } else {
      setFormData({
        title: '',
        content: '',
        date: new Date().toISOString().split('T')[0],
        priority: 'normal',
        targetBranch: 'All',
        targetAudience: 'all',
      });
    }
  }, [noticeToEdit, isOpen]);

  // PHA 1 (2026-08-22 audit): Escape + scroll-lock + focus trap do ModalShell
  // đảm nhiệm — bỏ effect window keydown tự viết (không có stack arbitration).

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Vui lòng nhập tiêu đề thông báo.';
    }
    if (!formData.content.trim()) {
      newErrors.content = 'Vui lòng nhập nội dung thông báo.';
    }
    if (formData.title.length > 200) {
      newErrors.title = 'Tiêu đề không được quá 200 ký tự.';
    }
    if (formData.content.length > 5000) {
      newErrors.content = 'Nội dung không được quá 5000 ký tự.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        date: formData.date,
        author: 'Admin',
        priority: formData.priority,
        targetBranch: formData.targetBranch === 'All' ? undefined : formData.targetBranch,
        targetAudience: formData.targetAudience,
      };

      if (noticeToEdit) {
        await updateNotice(noticeToEdit.id, payload);
        useToastStore.getState().addToast('Đã cập nhật thông báo thành công!', 'success')
      } else {
        await createNotice(payload);
        useToastStore.getState().addToast('Đã tạo thông báo mới thành công!', 'success')
      }
      onClose();
    } catch {
      useToastStore.getState().addToast('Có lỗi xảy ra khi lưu thông báo. Vui lòng thử lại!', 'error')
    } finally {
      setIsSubmitting(false);
    }
  };

  const priorityOptions = [
    { value: 'normal', label: 'Bình thường' },
    { value: 'important', label: 'Thông tin' },
    { value: 'urgent', label: 'Khẩn' },
  ] as const;

  const audienceOptions = [
    { value: 'all', label: 'Toàn bộ (GLV + Phụ huynh)' },
    { value: 'staff', label: 'Chỉ Giáo Lý Viên (nội bộ)' },
    { value: 'parents', label: 'Chỉ Phụ huynh' },
  ] as const;

  const branchOptions = [
    { value: 'All', label: 'Tất cả các ngành' },
    ...Object.values(BRANCHES).map(b => ({ value: b.id, label: b.name })),
  ] as const;

  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={noticeToEdit ? 'Chỉnh Sửa Thông Báo' : 'Tạo Thông Báo Mới'}
      icon={<Bell size={20} />}
      maxWidth="600px"
      footer={(
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </button>
          <button type="submit" form="notice-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Đang lưu...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save size={16} />
                {noticeToEdit ? 'Lưu Thay Đổi' : 'Tạo Thông Báo'}
              </span>
            )}
          </button>
        </div>
      )}
    >
      <form id="notice-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Tiêu Đề" htmlFor="notice-title" required error={errors.title || null}>
          <input
            id="notice-title"
            className={`form-input ${errors.title ? 'border-red-500' : ''}`}
            type="text"
            placeholder="VD: Thông báo về lịch học Chúa Nhật tới"
            value={formData.title}
            onChange={e => {
              setFormData({ ...formData, title: e.target.value });
              if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
            }}
            maxLength={200}
          />
        </FormField>

        <FormField label="Nội Dung" htmlFor="notice-content" required error={errors.content || null}>
          <textarea
            id="notice-content"
            className={`form-textarea ${errors.content ? 'border-red-500' : ''}`}
            rows={5}
            placeholder="Nhập nội dung thông báo chi tiết..."
            value={formData.content}
            onChange={e => {
              setFormData({ ...formData, content: e.target.value });
              if (errors.content) setErrors(prev => ({ ...prev, content: '' }));
            }}
            maxLength={5000}
          />
        </FormField>
        <span className="text-xs text-text-muted text-right block -mt-2">{formData.content.length}/5000 ký tự</span>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Ngày Thông Báo" htmlFor="notice-date" required>
            <input
              id="notice-date"
              className="form-input"
              type="date"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </FormField>

          <FormField label="Độ Ưu Tiên" htmlFor="notice-priority" required>
            <select
              id="notice-priority"
              className="form-select"
              value={formData.priority}
              onChange={e => setFormData({ ...formData, priority: e.target.value as 'normal' | 'important' | 'urgent' })}
            >
              {priorityOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField
          label="Gửi Đến"
          htmlFor="notice-audience"
          required
          hint={formData.targetAudience === 'staff' ? 'Chỉ GLV/Admin/Phụ tá nhận thông báo ứng dụng' : formData.targetAudience === 'parents' ? 'Chỉ phụ huynh nhận thông báo ứng dụng (theo ngành nếu lọc)' : 'Cả nhân sự và phụ huynh nhận thông báo ứng dụng'}
        >
          <select
            id="notice-audience"
            className="form-select"
            value={formData.targetAudience}
            onChange={e => setFormData({ ...formData, targetAudience: e.target.value as NoticeAudience })}
          >
            {audienceOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Lọc Theo Ngành (Phụ huynh)"
          htmlFor="notice-target"
          hint={formData.targetAudience === 'staff' ? 'Không áp dụng khi chỉ gửi nội bộ GLV' : "Chọn 'Tất cả các ngành' để gửi đến toàn bộ phụ huynh"}
        >
          <select
            id="notice-target"
            className="form-select disabled:opacity-50"
            value={formData.targetBranch}
            onChange={e => setFormData({ ...formData, targetBranch: e.target.value as BranchType | 'All' })}
            disabled={formData.targetAudience === 'staff'}
          >
            {branchOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FormField>

      </form>
    </ModalShell>
  );
};
