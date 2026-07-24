import React from 'react';
import { 
  LayoutDashboard, Users, FileSpreadsheet, CheckSquare, 
  Printer, Bell, ShieldCheck, ChevronRight 
} from 'lucide-react';
import type { ClassInfo, BranchInfo } from '../../types';

export type DesktopTab = 'dashboard' | 'students' | 'grades' | 'attendance' | 'reports' | 'notices' | 'users';

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
    { id: 'users', label: 'Quản Lý Tài Khoản', icon: ShieldCheck },
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
          {menuItems.map((item) => {
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
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? '#1E3A8A' : '#475569',
                  background: isActive ? '#EFF6FF' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={18} color={isActive ? '#1E3A8A' : '#64748B'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Branch & Class Filter Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid #F1F5F9', paddingTop: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#94A3B8', letterSpacing: '0.8px', padding: '0 12px' }}>
          BỘ LỌC PHÂN NGÀNH & LỚP
        </div>

        {/* Branch Filter */}
        <div style={{ padding: '0 12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
            Phân Ngành
          </label>
          <select
            value={selectedBranchId}
            onChange={(e) => {
              setSelectedBranchId(e.target.value);
              setSelectedClassId('all');
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              background: '#F8FAFC',
              color: '#0F172A',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <option value="all">Tất cả Phân ngành</option>
            {Object.values(branches).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.ageRange})
              </option>
            ))}
          </select>
        </div>

        {/* Class Filter */}
        <div style={{ padding: '0 12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
            Lớp Học
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              background: '#F8FAFC',
              color: '#0F172A',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <option value="all">Tất cả Lớp học ({filteredClasses.length})</option>
            {filteredClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.room}
              </option>
            ))}
          </select>
        </div>
      </div>
    </aside>
  );
};
