import React from 'react'
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
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={<ShieldCheck className="w-5 h-5" />}
        title="Quản Lý Hệ Thống"
        description="Năm học, lớp học và tài khoản — chỉ dành cho quản trị viên"
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-surface-border pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-colors ${
                isActive
                  ? 'text-parish-primary border-parish-primary bg-parish-primary/5'
                  : 'text-text-muted border-transparent hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'academic-years' && <AcademicYearPage />}
        {activeTab === 'classes' && <ClassesPage />}
        {activeTab === 'users-staff' && <UsersPage scope="staff" />}
        {activeTab === 'users-parents' && <UsersPage scope="phuhuynh" />}
      </div>
    </div>
  )
}

export default ManagementPage