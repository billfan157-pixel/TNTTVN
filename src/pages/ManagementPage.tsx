import { useState } from 'react'
import { Calendar, BookOpen, ShieldCheck, UserCheck, Users } from 'lucide-react'
import AcademicYearPage from './AcademicYearPage'
import ClassesPage from './ClassesPage'
import UsersPage from './UsersPage'
import { PageHeader } from '../components/common/PageHeader'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { TabPanel, Tabs } from '../components/common/ui/SelectionControls'

type ManagementTab = 'academic-years' | 'classes' | 'users-staff' | 'users-parents'

const TABS: { id: ManagementTab; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'academic-years', label: 'Quản Lý Năm Học', shortLabel: 'Năm Học', icon: Calendar },
  { id: 'classes', label: 'Quản Lý Lớp Học', shortLabel: 'Lớp', icon: BookOpen },
  { id: 'users-staff', label: 'Tài Khoản GLV & Nhân Sự', shortLabel: 'GLV', icon: UserCheck },
  { id: 'users-parents', label: 'Tài Khoản Phụ Huynh', shortLabel: 'Phụ Huynh', icon: Users },
]

/**
 * Trang Quản Lý gộp các chức năng (Năm Học, Lớp Học, Tài Khoản GLV/Nhân Sự,
 * Tài Khoản Phụ Huynh) — chỉ dành cho admin. Route cha `/management` đã chặn
 * role admin; các tab bên trong không cần check lại. Tài khoản GLV và Phụ Huynh
 * tách 2 tab riêng (2026-08-22) — cùng dùng UserManagementPage với scope khác nhau.
 */
export function ManagementPage() {
  const [activeTab, setActiveTab] = useState<ManagementTab>('academic-years')
  const tabItems = TABS.map((tab) => {
    const Icon = tab.icon
    return {
      value: tab.id,
      label: (
        <>
          <span className="sm:hidden">{tab.shortLabel}</span>
          <span className="hidden sm:inline">{tab.label}</span>
        </>
      ),
      icon: <Icon aria-hidden="true" className="w-4 h-4" />,
      ariaLabel: tab.label,
    }
  })

  return (
    <DesktopAppShell width="wide">
      {/* Header */}
      <PageHeader
        icon={<ShieldCheck className="w-5 h-5" />}
        title="Quản Lý Hệ Thống"
        description="Năm học, lớp học và tài khoản — chỉ dành cho quản trị viên"
      />

      {/* Tabs */}
      <Tabs
        id="management-tabs"
        ariaLabel="Phân hệ quản lý"
        items={tabItems}
        value={activeTab}
        onValueChange={setActiveTab}
      />

      {/* Tab content */}
      <TabPanel tabsId="management-tabs" value="academic-years" activeValue={activeTab}>
        <AcademicYearPage embedded />
      </TabPanel>
      <TabPanel tabsId="management-tabs" value="classes" activeValue={activeTab}>
        <ClassesPage embedded />
      </TabPanel>
      <TabPanel tabsId="management-tabs" value="users-staff" activeValue={activeTab}>
        <UsersPage scope="staff" embedded />
      </TabPanel>
      <TabPanel tabsId="management-tabs" value="users-parents" activeValue={activeTab}>
        <UsersPage scope="phuhuynh" embedded />
      </TabPanel>
    </DesktopAppShell>
  )
}

export default ManagementPage
