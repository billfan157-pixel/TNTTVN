import { useState } from 'react'
import { Calendar, ShieldCheck, Users } from 'lucide-react'
import AcademicYearPage from './AcademicYearPage'
import UsersPage from './UsersPage'
import { PageHeader } from '../components/common/PageHeader'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { TabPanel, Tabs } from '../components/common/ui/SelectionControls'

type ManagementTab = 'academic-years' | 'users-parents'

const TABS: { id: ManagementTab; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'academic-years', label: 'Quản Lý Năm Học', shortLabel: 'Năm Học', icon: Calendar },
  { id: 'users-parents', label: 'Tài Khoản Phụ Huynh', shortLabel: 'Phụ Huynh', icon: Users },
]

/**
 * Trang Quản Lý giữ Năm Học và Tài Khoản Phụ Huynh — chỉ dành cho admin.
 * Lớp Học chuyển về `/students`; GLV/Nhân Sự chuyển về `/catechists`.
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
        description="Năm học và tài khoản phụ huynh — chỉ dành cho quản trị viên"
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
      <TabPanel tabsId="management-tabs" value="users-parents" activeValue={activeTab}>
        <UsersPage scope="phuhuynh" embedded />
      </TabPanel>
    </DesktopAppShell>
  )
}

export default ManagementPage
