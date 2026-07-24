# Kiến Trúc Ứng Dụng — Giáo Lý Thiếu Nhi Thánh Thể

## Tổng Quan

Quản lý điểm số, chuyên cần và hồ sơ Thiếu Nhi Thánh Thể cho Giáo Xứ Thánh Gia. Hỗ trợ cả giao diện Desktop và Mobile với chế độ tự động nhận diện.

- **Framework**: React 19.2.7 + TypeScript 6.0.2
- **Build**: Vite 8.1.1
- **CSS**: TailwindCSS 4.3.3 + CSS vars
- **Router**: @tanstack/react-router v1.170.18
- **State**: Zustand 5.0.14 + persist (Dexie/IndexedDB)
- **Table**: @tanstack/react-table v8.21.3
- **Icons**: lucide-react 1.25.0
- **Monitoring**: @sentry/react 10.67.0
- **Utilities**: (none — Tailwind classes trực tiếp)

---

## Cấu Trúc Thư Mục

```
src/
├── __tests__/               # Unit tests
│   ├── grades.test.ts       # 25 tests cho calculateGradeAverage & calculateAttendanceRate
│   └── setup.ts             # jest-dom setup
├── assets/                  # Ảnh tĩnh (hero.png, svg logos)
├── components/
│   ├── common/              # Dùng chung cho cả Desktop & Mobile
│   │   ├── ErrorBoundary.tsx
│   │   ├── HeaderBar.tsx
│   │   ├── StudentModal.tsx
│   │   └── StudentReportModal.tsx
│   ├── desktop/             # Giao diện Desktop (≥768px)
│   │   ├── DesktopAttendanceGrid.tsx
│   │   ├── DesktopDashboard.tsx
│   │   ├── DesktopGradeMatrix.tsx
│   │   ├── DesktopNotices.tsx
│   │   ├── DesktopReports.tsx
│   │   ├── DesktopSidebar.tsx
│   │   └── DesktopStudentList.tsx
│   └── mobile/              # Giao diện Mobile (<768px)
│       ├── MobileAttendanceView.tsx
│       ├── MobileBottomNav.tsx
│       ├── MobileGradeView.tsx
│       ├── MobileHomeView.tsx
│       └── MobileStudentsView.tsx
├── data/
│   └── mockParishData.ts    # Dữ liệu mẫu (lớp, thiếu nhi, điểm, chuyên cần, thông báo)
├── hooks/
│   ├── useEffectiveMode.ts  # Tự động phát hiện Desktop/Mobile dựa vào viewport
│   ├── useOnlineStatus.ts   # Theo dõi trạng thái online/offline
│   └── useTheme.ts          # Quản lý dark/light mode
├── lib/
│   ├── db.ts                # Dexie (IndexedDB) — storage backend cho Zustand persist
│   └── sentry.ts            # Sentry init (DSN từ env VITE_SENTRY_DSN)
├── pages/                   # Entry points cho từng route
│   ├── AttendancePage.tsx
│   ├── DashboardPage.tsx
│   ├── GradesPage.tsx
│   ├── NoticesPage.tsx
│   ├── ReportsPage.tsx
│   └── StudentsPage.tsx
├── stores/                  # Zustand stores
│   ├── attendanceStore.ts   # AttendanceRecord CRUD + batch
│   ├── filterStore.ts       # Bộ lọc toàn cục (class, branch, search, semester, viewMode)
│   ├── gradeStore.ts        # GradeRecord CRUD + batch + tính điểm TB
│   ├── noticeStore.ts       # ParishNotice (read-only từ mock)
│   ├── resetStores.ts       # Hàm reset toàn bộ dữ liệu về mock mặc định
│   ├── studentStore.ts      # Student CRUD
│   ├── themeStore.ts        # Theme (light/dark)
│   └── useFilterSearchSync.ts  # Đồng bộ filter ↔ URL query params
├── types/
│   └── index.ts             # TypeScript interfaces (Student, GradeRecord, AttendanceRecord, v.v.)
├── utils/
│   ├── getDefaultDate.ts    # Lấy ngày Chủ Nhật gần nhất
│   └── grades.ts            # calculateGradeAverage (weighted avg) + calculateAttendanceRate
├── App.tsx                  # (unused — return null)
├── index.css                # Design token system + CSS classes global
├── main.tsx                 # Entry point
└── router.tsx               # Định nghĩa tất cả routes + RootLayout
```

---

## Luồng Khởi Động

```
index.html
  └─ src/main.tsx
       ├─ initSentry()           # Sentry (nếu có DSN)
       ├─ initDB()               # Dexie — migrate localStorage → IndexedDB
       ├─ <ErrorBoundary>        # Bắt lỗi React + gửi Sentry
       └─ <RouterProvider>       # TanStack Router
            └─ src/router.tsx
                 └─ RootLayout
                      ├─ useFilterSearchSync()   # URL ↔ store
                      ├─ useOnlineStatus()        # Online indicator banner
                      ├─ useTheme()               # Dark mode class
                      ├─ <HeaderBar />            # Header cố định
                      ├─ Desktop or Mobile layout
                      │    ├─ DesktopSidebar / MobileBottomNav
                      │    └─ <Outlet /> (page content)
                      ├─ <StudentModal />         # Modal thêm/sửa hồ sơ (global)
                      └─ <StudentReportModal />   # Modal phiếu điểm (global)
```

---

## Routing

Tất cả route được định nghĩa trong `src/router.tsx` với TanStack Router.

| Route | Component Page | Mô tả |
|-------|---------------|-------|
| `/` | → redirect `/dashboard` | |
| `/dashboard` | `DashboardPage.tsx` | Tổng quan giáo xứ (DesktopDashboard / MobileHomeView) |
| `/students` | `StudentsPage.tsx` | Danh sách & quản lý thiếu nhi |
| `/grades` | `GradesPage.tsx` | Bảng điểm giáo lý |
| `/attendance` | `AttendancePage.tsx` | Điểm danh chuyên cần |
| `/reports` | `ReportsPage.tsx` | Báo cáo & in phiếu điểm |
| `/notices` | `NoticesPage.tsx` | Thông báo giáo xứ |

---

## Pages (6 files)

Tất cả pages đều làm cùng một việc: kiểm tra `useEffectiveMode()` và render component Desktop hay Mobile tương ứng.

### `src/pages/DashboardPage.tsx`
- Desktop → `<DesktopDashboard onOpenAddStudent={...} />`
- Mobile → `<MobileHomeView />`
- **Mô tả**: Thống kê tổng quan (sĩ số, tỷ lệ chuyên cần, điểm giỏi/xuất sắc, số lớp)

### `src/pages/StudentsPage.tsx`
- Desktop → `<DesktopStudentList />`
- Mobile → `<MobileStudentsView />`
- **Mô tả**: CRUD hồ sơ thiếu nhi. Tìm kiếm, lọc theo lớp/ngành. Xem/sửa/xóa.

### `src/pages/GradesPage.tsx`
- Desktop → `<DesktopGradeMatrix />`
- Mobile → `<MobileGradeView />`
- **Mô tả**: Nhập điểm từng môn (Miệng, 15P, 1 Tiết, Giữa Kỳ, Cuối Kỳ). Tính ĐTB & xếp loại tự động.

### `src/pages/AttendancePage.tsx`
- Desktop → `<DesktopAttendanceGrid />`
- Mobile → `<MobileAttendanceView />`
- **Mô tả**: Điểm danh Có mặt / Vắng có phép / Vắng không phép. Lưu batch theo ngày + loại (Lễ CN / Giáo Lý).

### `src/pages/ReportsPage.tsx`
- Desktop → `<DesktopReports onViewReport={...} />`
- Mobile → `<MobileReportsView />` (fallback)
- **Mô tả**: Thống kê học lực theo phân ngành. In phiếu điểm cá nhân.

### `src/pages/NoticesPage.tsx`
- Desktop → `<DesktopNotices />`
- Mobile → `<MobileNoticesView />` (fallback)
- **Mô tả**: Xem danh sách thông báo giáo xứ với mức độ ưu tiên (urgent/important/normal).

---

## Component Hierarchy

### Common Components (src/components/common/)

| Component | Props | Mô tả |
|-----------|-------|-------|
| `HeaderBar` | (none — dùng store trực tiếp) | Header gradient xanh với logo, search, semester pills, view mode toggle, dark mode toggle, reset button |
| `StudentModal` | `isOpen, onClose, studentToEdit?` | Modal form thêm/sửa thiếu nhi (tên thánh, họ tên, ngành, lớp, ngày sinh, bí tích, phụ huynh, địa chỉ, ghi chú) |
| `StudentReportModal` | `isOpen, onClose, student` | Modal in phiếu điểm cá nhân (bảng điểm HK1+HK2, chuyên cần, nhận xét, chữ ký) |
| `ErrorBoundary` | `children, fallback?` | React class component bắt lỗi + gửi Sentry |

### Desktop Components (src/components/desktop/)

| Component | Props | Mô tả |
|-----------|-------|-------|
| `DesktopSidebar` | `activeTab, setActiveTab, selectedBranchId, setSelectedBranchId, selectedClassId, setSelectedClassId, classes, branches` | Sidebar trái với menu tabs + bộ lọc ngành/lớp |
| `DesktopDashboard` | `onOpenAddStudent` | 4 KPI cards, bảng chuyên cần gần đây, top học sinh, số lớp |
| `DesktopStudentList` | `onOpenAddStudent, onEditStudent, onViewReport` | Table tanstack với sort, filter, columns (STT, mã, tên, lớp, ngày sinh, phụ huynh, ĐTB, chuyên cần, actions) |
| `DesktopGradeMatrix` | (none) | Table điểm chi tiết với input từng môn, semester pills, lưu batch, tính ĐTB + xếp loại realtime |
| `DesktopAttendanceGrid` | (none) | Table điểm danh với 3 status buttons (Present/AbsentExcused/AbsentUnexcused), chọn ngày, loại, lưu batch |
| `DesktopReports` | `onViewReport` | Bảng thống kê học lực theo phân ngành, grid in phiếu điểm cá nhân |
| `DesktopNotices` | (none) | Table thông báo với priority badges (khẩn/thông tin/bình thường) |

### Mobile Components (src/components/mobile/)

| Component | Props | Mô tả |
|-----------|-------|-------|
| `MobileBottomNav` | `activeTab, setActiveTab` | Bottom nav 5 tabs (Trang Chủ, Điểm Danh, Bảng Điểm, Thiếu Nhi, Thống Kê) |
| `MobileHomeView` | `onNavigateTab, onOpenAddStudent` | Welcome card, 3 quick action buttons, stats cards, class pills, notices |
| `MobileStudentsView` | `onOpenAddStudent, onEditStudent, onViewReport` | Search + filter pills + student cards với info, avg, actions |
| `MobileGradeView` | `onViewReport` | Class + semester pill bar, grade cards với score grid 5 môn |
| `MobileAttendanceView` | (none) | Date input, type select, class select, student cards với 3 status buttons, floating save |

---

## State Management (7 Zustand Stores)

| Store | File | Key State | Persist | Mô tả |
|-------|------|-----------|---------|-------|
| `useStudentStore` | `studentStore.ts` | `students: Student[]` | ✅ Dexie | CRUD thiếu nhi (add, update, delete) |
| `useGradeStore` | `gradeStore.ts` | `grades: GradeRecord[]` | ✅ Dexie | CRUD điểm + batchSave, getStudentGrade, calculateStudentAvg |
| `useAttendanceStore` | `attendanceStore.ts` | `attendance: AttendanceRecord[]` | ✅ Dexie | CRUD chuyên cần + batchSave, getStudentAttendanceRate |
| `useFilterStore` | `filterStore.ts` | `selectedClassId, selectedBranchId, searchQuery, selectedSemester, viewMode` | ✅ Dexie | Bộ lọc toàn cục (dùng chung mọi trang) |
| `useUIStore` | `uiStore.ts` | `isStudentModalOpen, studentToEdit, isReportModalOpen, studentForReport` | ❌ | Modal state (mở/đóng, student đang chỉnh sửa) |
| `useThemeStore` | `themeStore.ts` | `theme: 'light' \| 'dark'` | ✅ Dexie | Dark mode toggle |
| `useNoticeStore` | `noticeStore.ts` | `notices: ParishNotice[]` | ❌ | Thông báo (read-only từ mock data) |

**resetStores.ts**: Hàm `resetAllStoresToDefault()` khôi phục student, grade, attendance stores về mock data.

**useFilterSearchSync.ts**: Đồng bộ 2 chiều giữa filterStore và URL query params (`?classId=...&branchId=...&semester=...&search=...`).

---

## Data Layer

### Types (`src/types/index.ts`)

| Type | Fields chính |
|------|-------------|
| `Student` | `id, code, holyName, fullName, gender, dateOfBirth, baptismDate?, parentName, parentPhone, address, branch, classId, status` |
| `GradeRecord` | `id, studentId, academicYear, semester, scoreOral, score15m, score1Period, scoreMidterm, scoreFinal, comments?` |
| `AttendanceRecord` | `id, studentId, date, type (SundayMass\|CatechismClass), status (Present\|AbsentExcused\|AbsentUnexcused), note?` |
| `ParishNotice` | `id, title, content, date, author, priority (normal\|important\|urgent), targetBranch?` |
| `ClassInfo` | `id, code, name, branch, catechistLeader, catechistAssistants, room, academicYear` |
| `BranchInfo` | `id (BranchType), name, scarfColor, bgColor, badgeBg, textColor, description, ageRange` |
| `ViewMode` | `'auto' \| 'desktop' \| 'mobile'` |

### Mock Data (`src/data/mockParishData.ts`)

- `BRANCHES`: 5 phân ngành TNTT (Chiên Con, Ấu Nhi, Thiếu Nhi, Nghĩa Sĩ, Hiệp Sĩ)
- `MOCK_CLASSES`: 7 lớp học
- `MOCK_STUDENTS`: 15 thiếu nhi mẫu
- `MOCK_GRADES`: 18 bản ghi điểm (HK1 + HK2)
- `MOCK_ATTENDANCE`: 26 bản ghi chuyên cần
- `MOCK_NOTICES`: 3 thông báo mẫu

### Business Logic (`src/utils/grades.ts`)

- `calculateGradeAverage(grade)`: Tính điểm trung bình có trọng số (Miệng×1, 15P×1, 1Tiết×2, Giữa Kỳ×2, Cuối Kỳ×3). Xếp loại: Xuất Sắc (≥9.0), Giỏi (≥8.0), Khá (≥6.5), TB (≥5.0), Yếu (<5.0).
- `calculateAttendanceRate(present, total)`: Tính % chuyên cần.

---

## Hooks

| Hook | File | Mô tả |
|------|------|-------|
| `useEffectiveMode()` | `hooks/useEffectiveMode.ts` | Trả về `'desktop'` (≥768px) hoặc `'mobile'`. Tôn trọng `viewMode` trong filterStore (auto/desktop/mobile). |
| `useOnlineStatus()` | `hooks/useOnlineStatus.ts` | Trả về `boolean` — theo dõi sự kiện online/offline. |
| `useTheme()` | `hooks/useTheme.ts` | Quản lý class `dark` trên `<html>`. Trả về `{ theme, toggleTheme }`. |

---

## CSS & Design Token System

### Theme (`src/index.css`)

Sử dụng `@theme` của TailwindCSS 4 tại `src/index.css`:

```
--color-parish-primary: #1E3A8A (xanh đậm)
--color-parish-secondary: #D97706 (vàng/hổ phách)
--color-parish-success: #16A34A (xanh lá)
--color-parish-warning: #EA580C (cam)
--color-parish-danger: #DC2626 (đỏ)
--color-surface-card: #FFFFFF
--color-surface-hover: #F1F5F9
--color-surface-border: #E2E8F0
--color-surface-app: #F8FAFC
--color-text-main: #0F172A
--color-text-muted: #64748B

--radius-sm: 8px
--radius-md: 12px
--radius-lg: 16px
--radius-full: 9999px

--space-3.5: 14px

--shadow-card / --shadow-card-hover / --shadow-modal
```

Dark mode sử dụng class `.dark` trên `<html>` — CSS variables được ghi đè hoàn toàn cho màu nền tối.

### Custom CSS Classes Global

| Class | Mô tả |
|-------|-------|
| `.btn` | Button chuẩn (h-38px, gap-8px, px-4 py-2, rounded-12px, font-600) |
| `.btn-primary` | Xanh #1E3A8A chữ trắng |
| `.btn-secondary` | Xám #F1F5F9 chữ #475569 + border |
| `.btn-sm` | h-32px, px-3 py-1, font-12px, rounded-8px |
| `.btn-lg` | h-44px, px-5 py-2.5, font-14px |
| `.form-input` | Input chuẩn (h-38px, px-3 py-2, rounded-12px) |
| `.form-select` | Select chuẩn (giống form-input) |
| `.form-textarea` | Textarea (rounded-12px) |
| `.form-input-sm` | Search input (h-36px, pl-34px, rounded-full) |
| `.form-label` | Label (font-12px, font-700, color #64748B) |
| `.badge` | Badge pill (h-22px, px-2.5 py-0.5, rounded-full, font-11px) |
| `.icon-container` | 20×20px flex center |
| `.icon-container-lg` | 24×24px flex center |
| `.modal-overlay` | Fixed fullscreen overlay + backdrop |
| `.modal-content` | Modal card (rounded-16px, p-6, shadow-modal) |
| `.pill-btn` | Pill button (h-32px, px-3, rounded-full, font-12px) |

---

## Storage

Dùng **Dexie** (IndexedDB wrapper) làm storage backend cho Zustand persist middleware.

**Database**: `ParishDB`

**Table**: `stores` — key-value với keys:
- `parish_store_students`
- `parish_store_grades`
- `parish_store_attendance`
- `parish_store_filters`
- `parish_store_theme`

Khi khởi tạo, `dexieStorage` tự động migrate dữ liệu từ `localStorage` nếu có (fallback: localStorage).

---

## Testing

**File**: `src/__tests__/grades.test.ts`
**Framework**: Vitest + @testing-library/jest-dom
**Số lượng**: 25 tests

- 21 tests cho `calculateGradeAverage` (null input, all scores, partial scores, boundary values, decimal scores)
- 4 tests cho `calculateAttendanceRate` (0%, 100%, edge cases)

**Scripts**:
- `npm run test` — chạy một lần (vitest run)
- `npm run test:watch` — watch mode

---

## Build & Scripts

| Script | Lệnh | Mô tả |
|--------|------|-------|
| `dev` | `vite` | Dev server |
| `build` | `tsc -b && vite build` | TypeScript check + build production |
| `lint` | `oxlint` | Lint (0 errors, 21 warnings) |
| `test` | `vitest run` | Unit tests (25/25) |
| `preview` | `vite preview` | Preview build |

**Config files**: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vitest.config.ts`

---

## Lint & TypeCheck

- **TypeScript**: `tsc -b` — 0 errors
- **Lint**: `oxlint` — 0 errors, 21 warnings (unused vars, react-hooks exhaustive-deps, fast refresh)
- **Test**: `vitest run` — 25/25 passing

---

## Luồng Dữ Liệu Điển Hình

### Desktop: Thêm thiếu nhi mới
```
User clicks "Thêm" (DesktopStudentList)
  → calls openAddStudent() (useUIStore)
  → StudentModal opens (isStudentModalOpen = true)
  → Fill form → submit
  → addStudent(formData) (useStudentStore)
  → Dexie persist
  → Students list re-renders
```

### Desktop: Nhập điểm & lưu
```
User edits input (DesktopGradeMatrix)
  → handleInputChange(studentId, field, value)
  → Updates local currentRec in matrixData state
  → User clicks "Lưu" → handleSaveNow()
  → batchSaveGrades(records, selectedSemester) (useGradeStore)
  → Dexie persist
```

### Mobile: Điểm danh
```
User selects date (MobileAttendanceView)
  → setDate → useEffect → filter attendance records
  → User taps status button → handleToggle(studentId, status)
  → Updates local attendanceMap state
  → User taps floating save → handleSave()
  → batchSaveAttendance(list, date, type) (useAttendanceStore)
  → Dexie persist
```
