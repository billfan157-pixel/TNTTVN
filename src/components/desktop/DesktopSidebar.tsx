import React from 'react';
import {
  LayoutDashboard, Users, FileSpreadsheet, CheckSquare,
  Printer, Bell, ShieldCheck, Settings,
  UserCheck, FileText, HeartHandshake, CalendarClock, Wallet, Landmark, MessageSquareText,
  ClipboardList
} from 'lucide-react';
import type { ClassInfo, BranchInfo } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { useLeaveRequestStore } from '../../stores/leaveRequestStore';
import { WORKSPACE_DEFINITIONS, canRoleAccessRoute, getAccessibleWorkspaces, type WorkspaceId, type DesktopRouteTab } from '../../constants/routePolicy';

export type DesktopTab = DesktopRouteTab;

interface DesktopSidebarProps {
  activeTab: DesktopTab;
  setActiveTab: (tab: DesktopTab) => void;
  selectedBranchId: string;
  setSelectedBranchId: (branch: string) => void;
  selectedClassId: string;
  setSelectedClassId: (classId: string) => void;
  classes: ClassInfo[];
  branches: Record<string, BranchInfo>;
  activeWorkspace?: WorkspaceId;
  onWorkspaceChange?: (workspace: WorkspaceId) => void;
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
  branches,
  activeWorkspace = 'academic',
  onWorkspaceChange,
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
    const parentHome: SidebarItem[] = canRoleAccessRoute('/parent', role)
      ? [
          { id: 'parent', label: 'Con Của Tôi', icon: HeartHandshake },
          { id: 'feedback', label: 'Thư Góp Ý', icon: MessageSquareText },
        ]
      : [];

    // Dạy học & theo dõi — chỉ nhân sự (GLV/trợ tá/admin)
    const teaching: SidebarItem[] = [
      ...(canRoleAccessRoute('/students', role) ? [{ id: 'students', label: 'Thiếu Nhi', icon: Users } as SidebarItem] : []),
      ...(canRoleAccessRoute('/grades', role) ? [{ id: 'grades', label: 'Bảng Điểm', icon: FileSpreadsheet } as SidebarItem] : []),
      ...(canRoleAccessRoute('/attendance', role) ? [{ id: 'attendance', label: 'Điểm Danh', icon: CheckSquare, badge: pendingCount > 0 ? pendingCount : undefined } as SidebarItem] : []),
      ...(canRoleAccessRoute('/reports', role) ? [{ id: 'reports', label: 'Báo Cáo', icon: Printer } as SidebarItem] : []),
    ];

    const organization: SidebarItem[] = [
      { id: 'parish-home', label: 'Tổng Quan Xứ Đoàn', icon: LayoutDashboard },
      { id: 'parish-profile', label: 'Hồ Sơ Xứ Đoàn', icon: Landmark },
      ...(canRoleAccessRoute('/operations', role) ? [{ id: 'operations' as const, label: 'Công Việc', icon: ClipboardList } as SidebarItem] : []),
      { id: 'catechists', label: 'Giáo Lý Viên', icon: UserCheck },
      { id: 'calendar', label: 'Lịch Phụng Vụ', icon: CalendarClock },
      { id: 'notices', label: 'Thông Báo', icon: Bell },
      { id: 'feedback', label: 'Thư Góp Ý', icon: MessageSquareText },
    ];

    const organizationGovernance: SidebarItem[] = role === 'admin' ? [
      { id: 'finances', label: 'Quỹ & Thu Chi', icon: Wallet },
    ] : [];

    const platformGovernance: SidebarItem[] = role === 'admin' ? [
      { id: 'management', label: 'Quản Lý Hệ Thống', icon: ShieldCheck },
      { id: 'audit-logs', label: 'Nhật Ký', icon: FileText },
    ] : [];

    if (activeWorkspace === 'parent') {
      return [{ items: parentHome }];
    }

    if (activeWorkspace === 'organization') {
      return [
        { items: organization },
        ...(organizationGovernance.length ? [{ label: 'TÀI CHÍNH XỨ ĐOÀN', items: organizationGovernance }] : []),
        ...(platformGovernance.length ? [{ label: 'QUẢN TRỊ NỀN TẢNG', items: platformGovernance }] : []),
      ];
    }

    return [
      { items: overview },
      ...(teaching.length ? [{ label: 'DẠY HỌC & THEO DÕI', items: teaching }] : []),
      ...(platformGovernance.length ? [{ label: 'QUẢN TRỊ NỀN TẢNG', items: platformGovernance }] : []),
    ];
  })();

  const accessibleWorkspaces = getAccessibleWorkspaces(role);

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
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon size={18} className={isActive ? 'text-parish-primary' : 'text-text-muted'} />
        <span className="sidebar-nav-label">{item.label}</span>
        {item.badge != null && (
          <span className="badge badge-warning text-[10px] min-h-0 h-[18px] min-w-[18px] px-1.5 font-extrabold rounded-full">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="sidebar-container">
      {accessibleWorkspaces.length > 1 && (
        <div className="sidebar-workspace">
          <div className="sidebar-section-label">KHÔNG GIAN LÀM VIỆC</div>
          <div className="sidebar-nav-list" role="group" aria-label="Chuyển không gian làm việc">
            {accessibleWorkspaces.map(workspace => (
              <button
                key={workspace}
                type="button"
                className={`sidebar-nav-item w-full ${activeWorkspace === workspace ? 'sidebar-nav-item-active' : ''}`}
                aria-pressed={activeWorkspace === workspace}
                onClick={() => onWorkspaceChange?.(workspace)}
              >
                {workspace === 'academic' ? <FileSpreadsheet size={18} /> : <Landmark size={18} />}
                <span className="sidebar-nav-label">{WORKSPACE_DEFINITIONS[workspace].label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Navigation Links — phân nhóm theo vai trò để giảm tải nhận biết */}
      <div className="sidebar-nav">
        <nav className="sidebar-nav-list" aria-label="Điều hướng quản lý">
          {sections.map((section, idx) => (
            <React.Fragment key={section.label ?? `sec-${idx}`}>
              {section.label && <div className="sidebar-section-label">{section.label}</div>}
              {section.items.map(renderItem)}
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Footer ghim đáy (UI-POLISH-2026-08-25): Bộ lọc (admin) + Cài Đặt trong MỘT
          khối có 1 đường kẻ phân cách — nav phía trên tự cuộn, footer luôn nhìn thấy. */}
      <div className="sidebar-footer">
        {/* Branch & Class Filter Section (admin only — GLV only sees their assigned classes) */}
        {role === 'admin' && activeWorkspace === 'academic' && (
        <div className="sidebar-filter-section">
          <div className="sidebar-section-label">
            BỘ LỌC PHÂN NGÀNH & LỚP
          </div>

          {/* Branch Filter */}
          <div className="sidebar-filter-field">
            <label htmlFor="sidebar-branch-filter" className="form-label">
              Phân Ngành
            </label>
            <select
              id="sidebar-branch-filter"
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
            <label htmlFor="sidebar-class-filter" className="form-label">
              Lớp Học
            </label>
            <select
              id="sidebar-class-filter"
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
          aria-current={activeTab === 'settings' ? 'page' : undefined}
        >
          <Settings size={18} className={activeTab === 'settings' ? 'text-parish-primary' : 'text-text-muted'} />
          <span className="sidebar-nav-label">Cài đặt</span>
        </button>
      </div>
    </aside>
  );
};
