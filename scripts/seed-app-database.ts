import { createClient } from '@libsql/client'
import { join } from 'path'
import bcrypt from 'bcryptjs'

const dbPath = join(process.cwd(), 'server/data/parish.db')
const client = createClient({ url: `file:${dbPath}` })

console.log('Seeding runtime database at:', dbPath)

async function seed() {
  const now = new Date().toISOString()
  const parishId = 'gia-ton'

  // 1. Branches
  const branches = [
    { id: 'ChienCon', name: 'Chiên Con', scarfColor: '#EC4899', ageMin: 4, ageMax: 6 },
    { id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9 },
    { id: 'ThieuNhi', name: 'Thiếu Nhi', scarfColor: '#2563EB', ageMin: 10, ageMax: 12 },
    { id: 'NghiaSi', name: 'Nghĩa Sĩ', scarfColor: '#9333EA', ageMin: 13, ageMax: 15 },
    { id: 'HiepSi', name: 'Hiệp Sĩ', scarfColor: '#DC2626', ageMin: 16, ageMax: 18 },
  ]
  for (const b of branches) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO branches (id, name, scarf_color, age_min, age_max, parish_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [b.id, b.name, b.scarfColor, b.ageMin, b.ageMax, parishId, now, now],
    })
  }

  // 2. Academic Years
  const academicYears = [
    { id: '2025-2026', startDate: '2025-08-01', endDate: '2026-05-31', isLocked: 0, status: 'ARCHIVED', semester: 2 },
    { id: '2026-2027', startDate: '2026-08-01', endDate: '2027-05-31', isLocked: 0, status: 'OPEN', semester: 1 },
  ]
  for (const ay of academicYears) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO academic_years (id, start_date, end_date, is_locked, status, current_semester, parish_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [ay.id, ay.startDate, ay.endDate, ay.isLocked, ay.status, ay.semester, parishId, now, now],
    })
  }

  // 3. Classes
  const classes = [
    { id: 'CLS-CC-1', code: 'CC1', name: 'Chiên Con 1', branchId: 'ChienCon', academicYearId: '2026-2027' },
    { id: 'CLS-AN-1', code: 'AN1', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: '2026-2027' },
    { id: 'CLS-TN-1', code: 'TN1', name: 'Thiếu Nhi 1', branchId: 'ThieuNhi', academicYearId: '2026-2027' },
    { id: 'CLS-NS-1', code: 'NS1', name: 'Nghĩa Sĩ 1', branchId: 'NghiaSi', academicYearId: '2026-2027' },
    { id: 'CLS-HS-1', code: 'HS1', name: 'Hiệp Sĩ 1', branchId: 'HiepSi', academicYearId: '2026-2027' },
  ]
  for (const c of classes) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO classes (id, code, name, branch_id, academic_year_id, parish_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [c.id, c.code, c.name, c.branchId, c.academicYearId, parishId, now, now],
    })
  }

  // 4. Admin User
  const passwordHash = bcrypt.hashSync('admin123', 10)
  await client.execute({
    sql: `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, status, parish_id, created_at) VALUES ('USR-001', 'bill', ?, 'Phêrô Phan Bảo', 'admin', 'ACTIVE', ?, ?)`,
    args: [passwordHash, parishId, now],
  })

  // 5. Students (Generate 100 sample students distributed across classes)
  console.log('Generating sample students...')
  const holyNames = ['Gioan', 'Maria', 'Phêrô', 'Teresa', 'Giuse', 'Anna', 'Dominico', 'Agatha']
  const firstNames = ['An', 'Bình', 'Cường', 'Dũng', 'Giang', 'Hà', 'Hùng', 'Khang', 'Linh', 'Minh', 'Nam', 'Phúc', 'Quân', 'Sơn', 'Thảo', 'Trang', 'Tuấn', 'Vân']
  const lastNames = ['Nguyễn Văn', 'Trần Thị', 'Lê Văn', 'Phạm Thị', 'Hoàng Văn', 'Vũ Thị', 'Đặng Văn', 'Bùi Thị']

  const classIds = classes.map(c => c.id)
  const branchesMap: Record<string, 'ChienCon' | 'AuNhi' | 'ThieuNhi' | 'NghiaSi' | 'HiepSi'> = {
    'CLS-CC-1': 'ChienCon',
    'CLS-AN-1': 'AuNhi',
    'CLS-TN-1': 'ThieuNhi',
    'CLS-NS-1': 'NghiaSi',
    'CLS-HS-1': 'HiepSi',
  }

  for (let i = 1; i <= 150; i++) {
    const studentId = `STU-${String(i).padStart(4, '0')}`
    const code = `TNTT-${String(i).padStart(4, '0')}`
    const holy = holyNames[i % holyNames.length]
    const full = `${lastNames[i % lastNames.length]} ${firstNames[i % firstNames.length]}`
    const gender = i % 2 === 0 ? 'Nam' : 'Nữ'
    const classId = classIds[i % classIds.length]
    const branch = branchesMap[classId]

    await client.execute({
      sql: `INSERT OR IGNORE INTO students (id, code, holy_name, full_name, gender, date_of_birth, parent_name, parent_phone, address, branch, class_id, status, parish_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '2014-05-12', 'Phụ huynh học sinh', '0901234567', 'Giáo xứ Gia Ton', ?, ?, 'Đang học', ?, ?, ?)`,
      args: [studentId, code, holy, full, gender, branch, classId, parishId, now, now],
    })

    // Add grade
    await client.execute({
      sql: `INSERT OR IGNORE INTO grades (id, student_id, academic_year, semester, score_oral, score_15m, score_1_period, score_midterm, score_final, score_dao_duc, version, parish_id, created_at, updated_at) VALUES (?, ?, '2026-2027', 1, 8.0, 8.5, 9.0, 8.0, 8.5, 9.0, 1, ?, ?, ?)`,
      args: [`GRD-${String(i).padStart(4, '0')}`, studentId, parishId, now, now],
    })
  }

  console.log('Successfully seeded runtime database with 150 students, classes, branches, and academic years!')
}

await seed()
client.close()
