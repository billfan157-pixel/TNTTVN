import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, Award, Landmark, Search } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { UserManagementPage } from '../components/desktop/UserManagementPage'
import { NoResultState, SkeletonCardGrid } from '../components/common/StateFeedback'
import { Button } from '../components/common/ui'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

interface CatechistDirectoryEntry {
  id: string
  fullName: string
  holyName?: string | null
  role: 'admin' | 'chunhiem' | 'phuta'
  assignedClasses: string[]
  assignedClassNames: string[]
}

function ParishProfileAction() {
  const navigate = useNavigate()
  return (
    <Button
      variant="secondary"
      size="sm"
      leadingIcon={<Landmark className="h-4 w-4" />}
      onClick={() => navigate({ to: '/parish-profile' })}
    >
      Hồ Sơ Xứ Đoàn
    </Button>
  )
}

export function CatechistPage() {
  const role = useAuthStore(state => state.user?.role)
  const [users, setUsers] = useState<CatechistDirectoryEntry[]>([])
  const [loading, setLoading] = useState(role !== 'admin')
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  useEffect(() => {
    if (role === 'admin') return
    let cancelled = false
    setLoading(true)
    setError(null)
    api.getCatechists()
      .then(userList => {
        if (cancelled) return
        setUsers(Array.isArray(userList) ? userList : [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Không thể tải danh bạ giáo lý viên')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [role])

  if (role === 'admin') {
    return <UserManagementPage scope="staff" headerActions={<ParishProfileAction />} />
  }

  const normalizedSearch = search.trim().toLocaleLowerCase('vi')
  const filteredUsers = users.filter(user => {
    const matchesSearch = !normalizedSearch
      || user.fullName.toLocaleLowerCase('vi').includes(normalizedSearch)
      || (user.holyName || '').toLocaleLowerCase('vi').includes(normalizedSearch)
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  const roleLabel = (entryRole: CatechistDirectoryEntry['role']) => {
    if (entryRole === 'admin') return 'Ban Quản Trị'
    if (entryRole === 'chunhiem') return 'GLV Chủ Nhiệm'
    return 'GLV Phụ Tá'
  }

  return (
    <DesktopAppShell width="wide">
      <PageHeader
        icon={<Award className="h-5 w-5" />}
        title="Danh Bạ Giáo Lý Viên & Nhân Sự"
        description={`${filteredUsers.length} nhân sự trong Xứ Đoàn · Chế độ chỉ xem`}
        actions={<ParishProfileAction />}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="view-toolbar">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-placeholder" />
          <input
            type="text"
            placeholder="Tìm theo Tên Thánh hoặc họ tên..."
            value={search}
            onChange={event => setSearch(event.target.value)}
            className="form-input-sm w-full pl-10"
          />
        </div>
        <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="form-select min-h-[40px] w-full text-sm font-medium sm:w-auto">
          <option value="all">Tất cả vai trò</option>
          <option value="chunhiem">GLV Chủ Nhiệm</option>
          <option value="phuta">GLV Phụ Tá</option>
          <option value="admin">Ban Quản Trị</option>
        </select>
      </div>

      {loading ? (
        <SkeletonCardGrid count={6} />
      ) : filteredUsers.length === 0 ? (
        <NoResultState title="Không có giáo lý viên phù hợp" description="Thử đổi vai trò hoặc từ khóa tìm kiếm." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map(user => {
            const assignedClassNames = user.assignedClassNames.join(', ') || 'Chưa phân công'
            return (
              <article key={user.id} className="entity-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {user.holyName && <p className="text-xs font-bold text-amber-950 dark:text-amber-400">{user.holyName}</p>}
                    <h2 className="truncate text-base font-bold text-text-main">{user.fullName}</h2>
                  </div>
                  <span className="badge badge-info shrink-0">{roleLabel(user.role)}</span>
                </div>
                <div className="mt-3 rounded-xl border border-surface-border bg-surface-hover p-3">
                  <span className="text-[11px] font-semibold uppercase text-text-muted">Lớp phụ trách</span>
                  <p className="mt-1 text-xs font-medium text-text-main">{assignedClassNames}</p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </DesktopAppShell>
  )
}

export default CatechistPage
