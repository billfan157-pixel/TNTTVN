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

interface SidebarItem {
  id: DesktopTab;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

interface SidebarSection {
  /** undefined → nhóm đầu tiên không cần tiêu đề (Tổng Quan đứng một mình) */
  label?: string;
  items: SidebarItem[];
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

  const sections: SidebarSection[] = (() => {
    const overview: SidebarItem[] = [{ id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard }];

    // Con Của Tôi — cổng riêng của phụ huynh, nhóm ngay dưới Tổng Quan
    const parentHome: SidebarItem[] = role === 'phuhuynh'
      ? [{ id: 'parent', label: 'Con Của Tôi', icon: HeartHandshake }]
      : [];

    // Dạy học & theo dõi — chỉ nhân sự (GLV/trợ tá/admin)
    const teaching: SidebarItem[] = role === 'phuhuynh' ? [] : [
      { id: 'students', label: 'Thiếu Nhi', icon: Users },
      { id: 'grades', label: 'Bảng Điểm', icon: FileSpreadsheet },
      { id: 'attendance', label: 'Điểm Danh', icon: CheckSquare, badge: pendingCount > 0 ? pendingCount : undefined },
      ...((role === 'admin' || role === 'chunhiem') ? [{ id: 'reports', label: 'Báo Cáo', icon: Printer } as SidebarItem] : []),
    ];

    const community: SidebarItem[] = [
      { id: 'calendar', label: 'Lịch Phụng Vụ', icon: CalendarClock },
      { id: 'notices', label: 'Thông Báo', icon: Bell },
    ];

    const governance: SidebarItem[] = role === 'admin' ? [
      { id: 'finances', label: 'Quỹ & Thu Chi', icon: Wallet },
      { id: 'catechists', label: 'Giáo Lý Viên', icon: UserCheck },
      { id: 'management', label: 'Quản Lý Hệ Thống', icon: ShieldCheck },
      { id: 'audit-logs', label: 'Nhật Ký', icon: FileText },
    ] : [];

    return [
      { items: overview },
      ...(parentHome.length ? [{ items: parentHome }] : []),
      ...(teaching.length ? [{ label: 'DẠY HỌC & THEO DÕI', items: teaching }] : []),
      { label: 'CỘNG ĐỒNG GIÁO XỨ', items: community },
      ...(governance.length ? [{ label: 'QUẢN TRỊ', items: governance }] : []),
    ];
  })();

  const filteredClasses = selectedBranchId === 'all'
    ? classes
    : classes.filter(c => c.branch === selectedBranchId);

  const renderItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        className={`sidebar-nav-item ${isActive ? 'sidebar-nav-item-active' : ''}`}
        title={item.label}
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
  };

  return (
    <aside className="sidebar-container">
      {/* Navigation Links — phân nhóm theo vai trò để giảm tải nhận biết */}
      <div className="sidebar-nav">
        <nav className="sidebar-nav-list">
          {sections.map((section, idx) => (
            <React.Fragment key={section.label ?? `sec-${idx}`}>
              {section.label && <div className="sidebar-section-label">{section.label}</div>}
              {section.items.map(renderItem)}
            </React.Fragment>
          ))}
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
