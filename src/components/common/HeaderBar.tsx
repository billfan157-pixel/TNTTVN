import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useFilterStore } from '../../stores/filterStore';
import { useEffectiveMode } from '../../hooks/useEffectiveMode';
import { resetAllStoresToDefault } from '../../stores/resetStores';
import { useTheme } from '../../hooks/useTheme';
import { ConfirmDialog } from './ConfirmDialog';
import logo from '../../assets/logo-tntt.png';
import { Monitor, Smartphone, Moon, Sun, RefreshCw, Search } from 'lucide-react';

export const HeaderBar: React.FC = () => {
  const students = useStudentStore(s => s.students);
  const viewMode = useFilterStore(s => s.viewMode);
  const setViewMode = useFilterStore(s => s.setViewMode);
  const searchQuery = useFilterStore(s => s.searchQuery);
  const setSearchQuery = useFilterStore(s => s.setSearchQuery);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester);
  const effectiveMode = useEffectiveMode();
  const { theme, toggleTheme } = useTheme();

  const [localSearch, setLocalSearch] = React.useState(searchQuery);

  React.useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery]);

  const [showResetConfirm, setShowResetConfirm] = React.useState(false);

  const handleReset = () => {
    setShowResetConfirm(true);
  };

  return (
    <>
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
      }}
    >
      <div className={`flex items-center justify-between flex-wrap w-full gap-8 ${effectiveMode === 'desktop' ? 'px-6' : 'px-4'}`} style={{ minHeight: effectiveMode === 'desktop' ? '80px' : '72px' }}>
        {/* Logo & Title */}
        <div className="flex items-center gap-4">
          <img
            src={logo}
            alt="TNTT Logo"
            className={`shrink-0 ${effectiveMode === 'desktop' ? 'w-10 h-10' : 'w-9 h-9'}`}
          />
          <div>
        <div className="flex items-center gap-4 -ml-1">
              <h1 className={`font-extrabold m-0 text-white ${effectiveMode === 'desktop' ? 'text-xl' : 'text-[16px]'}`}
                style={{ letterSpacing: '-0.3px' }}>
                Giáo Lý Thiếu Nhi Thánh Thể
              </h1>
              <span className={`font-extrabold rounded-md ${effectiveMode === 'desktop' ? 'text-xs px-[18px] py-1' : 'text-[11px] px-[12px] py-0.5'} bg-[#FDE047] text-[#1E3A8A]`}>
                Giáo Xứ Gia Tôn
              </span>
            </div>
            <p className={`m-0 mt-2 font-medium text-white opacity-90 ${effectiveMode === 'desktop' ? 'text-sm' : 'text-[12px]'}`}>
              Sổ Điểm & Theo Dõi Học Tập • Niên Học 2025 - 2026 ({students.length} Thiếu Nhi)
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6 flex-wrap">
          {/* Quick Search */}
          <div className={`relative ${effectiveMode === 'desktop' ? 'w-64' : 'w-36'}`}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm tên, mã, Tên Thánh..."
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              className="w-full h-9 text-sm rounded-full outline-none pl-9 pr-3.5 border border-white/30 bg-white/15 text-white"
            />
          </div>

          {/* Semester Selector */}
          <div className="flex items-center gap-3 h-9 px-1.5 rounded-xl bg-white/15">
            <button
              onClick={() => setSelectedSemester(1)}
              className="flex items-center px-3 h-7 text-xs font-bold border-none rounded-lg cursor-pointer transition-all duration-150"
              style={{
                background: selectedSemester === 1 ? 'white' : 'transparent',
                color: selectedSemester === 1 ? '#1E3A8A' : 'white',
              }}
            >
              HK I
            </button>
            <button
              onClick={() => setSelectedSemester(2)}
              className="flex items-center px-3 h-7 text-xs font-bold border-none rounded-lg cursor-pointer transition-all duration-150"
              style={{
                background: selectedSemester === 2 ? 'white' : 'transparent',
                color: selectedSemester === 2 ? '#1E3A8A' : 'white',
              }}
            >
              HK II
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center h-9 px-1 rounded-xl gap-0 bg-black/25 border border-white/20">
            <button
              onClick={() => setViewMode('desktop')}
              title="Chuyển sang Giao diện Desktop"
              className="flex items-center gap-1.5 px-3.5 h-7 text-xs font-bold border-none rounded-lg cursor-pointer transition-all duration-150"
              style={{
                background: viewMode === 'desktop' || (viewMode === 'auto' && effectiveMode === 'desktop') ? '#FEF08A' : 'transparent',
                color: viewMode === 'desktop' || (viewMode === 'auto' && effectiveMode === 'desktop') ? '#854D0E' : 'white',
              }}
            >
              <Monitor size={15} />
              {effectiveMode === 'desktop' && viewMode === 'desktop' ? 'Desktop ✓' : 'Desktop'}
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              title="Chuyển sang Giao diện Mobile"
              className="flex items-center gap-1.5 px-3.5 h-7 text-xs font-bold border-none rounded-lg cursor-pointer transition-all duration-150"
              style={{
                background: viewMode === 'mobile' || (viewMode === 'auto' && effectiveMode === 'mobile') ? '#FEF08A' : 'transparent',
                color: viewMode === 'mobile' || (viewMode === 'auto' && effectiveMode === 'mobile') ? '#854D0E' : 'white',
              }}
            >
              <Smartphone size={15} />
              {effectiveMode === 'mobile' && viewMode === 'mobile' ? 'Mobile ✓' : 'Mobile'}
            </button>
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            className="w-9 h-9 flex items-center justify-center rounded-xl border-none cursor-pointer bg-white/15 text-white"
          >
            {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </button>

          {/* Reset button */}
          <button
            onClick={handleReset}
            aria-label="Khôi phục dữ liệu gốc mẫu"
            className="w-9 h-9 flex items-center justify-center rounded-xl border-none cursor-pointer bg-white/15 text-white"
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Khôi phục dữ liệu gốc"
        message="Bạn có chắc muốn khôi phục dữ liệu Giáo xứ mặc định? Thao tác này sẽ đặt lại dữ liệu mẫu gốc."
        confirmText="Khôi phục"
        cancelText="Hủy"
        variant="warning"
        onConfirm={() => {
          resetAllStoresToDefault();
          setShowResetConfirm(false);
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </>
  );
};
