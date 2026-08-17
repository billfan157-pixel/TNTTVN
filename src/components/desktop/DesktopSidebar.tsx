import React from 'react';
import {
  LayoutDashboard, Users, FileSpreadsheet, CheckSquare,
  Printer, Bell, ShieldCheck, Settings,
  UserCheck, FileText, HeartHandshake, CalendarClock, Wallet
} from 'lucide-react';
import type { ClassInfo, BranchInfo } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { useLeaveRequestStore } from '../../stores/leaveRequestStore';

export type DesktopTab = 'dashboard' | 'students' | 'grades' | 'attendance' | 'reports' | 'calendar' | 'notices' | 'users' | 'classes' | 'academic-years' | 'catechists' | 'audit-logs' | 'settings' | 'management' | 'parent' | 'finances';

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
  const { role } = useAuth();
  const pendingCount = useLeaveRequestStore((s) => s.pendingCount);
  const fetchPendingCount = useLeaveRequestStore((s) => s.fetchPendingCount);

  React.useEffect(() => {
    if (role !== 'phuhuynh') {
      fetchPendingCount();
    }
  }, [role, fetchPendingCount]);

  const menuItems = [
    { id: 'dashboard', label: 'Tổng Quan Giáo Xứ', icon: LayoutDashboard },
    ...(role === 'phuhuynh'
      ? [{ id: 'parent', label: 'Con Của Tôi', icon: HeartHandshake }]
      : [{ id: 'students', label: 'Danh Sách Thiếu Nhi', icon: Users }]),
    ...(role === 'phuhuynh' ? [] : [{ id: 'grades', label: 'Nhập Điểm Hàng Loạt', icon: FileSpreadsheet }]),
    ...(role === 'phuhuynh'
      ? []
      : [{ id: 'attendance', label: 'Điểm Danh Chuyên Cần', icon: CheckSquare, badge: pendingCount > 0 ? pendingCount : undefined }]),
    ...(role === 'phuhuynh' || role === 'phuta' ? [] : [{ id: 'reports', label: 'Báo Cáo & In Phiếu', icon: Printer }]),
    { id: 'calendar', label: 'Lịch Phụng Vụ', icon: CalendarClock },
    { id: 'notices', label: 'Thông Báo Giáo Xứ', icon: Bell },
    ...(role === 'admin' ? [{ id: 'finances', label: 'Quỹ & Thu Chi', icon: Wallet }] : []),
    ...(role === 'admin' ? [{ id: 'catechists', label: 'Giáo Lý Viên', icon: UserCheck }] : []),
    ...(role === 'admin' ? [{ id: 'management', label: 'Quản Lý Hệ Thống', icon: ShieldCheck }] : []),
    ...(role === 'admin' ? [{ id: 'audit-logs', label: 'Nhật Ký Hệ Thống', icon: FileText }] : []),
  ];

  const filteredClasses = selectedBranchId === 'all'
    ? classes
    : classes.filter(c => c.branch === selectedBranchId);

  return (
    <aside className="sidebar-container">
      {/* Navigation Links */}
      <div className="sidebar-nav">
        <div className="sidebar-section-label">
          CHỨC NĂNG QUẢN LÝ
        </div>
        <nav className="sidebar-nav-list">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as DesktopTab)}
                className={`sidebar-nav-item ${isActive ? 'sidebar-nav-item-active' : ''}`}
              >
                <Icon size={18} className={isActive ? 'text-parish-primary' : 'text-text-muted'} />
                <span className="sidebar-nav-label">{item.label}</span>
                {item.badge != null && (
                  <span className="badge badge-warning text-[10px] px-1.5 py-0.2 font-extrabold rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Branch & Class Filter Section (admin only — GLV only sees their assigned classes) */}
      {role === 'admin' && (
      <div className="sidebar-filter-section">
        <div className="sidebar-section-label">
          BỘ LỌC PHÂN NGÀNH & LỚP
        </div>

        {/* Branch Filter */}
        <div className="sidebar-filter-field">
          <label className="form-label">
            Phân Ngành
          </label>
          <select
            value={selectedBranchId}
            onChange={(e) => {
              setSelectedBranchId(e.target.value);
              setSelectedClassId('all');
            }}
            className="form-select"
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
        <div className="sidebar-filter-field">
          <label className="form-label">
            Lớp Học
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="form-select"
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
      )}

      {/* Settings button */}
      <button
        onClick={() => setActiveTab('settings')}
        className={`sidebar-nav-item ${activeTab === 'settings' ? 'sidebar-nav-item-active' : ''}`}
      >
        <Settings size={18} className={activeTab === 'settings' ? 'text-parish-primary' : 'text-text-muted'} />
        <span className="sidebar-nav-label">Cài Đặt</span>
      </button>
    </aside>
  );
};
