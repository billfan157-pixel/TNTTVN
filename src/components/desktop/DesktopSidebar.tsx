import React from 'react';
import { 
  LayoutDashboard, Users, FileSpreadsheet, CheckSquare, 
  Printer, Bell, ShieldCheck, ChevronRight 
} from 'lucide-react';
import type { ClassInfo, BranchInfo } from '../../types';

export type DesktopTab = 'dashboard' | 'students' | 'grades' | 'attendance' | 'reports' | 'notices';

interface DesktopSidebarProps {
  activeTab: DesktopTab;
  setActiveTab: (tab: DesktopTab) => void;
  selectedBranchId: string;
  setSelectedBranchId: (branch: string) => void;
  selectedClassId: string;
  setSelectedClassId: (classId: string) => void;
  classes: ClassInfo[];
  branches: Record<string, BranchInfo>;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  setActiveTab,
  selectedBranchId,
  setSelectedBranchId,
  selectedClassId,
  setSelectedClassId,
  classes,
  branches
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Tổng Quan Giáo Xứ', icon: LayoutDashboard },
    { id: 'students', label: 'Danh Sách Thiếu Nhi', icon: Users },
    { id: 'grades', label: 'Nhập Điểm Hàng Loạt', icon: FileSpreadsheet },
    { id: 'attendance', label: 'Điểm Danh Chuyên Cần', icon: CheckSquare },
    { id: 'reports', label: 'Báo Cáo & In Phiếu', icon: Printer },
    { id: 'notices', label: 'Thông Báo Giáo Xứ', icon: Bell },
  ];

  const filteredClasses = selectedBranchId === 'all' 
    ? classes 
    : classes.filter(c => c.branch === selectedBranchId);

  return (
    <aside style={{
      width: '260px',
      background: 'white',
      borderRight: '1px solid #E2E8F0',
      minHeight: 'calc(100vh - 68px)',
      padding: '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      {/* Navigation Links */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#94A3B8', letterSpacing: '0.8px', padding: '0 12px 10px 12px' }}>
          CHỨC NĂNG QUẢN LÝ
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as DesktopTab)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: isActive ? '#EFF6FF' : 'transparent',
                  color: isActive ? '#1E3A8A' : '#475569',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} color={isActive ? '#1E3A8A' : '#64748B'} />
                </div>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                {isActive && <ChevronRight size={14} color="#1E3A8A" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Branch & Class Filters */}
      <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E3A8A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} /> LỌC PHÂN ĐOÀN & LỚP
        </div>

{/* Branch Selector */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '6px' }}>Phân Ngành TNTT</label>
          <select
            value={selectedBranchId}
            onChange={e => {
              setSelectedBranchId(e.target.value);
              setSelectedClassId('all');
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              height: '36px',
              fontSize: '12.5px',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
              background: 'white',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">Tất cả các Ngành</option>
            {Object.values(branches).map(b => (
              <option key={b.id} value={b.id}>{b.name} ({b.ageRange})</option>
            ))}
          </select>
        </div>

{/* Class Selector */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '6px' }}>Lớp Giáo Lý</label>
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              height: '36px',
              fontSize: '12.5px',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
              background: 'white',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">Tất cả các Lớp</option>
            {filteredClasses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Footer Info */}
      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #E2E8F0', fontSize: '11px', color: '#94A3B8' }}>
        <p style={{ margin: 0, fontWeight: 700, color: '#475569' }}>Ban Giáo Lý Giáo Xứ</p>
        <p style={{ margin: '2px 0 0 0' }}>Phiên bản Desktop UI 2.0</p>
      </div>
    </aside>
  );
};
