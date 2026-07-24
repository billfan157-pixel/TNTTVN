import React from 'react';
import { Home, CheckSquare, FileSpreadsheet, Users, PieChart } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export type MobileTab = 'home' | 'attendance' | 'grades' | 'students' | 'stats';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { role } = useAuth();
  const tabs = [
    { id: 'home', label: 'Trang Chủ', icon: Home },
    ...(role === 'phuhuynh' ? [] : [{ id: 'attendance', label: 'Điểm Danh', icon: CheckSquare }]),
    ...(role === 'phuhuynh' ? [] : [{ id: 'grades', label: 'Bảng Điểm', icon: FileSpreadsheet }]),
    { id: 'students', label: 'Thiếu Nhi', icon: Users },
    ...(role === 'phuhuynh' ? [] : [{ id: 'stats', label: 'Thống Kê', icon: PieChart }]),
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '64px',
      background: 'var(--color-surface-card)',
      borderTop: '1px solid var(--color-surface-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      zIndex: 1000,
      boxShadow: 'var(--shadow-dropdown)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)'
    }}>
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as MobileTab)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              border: 'none',
              background: 'transparent',
              color: isActive ? 'var(--color-parish-primary)' : 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 700 : 500,
              cursor: 'pointer',
              flex: 1,
              height: '100%'
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '16px',
              background: isActive ? 'var(--color-parish-primary-light)' : 'transparent',
            }}>
              <Icon size={20} color={isActive ? 'var(--color-parish-primary)' : 'var(--color-text-muted)'} />
            </div>
            <span style={{ marginTop: '2px' }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
