import React, { useState, useEffect, useRef } from 'react';
import { Student, BranchType } from '../../types';
import { useStudentStore } from '../../stores/studentStore';
import { MOCK_CLASSES, BRANCHES } from '../../data/mockParishData';
import { X, Save, UserPlus } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { SacramentSection } from './SacramentSection';

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentToEdit?: Student | null;
}

export const StudentModal: React.FC<StudentModalProps> = ({ isOpen, onClose, studentToEdit }) => {
  const addStudent = useStudentStore(s => s.addStudent)
  const updateStudent = useStudentStore(s => s.updateStudent)

  const [formData, setFormData] = useState({
    holyName: '',
    fullName: '',
    gender: 'Nam' as 'Nam' | 'Nữ',
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

  useEffect(() => {
    setErrors({});
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
      setFormData({
        holyName: 'Maria',
        fullName: '',
        gender: 'Nữ',
        dateOfBirth: '2016-01-01',
        baptismDate: '',
        firstCommunionDate: '',
        confirmationDate: '',
        parentName: '',
        parentPhone: '',
        address: 'Giáo xứ Thánh Gia',
        branch: 'AuNhi',
        classId: MOCK_CLASSES[0]?.id || 'AU1',
        status: 'Đang học',
        notes: ''
      });
    }
  }, [studentToEdit, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const modalRef = useFocusTrap(isOpen)

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.holyName.trim()) {
      newErrors.holyName = 'Vui lòng nhập Tên Thánh.';
    }
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Vui lòng nhập Họ và Tên.';
    }
    if (formData.dateOfBirth) {
      const dob = new Date(formData.dateOfBirth);
      if (dob > new Date()) {
        newErrors.dateOfBirth = 'Ngày sinh không thể ở tương lai.';
      }
    }
    if (formData.parentPhone.trim() && !/^[0-9]{10}$/.test(formData.parentPhone.trim())) {
      newErrors.parentPhone = 'Số điện thoại phải gồm 10 chữ số.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (studentToEdit) {
      updateStudent(studentToEdit.id, formData);
    } else {
      addStudent(formData);
    }
    onClose();
  };

  const filteredClasses = MOCK_CLASSES.filter(c => c.branch === formData.branch);

  const titleId = studentToEdit ? 'edit-student-title' : 'add-student-title'

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div ref={modalRef} className="modal-content max-w-[600px]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5 border-b border-surface-border pb-3">
          <div className="flex items-center gap-2">
            <UserPlus size={20} color="#1E3A8A" />
            <h3 id={titleId} className="text-lg font-bold m-0 text-parish-primary">
              {studentToEdit ? 'Chỉnh Sửa Thông Tin Thiếu Nhi' : 'Thêm Hồ Sơ Thiếu Nhi Mới'}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="bg-transparent border-0 cursor-pointer text-text-muted">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Tên Thánh & Họ Tên */}
          <div className="grid grid-cols-[1fr_2fr_1fr] gap-3.5">
            <div className="form-group">
              <label className="form-label">Tên Thánh *</label>
              <input
                className={`form-input ${errors.holyName ? 'border-red-500' : ''}`}
                type="text"
                placeholder="VD: Maria, Giuse..."
                value={formData.holyName}
                onChange={e => {
                  setFormData({ ...formData, holyName: e.target.value });
                  if (errors.holyName) setErrors(prev => ({ ...prev, holyName: '' }));
                }}
              />
              {errors.holyName && <span className="text-xs text-red-500 mt-1 block font-medium">{errors.holyName}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Họ và Tên Thiếu Nhi *</label>
              <input
                className={`form-input ${errors.fullName ? 'border-red-500' : ''}`}
                type="text"
                placeholder="VD: Nguyễn Văn An"
                value={formData.fullName}
                onChange={e => {
                  setFormData({ ...formData, fullName: e.target.value });
                  if (errors.fullName) setErrors(prev => ({ ...prev, fullName: '' }));
                }}
              />
              {errors.fullName && <span className="text-xs text-red-500 mt-1 block font-medium">{errors.fullName}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Giới tính</label>
              <select
                className="form-select"
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value as 'Nam' | 'Nữ' })}
              >
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
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
                  const firstCls = MOCK_CLASSES.find(c => c.branch === b);
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
                  MOCK_CLASSES.map(c => (
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

          {/* Ngày sinh & Các Bí Tích */}
          <div className="grid grid-cols-3 gap-3.5">
            <div className="form-group">
              <label className="form-label">Ngày sinh</label>
              <input
                className={`form-input ${errors.dateOfBirth ? 'border-red-500' : ''}`}
                type="date"
                value={formData.dateOfBirth}
                onChange={e => {
                  setFormData({ ...formData, dateOfBirth: e.target.value });
                  if (errors.dateOfBirth) setErrors(prev => ({ ...prev, dateOfBirth: '' }));
                }}
              />
              {errors.dateOfBirth && <span className="text-xs text-red-500 mt-1 block font-medium">{errors.dateOfBirth}</span>}
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
                onChange={e => setFormData({ ...formData, parentName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Số Điện Thoại Phụ Huynh</label>
              <input
                className={`form-input ${errors.parentPhone ? 'border-red-500' : ''}`}
                type="text"
                placeholder="VD: 0903123456"
                value={formData.parentPhone}
                onChange={e => {
                  setFormData({ ...formData, parentPhone: e.target.value });
                  if (errors.parentPhone) setErrors(prev => ({ ...prev, parentPhone: '' }));
                }}
              />
              {errors.parentPhone && <span className="text-xs text-red-500 mt-1 block font-medium">{errors.parentPhone}</span>}
            </div>
          </div>

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
            <button type="submit" className="btn btn-primary">
              <Save size={16} />
              {studentToEdit ? 'Lưu Thay Đổi' : 'Thêm Thiếu Nhi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
