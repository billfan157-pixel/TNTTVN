# Component Map

---

## Common Components (10)

### HeaderBar
| Property | Value |
|----------|-------|
| **File** | `src/components/common/HeaderBar.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | `useThemeStore` (theme toggle), `useStudentStore` (reset button) |
| **Reusable** | ✅ Rendered once at app root |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Renders sync status, user info (future), theme toggle, reset button |

### ErrorBoundary
| Property | Value |
|----------|-------|
| **File** | `src/components/common/ErrorBoundary.tsx` |
| **Importers** | `src/main.tsx` |
| **Owns state** | Internal: `hasError`, `error` |
| **Reusable** | ✅ Can wrap any subtree |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Class component, integrates with Sentry |

### ConfirmDialog
| Property | Value |
|----------|-------|
| **File** | `src/components/common/ConfirmDialog.tsx` |
| **Importers** | Unknown (check: likely used in DesktopStudentList) |
| **Owns state** | Props-driven (isOpen, onConfirm, onCancel) |
| **Reusable** | ✅ Generic confirmation modal |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | Possibly unused — verify actual callers |
| **Notes** | Uses focus trap for a11y |

### NotificationPrompt
| Property | Value |
|----------|-------|
| **File** | `src/components/common/NotificationPrompt.tsx` |
| **Importers** | Unknown |
| **Owns state** | Props-driven |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ⚠️ Verify — may be unused in current router |
| **Notes** | Web push permission request |

### InstallPrompt
| Property | Value |
|----------|-------|
| **File** | `src/components/common/InstallPrompt.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Internal: PWA install state |
| **Reusable** | ✅ Rendered once |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Floating PWA install button |

### StudentModal
| Property | Value |
|----------|-------|
| **File** | `src/components/common/StudentModal.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Props-driven; contains `SacramentSection` |
| **Reusable** | ✅ Add/Edit student form |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Renders in root layout, controlled by `useUIStore` |

### StudentReportModal
| Property | Value |
|----------|-------|
| **File** | `src/components/common/StudentReportModal.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Props-driven |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |

### PhotoCard
| Property | Value |
|----------|-------|
| **File** | `src/components/common/PhotoCard.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Props-driven |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Printable "thẻ thiếu nhi" |

### Certificate
| Property | Value |
|----------|-------|
| **File** | `src/components/common/Certificate.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Props-driven |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Completion/promotion certificate |

### SacramentSection
| Property | Value |
|----------|-------|
| **File** | `src/components/common/SacramentSection.tsx` |
| **Importers** | `StudentModal` |
| **Owns state** | Props-driven; reads `useSacramentStore` |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Baptism/Communion/Confirmation date inputs |

---

## Desktop Components (8)

### DesktopSidebar
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopSidebar.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Props-driven; uses `useFilterStore` |
| **Reusable** | ✅ Rendered once in desktop layout |
| **Desktop only** | ✅ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Navigation tree + class/branch filters |

### DesktopDashboard
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopDashboard.tsx` |
| **Importers** | `src/pages/DashboardPage.tsx` |
| **Owns state** | Reads stores for KPI data |
| **Reusable** | ✅ |
| **Desktop only** | ✅ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |

### DesktopStudentList
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopStudentList.tsx` |
| **Importers** | `src/pages/StudentsPage.tsx` |
| **Owns state** | Reads `useStudentStore` |
| **Reusable** | ✅ |
| **Desktop only** | ✅ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | TanStack Table with sort, filter, actions |

### DesktopGradeMatrix
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopGradeMatrix.tsx` |
| **Importers** | `src/pages/GradesPage.tsx` |
| **Owns state** | Reads `useGradeStore`, `useStudentStore` |
| **Reusable** | ✅ |
| **Desktop only** | ✅ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | TanStack Table with inline edit + auto-save |

### DesktopAttendanceGrid
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopAttendanceGrid.tsx` |
| **Importers** | `src/pages/AttendancePage.tsx` |
| **Owns state** | Reads `useAttendanceStore`, `useStudentStore` |
| **Reusable** | ✅ |
| **Desktop only** | ✅ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Weekly calendar grid with batch save |

### DesktopReports
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopReports.tsx` |
| **Importers** | `src/pages/ReportsPage.tsx` |
| **Owns state** | Reads stores |
| **Reusable** | ✅ |
| **Desktop only** | ✅ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |

### DesktopNotices
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/DesktopNotices.tsx` |
| **Importers** | `src/pages/NoticesPage.tsx` |
| **Owns state** | Reads `useNoticeStore` |
| **Reusable** | ✅ |
| **Desktop only** | ✅ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |

### PromotionPanel
| Property | Value |
|----------|-------|
| **File** | `src/components/desktop/PromotionPanel.tsx` |
| **Importers** | `src/pages/StudentsPage.tsx` |
| **Owns state** | Reads `useSacramentStore` |
| **Reusable** | ✅ |
| **Desktop only** | ✅ |
| **Mobile only** | ❌ |
| **Dead** | ❌ |
| **Notes** | Tab in StudentsPage, shows promotion suggestions |

---

## Mobile Components (7)

### MobileBottomNav
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileBottomNav.tsx` |
| **Importers** | `src/router.tsx` (RootLayout) |
| **Owns state** | Props-driven (activeTab, setActiveTab) |
| **Reusable** | ✅ Rendered once |
| **Desktop only** | ❌ |
| **Mobile only** | ✅ |
| **Dead** | ❌ |

### MobileHomeView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileHomeView.tsx` |
| **Importers** | `src/pages/DashboardPage.tsx` |
| **Owns state** | Props-driven |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ✅ |
| **Dead** | ❌ |

### MobileStudentsView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileStudentsView.tsx` |
| **Importers** | `src/pages/StudentsPage.tsx` |
| **Owns state** | Props-driven; reads stores |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ✅ |
| **Dead** | ❌ |

### MobileGradeView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileGradeView.tsx` |
| **Importers** | `src/pages/GradesPage.tsx` |
| **Owns state** | Props-driven; reads stores |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ✅ |
| **Dead** | ❌ |

### MobileAttendanceView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileAttendanceView.tsx` |
| **Importers** | `src/pages/AttendancePage.tsx` |
| **Owns state** | Props-driven; reads stores |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ✅ |
| **Dead** | ❌ |

### MobileReportsView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileReportsView.tsx` |
| **Importers** | `src/pages/ReportsPage.tsx` |
| **Owns state** | Props-driven |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ✅ |
| **Dead** | ❌ |

### MobileNoticesView
| Property | Value |
|----------|-------|
| **File** | `src/components/mobile/MobileNoticesView.tsx` |
| **Importers** | `src/pages/NoticesPage.tsx` |
| **Owns state** | Props-driven; reads stores |
| **Reusable** | ✅ |
| **Desktop only** | ❌ |
| **Mobile only** | ✅ |
| **Dead** | ❌ |

---

## Page Components (6)

| Page | Desktop Imports | Mobile Imports | Common Imports | State Dependencies |
|------|----------------|----------------|----------------|-------------------|
| DashboardPage | DesktopDashboard | MobileHomeView | useUIStore | useStudentStore, useGradeStore, useAttendanceStore |
| StudentsPage | DesktopStudentList, PromotionPanel | MobileStudentsView | useUIStore, useStudentStore, useGradeStore, useAttendanceStore | Same |
| GradesPage | DesktopGradeMatrix | MobileGradeView | useUIStore | useGradeStore, useStudentStore |
| AttendancePage | DesktopAttendanceGrid | MobileAttendanceView | (none) | useAttendanceStore, useStudentStore |
| ReportsPage | DesktopReports | MobileReportsView | useUIStore | All stores |
| NoticesPage | DesktopNotices | MobileNoticesView | (none) | useNoticeStore |

---

## Dead or Suspicious Components

| Component | Issue |
|-----------|-------|
| **ConfirmDialog** | ⚠️ Verify: may be unused after router refactor |
| **NotificationPrompt** | ⚠️ May be dead — check if rendered anywhere |
| **useFilterSearchSync.ts** | Active (in router.tsx) but stored in `stores/` not `hooks/` — wrong location |
