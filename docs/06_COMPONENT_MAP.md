# Component Map
> Version: 1.1 | Last reviewed: 2026-07-25 | Status: ✅ Current | Prerequisites: 01, 02

## Common Components (14)

### HeaderBar
| Property | Value |
|----------|-------|
| **File** | `src/components/common/HeaderBar.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | `useThemeStore` (theme toggle), `useAuthStore` (user info), `useUIStore` (diagnostics modal) |
| **Reusable** | ✅ Rendered once at app root |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Sync status, user badge + logout, theme toggle, reset button, open diagnostics button |

### ErrorBoundary
| Property | Value |
|----------|-------|
| **File** | `src/components/common/ErrorBoundary.tsx` |
| **Importers** | `src/main.tsx` |
| **Owns state** | Internal: `hasError`, `error` |
| **Reusable** | ✅ Can wrap any subtree |
| **Dead** | ❌ |
| **Notes** | Class component, integrates with Sentry |

### ConfirmDialog
| Property | Value |
|----------|-------|
| **File** | `src/components/common/ConfirmDialog.tsx` |
| **Importers** | HeaderBar, DesktopStudentList, MobileStudentsView |
| **Owns state** | Props-driven (isOpen, onConfirm, onCancel) |
| **Reusable** | ✅ Generic confirmation modal |
| **Dead** | ❌ |
| **Notes** | Uses focus trap for a11y |

### InstallPrompt
| Property | Value |
|----------|-------|
| **File** | `src/components/common/InstallPrompt.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Internal: PWA install state |
| **Reusable** | ✅ Rendered once |
| **Dead** | ❌ |
| **Notes** | Floating PWA install button |

### StudentModal
| Property | Value |
|----------|-------|
| **File** | `src/components/common/StudentModal.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Props-driven; contains `SacramentSection` |
| **Reusable** | ✅ Add/Edit student form |
| **Dead** | ❌ |
| **Notes** | Rendered in root layout, controlled by `useUIStore` |

### StudentReportModal
| Property | Value |
|----------|-------|
| **File** | `src/components/common/StudentReportModal.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Props-driven |
| **Reusable** | ✅ |
| **Dead** | ❌ |

### PrintReportModal
| Property | Value |
|----------|-------|
| **File** | `src/components/common/PrintReportModal.tsx` |
| **Importers** | Reports page |
| **Owns state** | Props-driven |
| **Reusable** | ✅ |
| **Dead** | ❌ |
| **Notes** | Batch PDF report printing |

### PhotoCard
| Property | Value |
|----------|-------|
| **File** | `src/components/common/PhotoCard.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Reusable** | ✅ |
| **Dead** | ❌ |
| **Notes** | Printable "thẻ thiếu nhi" |

### Certificate
| Property | Value |
|----------|-------|
| **File** | `src/components/common/Certificate.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Reusable** | ✅ |
| **Dead** | ❌ |
| **Notes** | Completion/promotion certificate |

### SacramentSection
| Property | Value |
|----------|-------|
| **File** | `src/components/common/SacramentSection.tsx` |
| **Importers** | `StudentModal` |
| **Owns state** | Props-driven; reads `useSacramentStore` |
| **Reusable** | ✅ |
| **Dead** | ❌ |
| **Notes** | Baptism/Communion/Confirmation date inputs |

---

## Desktop Components (15)

### DesktopSidebar
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopSidebar.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Props-driven; uses `useFilterStore` |
| **Dead** | ❌ |
| **Notes** | Navigation tree + class/branch filters |

### DesktopDashboard
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopDashboard.tsx` |
| **Importers** | `src/pages/DashboardPage.tsx` |
| **Owns state** | Reads stores for KPI data |
| **Dead** | ❌ |

### DesktopStudentList
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopStudentList.tsx` |
| **Importers** | `src/pages/StudentsPage.tsx` |
| **Owns state** | Reads `useStudentStore` |
| **Dead** | ❌ |
| **Notes** | TanStack Table with sort, filter, actions |

### DesktopGradeMatrix
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopGradeMatrix.tsx` |
| **Importers** | `src/pages/GradesPage.tsx` |
| **Owns state** | Reads `useGradeStore`, `useStudentStore` |
| **Dead** | ❌ |
| **Notes** | TanStack Table with inline edit + auto-save |

### DesktopAttendanceGrid
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopAttendanceGrid.tsx` |
| **Importers** | `src/pages/AttendancePage.tsx` |
| **Owns state** | Reads `useAttendanceStore`, `useStudentStore` |
| **Dead** | ❌ |
| **Notes** | Weekly calendar grid with batch save |

### DesktopReports
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopReports.tsx` |
| **Importers** | `src/pages/ReportsPage.tsx` |
| **Owns state** | Reads stores |
| **Dead** | ❌ |

### DesktopNotices
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopNotices.tsx` |
| **Importers** | `src/pages/NoticesPage.tsx` |
| **Owns state** | Reads `useNoticeStore` |
| **Dead** | ❌ |

### PromotionPanel
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/PromotionPanel.tsx` |
| **Importers** | `src/pages/StudentsPage.tsx` |
| **Owns state** | Reads `useSacramentStore` |
| **Dead** | ❌ |
| **Notes** | Tab in StudentsPage, shows promotion suggestions |

### UserManagementPage
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/UserManagementPage.tsx` |
| **Importers** | `src/pages/UsersPage.tsx` |
| **Owns state** | Reads stores, API calls |
| **Dead** | ❌ |
| **Notes** | User table, create modal, lock/unlock, reset password, class assignments |

### SystemDiagnosticsModal
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/SystemDiagnosticsModal.tsx` |
| **Importers** | HeaderBar |
| **Owns state** | Internal: system metrics |
| **Dead** | ❌ |
| **Notes** | Real-time diagnostic modal |

---

## Mobile Components (7)

### MobileBottomNav
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileBottomNav.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Dead** | ❌ |

### MobileHomeView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileHomeView.tsx` |
| **Importers** | `src/pages/DashboardPage.tsx` |
| **Dead** | ❌ |

### MobileStudentsView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileStudentsView.tsx` |
| **Importers** | `src/pages/StudentsPage.tsx` |
| **Dead** | ❌ |

### MobileGradeView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileGradeView.tsx` |
| **Importers** | `src/pages/GradesPage.tsx` |
| **Dead** | ❌ |

### MobileAttendanceView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileAttendanceView.tsx` |
| **Importers** | `src/pages/AttendancePage.tsx` |
| **Dead** | ❌ |

### MobileReportsView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileReportsView.tsx` |
| **Importers** | `src/pages/ReportsPage.tsx` |
| **Dead** | ❌ |

### MobileNoticesView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileNoticesView.tsx` |
| **Importers** | `src/pages/NoticesPage.tsx` |
| **Dead** | ❌ |

---

## Page Components (12)

| Page | Desktop Imports | Mobile Imports | Common Imports |
|------|----------------|----------------|----------------|
| LoginPage | (standalone) | (standalone) | useAuthStore |
| DashboardPage | DesktopDashboard | MobileHomeView | useUIStore |
| StudentsPage | DesktopStudentList, PromotionPanel | MobileStudentsView | useUIStore, useStudentStore, useGradeStore, useAttendanceStore, useClassStore |
| GradesPage | DesktopGradeMatrix, DesktopGradeCards, DesktopGradeComparison, DesktopDailyGradeEntry | MobileGradeView | useUIStore, useGradeStore, useStudentStore |
| AttendancePage | DesktopAttendanceGrid | MobileAttendanceView | useAttendanceStore, useStudentStore |
| ReportsPage | DesktopReports | MobileReportsView | useUIStore |
| NoticesPage | DesktopNotices | MobileNoticesView | useNoticeStore |
| UsersPage | UserManagementPage | (none) | (API-driven) |
| ClassesPage | DesktopClasses | (none) | useClassStore |
| CatechistPage | (inline) | (none) | useAuthStore, api |
| AcademicYearPage | (inline) | (none) | useAcademicYearStore |
| AuditLogPage | (inline) | (none) | api |

---

## Missing Component Entries

The following active components exist but lack full map tables above:
- **Common**: BackupRestoreModal, ExcelImportModal, ForcePasswordChangeModal, OfflineBanner
- **Desktop**: DesktopClasses, DesktopDailyGradeEntry, DesktopGradeCards, DesktopGradeComparison, GradeFormulaConfigModal

## Dead or Suspicious Components

| Component | Issue |
|-----------|-------|
| **NotificationPrompt** | ✅ Removed — file no longer exists |
| **useFilterSearchSync.ts** | Active (in router.tsx) but stored in `stores/` not `hooks/` — wrong location |
