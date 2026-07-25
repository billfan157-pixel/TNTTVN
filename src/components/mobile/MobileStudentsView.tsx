import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { Student } from '../../types';
import { useClassStore } from '../../stores/classStore';
import { BRANCHES } from '../../data/mockParishData';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { 
  Phone, UserPlus, Search, Edit3, 
  Trash2, Printer 
} from 'lucide-react';

interface MobileStudentsViewProps {
  onOpenAddStudent: () => void;
  onEditStudent: (student: Student) => void;
  onViewReport: (student: Student) => void;
}

export const MobileStudentsView: React.FC<MobileStudentsViewProps> = ({
  onOpenAddStudent,
  onEditStudent,
  onViewReport
}) => {
  const students = useStudentStore(s => s.students)
  const deleteStudent = useStudentStore(s => s.deleteStudent)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)
  const selectedBranchId = useFilterStore(s => s.selectedBranchId)
  const searchQuery = useFilterStore(s => s.searchQuery)
  const setSearchQuery = useFilterStore(s => s.setSearchQuery)
  const selectedSemester = useFilterStore(s => s.selectedSemester)

  const filteredStudents = students.filter(s => {
    if (selectedBranchId !== 'all' && s.branch !== selectedBranchId) return false;
    if (selectedClassId !== 'all' && s.classId !== selectedClassId) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchHoly = s.holyName.toLowerCase().includes(q);
      const matchFull = s.fullName.toLowerCase().includes(q);
      const matchCode = s.code.toLowerCase().includes(q);
      if (!matchHoly && !matchFull && !matchCode) return false;
    }
    return true;
  });

  const [pendingDelete, setPendingDelete] = React.useState<Student | null>(null);

  const handleDelete = (s: Student) => {
    setPendingDelete(s);
  };

  return (
    <>
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '80px' }}>
      {/* Search & Add */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            placeholder="Tìm thiếu nhi..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: '36px',
              padding: '8px 12px 8px 40px',
              fontSize: '13px',
              borderRadius: '9999px',
              border: '1px solid #CBD5E1',
              outline: 'none',
              background: 'white'
            }}
          />
        </div>

        <button onClick={onOpenAddStudent} className="btn btn-primary" style={{ height: '36px', borderRadius: '9999px', padding: '0 16px' }}>
          <UserPlus size={16} /> Thêm
        </button>
      </div>

      {/* Class Selector Pill Bar */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          onClick={() => setSelectedClassId('all')}
          style={{
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 700,
            borderRadius: '16px',
            border: 'none',
            minHeight: '44px',
            background: selectedClassId === 'all' ? '#1E3A8A' : '#E2E8F0',
            color: selectedClassId === 'all' ? 'white' : '#475569',
            whiteSpace: 'nowrap'
          }}
        >
          Tất cả lớp
        </button>
        {useClassStore.getState().getClassList().map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedClassId(c.id)}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '16px',
              border: 'none',
              minHeight: '44px',
              background: selectedClassId === c.id ? '#1E3A8A' : '#E2E8F0',
              color: selectedClassId === c.id ? 'white' : '#475569',
              whiteSpace: 'nowrap'
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Student List Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748B', background: 'white', borderRadius: '16px' }}>
            Không tìm thấy thiếu nhi nào.
          </div>
        ) : (
          filteredStudents.map(s => {
            const branch = BRANCHES[s.branch];
            const cls = useClassStore.getState().findClassById(s.classId);
            const avg = calculateStudentAvg(s.id, selectedSemester);

            return (
              <div
                key={s.id}
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '16px',
                  border: '1px solid #E2E8F0',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#1E3A8A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ color: '#D97706', marginRight: '6px' }}>{s.holyName}</span>
                      <span>{' '}{s.fullName}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="badge" style={{ background: branch?.badgeBg, color: branch?.textColor }}>
                        {branch?.name}
                      </span>
                      <span>• {cls?.name}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#1E3A8A' }}>
                      {avg.score !== null ? avg.score : '-'}
                    </div>
                    <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                      {avg.label}
                    </span>
                  </div>
                </div>

                {/* Info row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569', background: '#F8FAFC', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    Phụ huynh: <strong>{s.parentName}</strong>
                  </div>
                  {s.parentPhone && (
                    <a 
                      href={`tel:${s.parentPhone}`} 
                      style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '8px' }}
                    >
                      <Phone size={12} /> Gọi PH
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', borderTop: '1px solid #F1F5F9', paddingTop: '8px' }}>
                  <button onClick={() => onViewReport(s)} className="btn btn-secondary btn-sm">
                    <Printer size={12} /> In Phiếu
                  </button>
                  <button onClick={() => onEditStudent(s)} className="btn btn-secondary btn-sm">
                    <Edit3 size={12} /> Sửa
                  </button>
                  <button onClick={() => handleDelete(s)} className="btn btn-secondary btn-sm">
                    <Trash2 size={12} color="#DC2626" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Xóa thiếu nhi"
        message={pendingDelete ? `Bạn có chắc chắn muốn xóa thiếu nhi ${pendingDelete.holyName} ${pendingDelete.fullName}?` : ''}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) deleteStudent(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
};
