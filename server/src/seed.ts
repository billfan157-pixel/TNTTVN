import { db } from './db/index.js'
import { users, branches, systemSettings, permissions, rolePermissions, academicYears, classes } from './db/schema.js'
import bcrypt from 'bcryptjs'
import { BCRYPT_COST } from './utils/passwordPolicy.js'

export async function seed() {
  console.log('Seeding database system configurations...')

  const now = new Date().toISOString()

// ─── Branches ───
   const branchList = [
     { id: 'ChienCon', name: 'Chiên Con', scarfColor: '#EC4899', ageMin: 4, ageMax: 6 },
     { id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9 },
     { id: 'ThieuNhi', name: 'Thiếu Nhi', scarfColor: '#2563EB', ageMin: 10, ageMax: 12 },
     { id: 'NghiaSi', name: 'Nghĩa Sĩ', scarfColor: '#9333EA', ageMin: 13, ageMax: 15 },
     { id: 'HiepSi', name: 'Hiệp Sĩ', scarfColor: '#DC2626', ageMin: 16, ageMax: 18 },
   ]
   for (const b of branchList) {
     await db.insert(branches).values({ ...b, parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'seed' }).onConflictDoNothing()
   }
   console.log(`  Branches: ${branchList.length} records`)

// ─── Academic Years ───
   const ayList = [
     { id: '2025-2026', startDate: '2025-08-01', endDate: '2026-05-31', isLocked: 0, status: 'ARCHIVED' as const, currentSemester: 2 },
     { id: '2026-2027', startDate: '2026-08-01', endDate: '2027-05-31', isLocked: 0, status: 'OPEN' as const, currentSemester: 1 },
   ]
   for (const ay of ayList) {
     await db.insert(academicYears).values({ ...ay, parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'seed' }).onConflictDoNothing()
   }
   console.log(`  Academic Years: ${ayList.length} records`)

// ─── Classes ───
   const classList = [
     { id: 'CLS-CC-1', code: 'CC1', name: 'Chiên Con 1', branchId: 'ChienCon', academicYearId: '2026-2027' },
     { id: 'CLS-AN-1', code: 'AN1', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: '2026-2027' },
     { id: 'CLS-TN-1', code: 'TN1', name: 'Thiếu Nhi 1', branchId: 'ThieuNhi', academicYearId: '2026-2027' },
     { id: 'CLS-NS-1', code: 'NS1', name: 'Nghĩa Sĩ 1', branchId: 'NghiaSi', academicYearId: '2026-2027' },
     { id: 'CLS-HS-1', code: 'HS1', name: 'Hiệp Sĩ 1', branchId: 'HiepSi', academicYearId: '2026-2027' },
   ]
   for (const c of classList) {
     await db.insert(classes).values({ ...c, parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'seed' }).onConflictDoNothing()
   }
   console.log(`  Classes: ${classList.length} records`)

// ─── Users (Admin Initial Account) ───
   const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123'
   const usersList = [
      { id: 'USR-001', username: 'bill', passwordHash: bcrypt.hashSync(adminPassword, BCRYPT_COST), fullName: 'Phêrô Phan Bảo', role: 'admin' as const, parishId: 'gia-ton', status: 'ACTIVE' as const, tokenVersion: 1, failedAttempts: 0, mustChangePassword: 0 },
   ]
   for (const u of usersList) {
     // A-NEW-38 (2026-08-11): onConflictDoNothing thay vì onConflictDoUpdate — trước đây
     // chạy lại seed trên DB đã có user sẽ GHI ĐÈ passwordHash (reset mật khẩu admin về
     // SEED_ADMIN_PASSWORD). Giờ chỉ tạo khi chưa tồn tại; không đụng mật khẩu đã đặt.
     await db.insert(users).values(u).onConflictDoNothing()
   }
   console.log(`  Users: ${usersList.length} records`)

// ─── System Settings ───
   const settingsList = [
     { key: 'min_attendance_pct', value: '70', description: 'Tỷ lệ chuyên cần tối thiểu (%)' },
     { key: 'passing_score', value: '5.0', description: 'Điểm trung bình tối thiểu' },
     { key: 'academic_year_start', value: '8', description: 'Tháng bắt đầu năm học' },
     { key: 'grade_max_score', value: '10', description: 'Thang điểm tối đa' },
     { key: 'super_admin_id', value: 'USR-001', description: 'ID của Admin trưởng hệ thống (không thể bị khóa/reset)' },
   ]
   for (const s of settingsList) {
     await db.insert(systemSettings).values({ ...s, parishId: 'gia-ton', updatedBy: 'seed', updatedAt: now }).onConflictDoNothing()
   }
   console.log(`  System Settings: ${settingsList.length} records`)

// ─── Permissions ───
   const permissionList = [
     { id: 'student.create', name: 'Thêm Thiếu Nhi', description: 'Tạo hồ sơ thiếu nhi mới' },
     { id: 'student.edit', name: 'Sửa Thiếu Nhi', description: 'Chỉnh sửa thông tin thiếu nhi' },
     { id: 'student.delete', name: 'Xóa Thiếu Nhi', description: 'Xóa hồ sơ thiếu nhi' },
     { id: 'student.view', name: 'Xem Thiếu Nhi', description: 'Xem danh sách thiếu nhi' },
     { id: 'grade.edit', name: 'Sửa Điểm', description: 'Nhập và sửa điểm số' },
     { id: 'grade.view', name: 'Xem Điểm', description: 'Xem bảng điểm' },
     { id: 'attendance.edit', name: 'Điểm Danh', description: 'Điểm danh thiếu nhi' },
     { id: 'attendance.view', name: 'Xem Điểm Danh', description: 'Xem lịch sử điểm danh' },
     { id: 'notice.create', name: 'Tạo Thông Báo', description: 'Đăng thông báo mới' },
     { id: 'notice.delete', name: 'Xóa Thông Báo', description: 'Xóa thông báo' },
     { id: 'report.view', name: 'Xem Báo Cáo', description: 'Xem báo cáo và phiếu điểm' },
     { id: 'report.export', name: 'Xuất Báo Cáo', description: 'Xuất PDF báo cáo' },
     { id: 'user.create', name: 'Tạo Người Dùng', description: 'Tạo tài khoản người dùng mới' },
     { id: 'user.edit', name: 'Sửa Người Dùng', description: 'Chỉnh sửa thông tin người dùng' },
     { id: 'user.delete', name: 'Xóa Người Dùng', description: 'Xóa tài khoản người dùng' },
     { id: 'class.create', name: 'Thêm Lớp', description: 'Tạo lớp học mới' },
     { id: 'class.edit', name: 'Sửa Lớp', description: 'Chỉnh sửa thông tin lớp học' },
     { id: 'class.delete', name: 'Xóa Lớp', description: 'Xóa lớp học' },
     { id: 'class.view', name: 'Xem Lớp', description: 'Xem danh sách lớp học' },
     { id: 'assignment.edit', name: 'Phân Công Lớp', description: 'Phân công giáo lý viên vào lớp' },
     { id: 'backup', name: 'Sao Lưu', description: 'Sao lưu và phục hồi dữ liệu' },
     { id: 'exam.create', name: 'Tạo Phiên Chấm', description: 'Tạo phiên chấm bài kiểm tra (Smart Exam Grading)' },
     { id: 'exam.scan', name: 'Quét / Nhập Điểm Thi', description: 'Quét mã QR và nhập kết quả chấm' },
     { id: 'exam.complete', name: 'Hoàn Tất Phiên Chấm', description: 'Đóng phiên chấm sau khi chấm xong' },
     { id: 'exam.delete', name: 'Xóa Phiên Chấm', description: 'Xóa phiên chấm draft (tạo nhầm / không dùng nữa)' },
   ]
   for (const p of permissionList) {
     await db.insert(permissions).values({ ...p, parishId: 'gia-ton' }).onConflictDoNothing()
   }
   console.log(`  Permissions: ${permissionList.length} records`)

// ─── Role Permissions ───
   const rolePermissionList: { role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'; permissionId: string }[] = [
     // Admin — full access
     ...permissionList.map(p => ({ role: 'admin' as const, permissionId: p.id })),
     // Chunhiem
     { role: 'chunhiem', permissionId: 'student.create' },
     { role: 'chunhiem', permissionId: 'student.edit' },
     { role: 'chunhiem', permissionId: 'student.view' },
     { role: 'chunhiem', permissionId: 'grade.edit' },
     { role: 'chunhiem', permissionId: 'grade.view' },
     { role: 'chunhiem', permissionId: 'attendance.edit' },
     { role: 'chunhiem', permissionId: 'attendance.view' },
     { role: 'chunhiem', permissionId: 'notice.create' },
     { role: 'chunhiem', permissionId: 'notice.delete' },
     { role: 'chunhiem', permissionId: 'report.view' },
     { role: 'chunhiem', permissionId: 'report.export' },
     { role: 'chunhiem', permissionId: 'class.create' },
     { role: 'chunhiem', permissionId: 'class.edit' },
     { role: 'chunhiem', permissionId: 'class.view' },
     { role: 'chunhiem', permissionId: 'assignment.edit' },
     // Chunhiem — Smart Exam Grading
     { role: 'chunhiem', permissionId: 'exam.create' },
     { role: 'chunhiem', permissionId: 'exam.scan' },
     { role: 'chunhiem', permissionId: 'exam.complete' },
     { role: 'chunhiem', permissionId: 'exam.delete' },
     // Phuta
     { role: 'phuta', permissionId: 'class.view' },
     { role: 'phuta', permissionId: 'student.view' },
     { role: 'phuta', permissionId: 'grade.edit' },
     { role: 'phuta', permissionId: 'grade.view' },
     { role: 'phuta', permissionId: 'attendance.edit' },
     { role: 'phuta', permissionId: 'attendance.view' },
     { role: 'phuta', permissionId: 'report.view' },
     { role: 'phuta', permissionId: 'report.export' },
     // Phuta — Smart Exam Grading (tạo phiên + quét/nhập kết quả + xóa phiên draft lớp mình)
     { role: 'phuta', permissionId: 'exam.create' },
     { role: 'phuta', permissionId: 'exam.scan' },
     { role: 'phuta', permissionId: 'exam.delete' },
     // Phuhuynh
     { role: 'phuhuynh', permissionId: 'student.view' },
     { role: 'phuhuynh', permissionId: 'grade.view' },
     { role: 'phuhuynh', permissionId: 'attendance.view' },
     { role: 'phuhuynh', permissionId: 'report.view' },
     { role: 'phuhuynh', permissionId: 'report.export' },
   ]
   for (const rp of rolePermissionList) {
     await db.insert(rolePermissions).values({ ...rp, parishId: 'gia-ton' }).onConflictDoNothing()
   }
   console.log(`  Role Permissions: ${rolePermissionList.length} records`)

  console.log('System seed complete!')
}

export async function seedIfEmpty() {
  try {
    const existing = await db.select().from(users).limit(1)
    if (existing.length > 0) {
      console.log('Seed skipped — database already initialized.')
      return
    }
  } catch {
    // No users table yet, proceed to seed
  }
  await seed()
}

const isMainModule = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')
if (isMainModule) {
  seed().catch(console.error)
}
