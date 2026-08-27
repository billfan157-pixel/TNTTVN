import { useState } from 'react'
import { Calendar, BookOpen, ShieldCheck, UserCheck, Users } from 'lucide-react'
import AcademicYearPage from './AcademicYearPage'
import ClassesPage from './ClassesPage'
import UsersPage from './UsersPage'
import { PageHeader } from '../components/common/PageHeader'

type ManagementTab = 'academic-years' | 'classes' | 'users-staff' | 'users-parents'

const TABS: { id: ManagementTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'academic-years', label: 'Quản Lý Năm Học', icon: Calendar },
  { id: 'classes', label: 'Quản Lý Lớp Học', icon: BookOpen },
  { id: 'users-staff', label: 'Tài Khoản GLV & Nhân Sự', icon: UserCheck },
  { id: 'users-parents', label: 'Tài Khoản Phụ Huynh', icon: Users },
]

/**
 * Trang Quản Lý gộp các chức năng (Năm Học, Lớp Học, Tài Khoản GLV/Nhân Sự,
 * Tài Khoản Phụ Huynh) — chỉ dành cho admin. Route cha `/management` đã chặn
 * role admin; các tab bên trong không cần check lại. Tài khoản GLV và Phụ Huynh
 * tách 2 tab riêng (2026-08-22) — cùng dùng UserManagementPage với scope khác nhau.
 */
export function ManagementPage() {
  const [activeTab, setActiveTab] = useState<ManagementTab>('academic-years')

  return (
    <div className="product-view space-y-6">
      {/* Header */}
      <PageHeader
        icon={<ShieldCheck className="w-5 h-5" />}
        title="Quản Lý Hệ Thống"
        description="Năm học, lớp học và tài khoản — chỉ dành cho quản trị viên"
      />

      {/* Tabs */}
      <div className="view-tabs" role="tablist" aria-label="Phân hệ quản lý">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`view-tab ${isActive ? 'is-active' : ''}`}
              role="tab"
              aria-selected={isActive}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'academic-years' && <AcademicYearPage embedded />}
        {activeTab === 'classes' && <ClassesPage embedded />}
        {activeTab === 'users-staff' && <UsersPage scope="staff" embedded />}
        {activeTab === 'users-parents' && <UsersPage scope="phuhuynh" embedded />}
      </div>
    </div>
  )
}

export default ManagementPage
