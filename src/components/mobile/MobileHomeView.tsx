import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useFilterStore } from '../../stores/filterStore';
import { useNoticeStore } from '../../stores/noticeStore';
import { MOCK_CLASSES } from '../../data/mockParishData';
import { 
  CheckSquare, FileSpreadsheet, UserPlus, 
  Sparkles, Bell 
} from 'lucide-react';

interface MobileHomeViewProps {
  onNavigateTab: (tab: any) => void;
  onOpenAddStudent: () => void;
}

export const MobileHomeView: React.FC<MobileHomeViewProps> = ({ onNavigateTab, onOpenAddStudent }) => {
  const students = useStudentStore(s => s.students)
  const attendance = useAttendanceStore(s => s.attendance)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)
  const notices = useNoticeStore(s => s.notices)

  const totalStudents = students.length;
  
  // Calculate attendance
  let totalPresent = 0;
  attendance.forEach(a => { if (a.status === 'Present') totalPresent++; });
  const attRate = attendance.length > 0 ? Math.round((totalPresent / attendance.length) * 100) : 100;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '80px' }}>
      {/* Welcome Card */}
      <div style={{
        background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
        color: 'white',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 8px 20px -4px rgba(30, 58, 138, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Sparkles color="#FDE047" size={16} />
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: '#FDE047', textTransform: 'uppercase' }}>
            Giáo Xứ Gia Tôn
          </span>
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '2px 0 6px 0' }}>
          Thiếu Nhi Thánh Thể
        </h2>
        <p style={{ fontSize: '13px', opacity: 0.9, margin: 0, lineHeight: 1.4 }}>
          Sổ tay Giáo lý di động cho Huynh Trưởng & Phụ Huynh.
        </p>
      </div>

      {/* Quick Action Buttons Grid */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-parish-primary)', marginBottom: '8px' }}>
          THAO TÁC NHANH
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <button
            onClick={() => onNavigateTab('attendance')}
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-surface-border)',
              borderRadius: '12px',
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)'
            }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-parish-success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckSquare size={20} color="var(--color-parish-success)" />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-parish-primary)' }}>Điểm Danh</span>
          </button>

          <button
            onClick={() => onNavigateTab('grades')}
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-surface-[#DBEAFE])',
              borderColor: 'var(--color-surface-border)',
              borderRadius: '12px',
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)'
            }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-parish-secondary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileSpreadsheet size={20} color="var(--color-parish-secondary)" />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-parish-primary)' }}>Bảng Điểm</span>
          </button>

          <button
            onClick={onOpenAddStudent}
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-surface-border)',
              borderRadius: '12px',
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)'
            }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-parish-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={20} color="var(--color-parish-primary)" />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-parish-primary)' }}>Thêm Em</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ background: 'var(--color-surface-card)', borderRadius: '16px', padding: '16px', border: '1px solid var(--color-surface-border)' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Sỉ Số Thiếu Nhi</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-parish-primary)', marginTop: '2px' }}>
            {totalStudents} <span style={{ fontSize: '12px', fontWeight: 500 }}>em</span>
          </div>
        </div>

        <div style={{ background: 'var(--color-surface-card)', borderRadius: '16px', padding: '16px', border: '1px solid var(--color-surface-border)' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Đi Lễ & Đi Học</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-parish-success)', marginTop: '2px' }}>
            {attRate}%
          </div>
        </div>
      </div>

      {/* Class Selector Pill List */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-parish-primary)', marginBottom: '8px' }}>
          LỚP GIÁO LÝ
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            onClick={() => setSelectedClassId('all')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '20px',
              border: 'none',
              background: selectedClassId === 'all' ? 'var(--color-parish-primary)' : 'var(--color-surface-hover)',
              color: selectedClassId === 'all' ? 'white' : 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            Tất cả
          </button>
          {MOCK_CLASSES.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedClassId(c.id)}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '20px',
                border: 'none',
                background: selectedClassId === c.id ? 'var(--color-parish-primary)' : 'var(--color-surface-hover)',
                color: selectedClassId === c.id ? 'white' : 'var(--color-text-muted)',
                whiteSpace: 'nowrap',
                cursor: 'pointer'
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Notices */}
      <div style={{ background: 'var(--color-surface-card)', borderRadius: '12px', padding: '14px', border: '1px solid var(--color-surface-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <Bell size={16} color="var(--color-parish-secondary)" />
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-parish-primary)', margin: 0 }}>
            Thông Báo Mới
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notices.map(n => (
            <div key={n.id} style={{ borderBottom: '1px solid var(--color-surface-border)', paddingBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-main)' }}>{n.title}</div>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0 0', lineHeight: 1.3 }}>
                {n.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
