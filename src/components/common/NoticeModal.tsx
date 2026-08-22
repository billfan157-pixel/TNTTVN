import React, { useState, useEffect } from 'react';
import { ParishNotice, BranchType } from '../../types';
import { useNoticeStore } from '../../stores/noticeStore';

import { BRANCHES } from '../../constants/branches';
import { X, Save, Bell } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

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
      });
    } else {
      setFormData({
        title: '',
        content: '',
        date: new Date().toISOString().split('T')[0],
        priority: 'normal',
        targetBranch: 'All',
      });
    }
  }, [noticeToEdit, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 2026-08-22 mobile audit: khóa cuộn nền khi modal mở (đồng bộ hành vi ModalShell)
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isOpen]);

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

  const branchOptions = [
    { value: 'All', label: 'Tất cả các ngành' },
    ...Object.values(BRANCHES).map(b => ({ value: b.id, label: b.name })),
  ] as const;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="notice-modal-title" onClick={onClose}>
      <div className="modal-content max-w-[600px]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5 border-b border-surface-border pb-3">
          <div className="flex items-center gap-2">
            <Bell size={20} color="#1E3A8A" />
            <h3 id="notice-modal-title" className="text-lg font-bold m-0 text-parish-primary">
              {noticeToEdit ? 'Chỉnh Sửa Thông Báo' : 'Tạo Thông Báo Mới'}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="bg-transparent border-0 cursor-pointer text-text-muted">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label">Tiêu Đề *</label>
            <input
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
            {errors.title && <span className="text-xs text-red-500 mt-1 block font-medium">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Nội Dung *</label>
            <textarea
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
            {errors.content && <span className="text-xs text-red-500 mt-1 block font-medium">{errors.content}</span>}
            <span className="text-xs text-text-muted mt-1 block text-right">{formData.content.length}/5000 ký tự</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Ngày Thông Báo *</label>
              <input
                className="form-input"
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Độ Ưu Tiên *</label>
              <select
                className="form-select"
                value={formData.priority}
                onChange={e => setFormData({ ...formData, priority: e.target.value as 'normal' | 'important' | 'urgent' })}
              >
                {priorityOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Đối Tượng Nhận *</label>
            <select
              className="form-select"
              value={formData.targetBranch}
              onChange={e => setFormData({ ...formData, targetBranch: e.target.value as BranchType | 'All' })}
            >
              {branchOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="text-xs text-text-muted mt-1 block">Chọn 'Tất cả các ngành' để gửi đến toàn bộ học sinh</span>
          </div>

          <div className="flex justify-end gap-3 mt-2 pt-3 border-t border-surface-border">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
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
        </form>
      </div>
    </div>
  );
};