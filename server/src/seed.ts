import { db } from './db/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewStudent = InferInsertModel<typeof students>
type NewGrade = InferInsertModel<typeof grades>
type NewAttendance = InferInsertModel<typeof attendance>
type NewNotice = InferInsertModel<typeof notices>
import { users, students, grades, attendance, notices } from './db/schema.js'
import bcrypt from 'bcryptjs'

async function seed() {
  console.log('Seeding database...')

  const usersList = [
    { id: 'USR-001', username: 'admin', passwordHash: bcrypt.hashSync('admin123', 10), fullName: 'Quản Trị Viên', role: 'admin', parishId: 'thanh-gia' },
    { id: 'USR-002', username: 'chunhiem', passwordHash: bcrypt.hashSync('chunhiem123', 10), fullName: 'Trưởng Ban Giáo Lý', role: 'chunhiem', parishId: 'thanh-gia' },
  ]
  for (const u of usersList) {
    await db.insert(users).values(u).onConflictDoNothing()
  }
  console.log(`  Users: ${usersList.length} records (skipped if already exist)`)

  const now = new Date().toISOString()

  const studentList = [
    { id: 'ST-001', code: 'TN2025001', holyName: 'Maria', fullName: 'Nguyễn Ngọc Anh', gender: 'Nữ', dateOfBirth: '2017-05-14', baptismDate: '2017-07-02', parentName: 'Nguyễn Văn Bình', parentPhone: '0903123456', address: '123 Đường Giáo Xứ, Khu phố 2', branch: 'AuNhi', classId: 'AU2', status: 'Đang học', notes: 'Hát trong ca đoàn thiếu nhi' },
    { id: 'ST-002', code: 'TN2025002', holyName: 'Giuse', fullName: 'Trần Hoàng Minh', gender: 'Nam', dateOfBirth: '2017-09-20', baptismDate: '2017-11-12', parentName: 'Trần Văn Tuấn', parentPhone: '0918234567', address: '45/2 Hẻm Nhà Thờ', branch: 'AuNhi', classId: 'AU2', status: 'Đang học' },
    { id: 'ST-003', code: 'TN2025003', holyName: 'Phêrô', fullName: 'Vũ Đức Anh', gender: 'Nam', dateOfBirth: '2017-03-10', baptismDate: '2017-05-01', parentName: 'Vũ Quốc Huy', parentPhone: '0977345678', address: '78 Đường Thánh Gia', branch: 'AuNhi', classId: 'AU2', status: 'Đang học' },
    { id: 'ST-004', code: 'TN2025004', holyName: 'Têrêsa', fullName: 'Lê Thảo My', gender: 'Nữ', dateOfBirth: '2017-11-05', baptismDate: '2017-12-25', parentName: 'Lê Minh Tâm', parentPhone: '0934456789', address: '12 Nguyễn Trãi, Tổ 5', branch: 'AuNhi', classId: 'AU2', status: 'Đang học' },
    { id: 'ST-005', code: 'TN2025005', holyName: 'Anrê', fullName: 'Phạm Gia Bảo', gender: 'Nam', dateOfBirth: '2017-01-18', baptismDate: '2017-03-19', parentName: 'Phạm Đức Trọng', parentPhone: '0988567890', address: '99 Lê Lợi', branch: 'AuNhi', classId: 'AU2', status: 'Đang học' },
    { id: 'ST-006', code: 'TN2025006', holyName: 'Catarina', fullName: 'Đỗ Hoàng Kim', gender: 'Nữ', dateOfBirth: '2014-04-12', baptismDate: '2014-06-08', firstCommunionDate: '2023-06-18', parentName: 'Đỗ Văn Thành', parentPhone: '0912678901', address: '15/4 Đường Rạch Dừa', branch: 'ThieuNhi', classId: 'TN2', status: 'Đang học', notes: 'Đã xưng tội rơmêô' },
    { id: 'ST-007', code: 'TN2025007', holyName: 'Gioan B.', fullName: 'Ngô Quốc Trung', gender: 'Nam', dateOfBirth: '2014-08-30', baptismDate: '2014-10-15', firstCommunionDate: '2023-06-18', parentName: 'Ngô Tấn Phát', parentPhone: '0966789012', address: '202 Phố Công Giáo', branch: 'ThieuNhi', classId: 'TN2', status: 'Đang học', notes: 'Lễ sinh phục vụ bàn thờ' },
    { id: 'ST-008', code: 'TN2025008', holyName: 'Anna', fullName: 'Trịnh Khánh Linh', gender: 'Nữ', dateOfBirth: '2014-12-01', baptismDate: '2015-01-18', firstCommunionDate: '2023-06-18', parentName: 'Trịnh Xuân Hùng', parentPhone: '0908890123', address: '88 Nguyễn Huệ', branch: 'ThieuNhi', classId: 'TN2', status: 'Đang học' },
    { id: 'ST-009', code: 'TN2025009', holyName: 'F.X', fullName: 'Nguyễn Minh Triết', gender: 'Nam', dateOfBirth: '2014-02-15', baptismDate: '2014-04-20', firstCommunionDate: '2023-06-18', parentName: 'Nguyễn Văn Cường', parentPhone: '0933901234', address: '34 Phạm Ngũ Lão', branch: 'ThieuNhi', classId: 'TN2', status: 'Đang học' },
    { id: 'ST-010', code: 'TN2025010', holyName: 'Têrêsa Hài Đồng', fullName: 'Phan Như Quỳnh', gender: 'Nữ', dateOfBirth: '2014-07-07', baptismDate: '2014-09-10', firstCommunionDate: '2023-06-18', parentName: 'Phan Văn Hải', parentPhone: '0944012345', address: '56 Trần Hưng Đạo', branch: 'ThieuNhi', classId: 'TN2', status: 'Đang học' },
    { id: 'ST-011', code: 'TN2025011', holyName: 'Phaolô', fullName: 'Bùi Đức Thắng', gender: 'Nam', dateOfBirth: '2012-06-25', baptismDate: '2012-08-12', firstCommunionDate: '2021-06-20', confirmationDate: '2025-05-18', parentName: 'Bùi Văn Tiến', parentPhone: '0977123890', address: '11 Giáo Họ Giuse', branch: 'NghiaSi', classId: 'NS1', status: 'Đang học', notes: 'Đội trưởng Nghĩa Sĩ' },
    { id: 'ST-012', code: 'TN2025012', holyName: 'Maria Mẫu Tâm', fullName: 'Đặng Bảo Ngọc', gender: 'Nữ', dateOfBirth: '2012-10-18', baptismDate: '2012-12-08', firstCommunionDate: '2021-06-20', confirmationDate: '2025-05-18', parentName: 'Đặng Văn Nghĩa', parentPhone: '0988234901', address: '77 Đường Mới', branch: 'NghiaSi', classId: 'NS1', status: 'Đang học' },
    { id: 'ST-013', code: 'TN2025013', holyName: 'Giuse', fullName: 'Hoàng Minh Khôi', gender: 'Nam', dateOfBirth: '2020-03-12', baptismDate: '2020-05-01', parentName: 'Hoàng Văn Sơn', parentPhone: '0901345678', address: '22 Xóm Đạo', branch: 'ChienCon', classId: 'CC1', status: 'Đang học' },
    { id: 'ST-014', code: 'TN2025014', holyName: 'Maria', fullName: 'Lý Thanh Hà', gender: 'Nữ', dateOfBirth: '2020-08-22', baptismDate: '2020-10-15', parentName: 'Lý Văn Phúc', parentPhone: '0915456789', address: '44 Khu Phố 1', branch: 'ChienCon', classId: 'CC1', status: 'Đang học' },
    { id: 'ST-015', code: 'TN2025015', holyName: 'Têrêsa', fullName: 'Vũ Thị Hồng Hạnh', gender: 'Nữ', dateOfBirth: '2009-02-14', baptismDate: '2009-04-10', confirmationDate: '2023-05-21', parentName: 'Vũ Văn Long', parentPhone: '0922567890', address: '100 Đường Trung Tâm', branch: 'HiepSi', classId: 'HS1', status: 'Đang học', notes: 'Dự bị Huynh Trưởng' },
  ]

  for (const s of studentList) {
    await db.insert(students).values({ ...s as any, parishId: 'thanh-gia', createdAt: now, updatedAt: now, updatedBy: 'seed' }).onConflictDoNothing()
  }
  console.log(`  Students: ${studentList.length} records`)

  const gradeList = [
    { id: 'GR-001', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreOral: 9, score15m: 8.5, score1Period: 9, scoreMidterm: 8.5, scoreFinal: 9, comments: 'Chăm chỉ lắng nghe Giáo lý, ngoan ngoãn' },
    { id: 'GR-002', studentId: 'ST-002', academicYear: '2025 - 2026', semester: 1, scoreOral: 7, score15m: 8, score1Period: 7.5, scoreMidterm: 8, scoreFinal: 8, comments: 'Hiếu động nhưng thuộc bài tốt' },
    { id: 'GR-003', studentId: 'ST-003', academicYear: '2025 - 2026', semester: 1, scoreOral: 10, score15m: 9.5, score1Period: 9.5, scoreMidterm: 10, scoreFinal: 10, comments: 'Xuất sắc, thuộc kinh bổn rất chuẩn' },
    { id: 'GR-004', studentId: 'ST-004', academicYear: '2025 - 2026', semester: 1, scoreOral: 8, score15m: 8.5, score1Period: 8, scoreMidterm: 9, scoreFinal: 8.5, comments: 'Ngoan ngoãn, hăng hái phát biểu' },
    { id: 'GR-005', studentId: 'ST-005', academicYear: '2025 - 2026', semester: 1, scoreOral: 6.5, score15m: 7, score1Period: 7, scoreMidterm: 7.5, scoreFinal: 7, comments: 'Cần cố gắng thuộc kinh hơn' },
    { id: 'GR-006', studentId: 'ST-006', academicYear: '2025 - 2026', semester: 1, scoreOral: 9.5, score15m: 9, score1Period: 9.5, scoreMidterm: 9.5, scoreFinal: 9.5, comments: 'Học lực Xuất sắc, hỗ trợ bạn học' },
    { id: 'GR-007', studentId: 'ST-007', academicYear: '2025 - 2026', semester: 1, scoreOral: 8.5, score15m: 9, score1Period: 8, scoreMidterm: 8.5, scoreFinal: 9, comments: 'Sống đạo tốt, lễ sinh hăng hái' },
    { id: 'GR-008', studentId: 'ST-008', academicYear: '2025 - 2026', semester: 1, scoreOral: 8, score15m: 8, score1Period: 8.5, scoreMidterm: 8, scoreFinal: 8.5, comments: 'Cố gắng giữ vững phong độ' },
    { id: 'GR-009', studentId: 'ST-009', academicYear: '2025 - 2026', semester: 1, scoreOral: 7, score15m: 7.5, score1Period: 8, scoreMidterm: 7, scoreFinal: 7.5, comments: 'Tốt, tích cực tham gia sinh hoạt' },
    { id: 'GR-010', studentId: 'ST-010', academicYear: '2025 - 2026', semester: 1, scoreOral: 9, score15m: 8.5, score1Period: 9, scoreMidterm: 9, scoreFinal: 9.5, comments: 'Bài kiểm tra trình bày sạch đẹp, thuộc bài' },
    { id: 'GR-011', studentId: 'ST-011', academicYear: '2025 - 2026', semester: 1, scoreOral: 9.5, score15m: 10, score1Period: 9.5, scoreMidterm: 9.5, scoreFinal: 10, comments: 'Gương mẫu trong phân đoàn Nghĩa Sĩ' },
    { id: 'GR-012', studentId: 'ST-012', academicYear: '2025 - 2026', semester: 1, scoreOral: 9, score15m: 9, score1Period: 8.5, scoreMidterm: 9, scoreFinal: 9, comments: 'Học tốt, lễ phép' },
    { id: 'GR-013', studentId: 'ST-013', academicYear: '2025 - 2026', semester: 1, scoreOral: 9, score15m: 9, score1Period: 8.5, scoreMidterm: 9, scoreFinal: 9, comments: 'Chiên con ngoan ngoãn' },
    { id: 'GR-014', studentId: 'ST-014', academicYear: '2025 - 2026', semester: 1, scoreOral: 8.5, score15m: 9, score1Period: 9, scoreMidterm: 8.5, scoreFinal: 9, comments: 'Hăng hái hát múa' },
    { id: 'GR-015', studentId: 'ST-015', academicYear: '2025 - 2026', semester: 1, scoreOral: 10, score15m: 9.5, score1Period: 10, scoreMidterm: 9.5, scoreFinal: 10, comments: 'Xuất sắc, hỗ trợ Huynh Trưởng giảng dạy' },
    { id: 'GR-016', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 2, scoreOral: 9, score15m: 9, score1Period: 8.5, scoreMidterm: 9, comments: 'Đang phấn đấu học kỳ 2' },
    { id: 'GR-017', studentId: 'ST-003', academicYear: '2025 - 2026', semester: 2, scoreOral: 10, score15m: 10, score1Period: 10, scoreMidterm: 9.5, comments: 'Giữ vững vị trí dẫn đầu' },
    { id: 'GR-018', studentId: 'ST-006', academicYear: '2025 - 2026', semester: 2, scoreOral: 10, score15m: 9.5, score1Period: 9.5, scoreMidterm: 10, comments: 'Tích cực sinh hoạt phong trào' },
  ]

  for (const g of gradeList) {
    await db.insert(grades).values({ ...g as any, parishId: 'thanh-gia', createdAt: now, updatedAt: now, updatedBy: 'seed' }).onConflictDoNothing()
  }
  console.log(`  Grades: ${gradeList.length} records`)

  const attendanceList: any[] = [
    { id: 'AT-001', studentId: 'ST-001', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-002', studentId: 'ST-002', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-003', studentId: 'ST-003', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-004', studentId: 'ST-004', date: '2026-07-19', type: 'SundayMass', status: 'AbsentExcused', note: 'Về quê thăm ông bà' },
    { id: 'AT-005', studentId: 'ST-005', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-006', studentId: 'ST-006', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-007', studentId: 'ST-007', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-008', studentId: 'ST-008', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-009', studentId: 'ST-009', date: '2026-07-19', type: 'SundayMass', status: 'AbsentUnexcused' },
    { id: 'AT-010', studentId: 'ST-010', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-011', studentId: 'ST-011', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-012', studentId: 'ST-012', date: '2026-07-19', type: 'SundayMass', status: 'Present' },
    { id: 'AT-101', studentId: 'ST-001', date: '2026-07-19', type: 'CatechismClass', status: 'Present' },
    { id: 'AT-102', studentId: 'ST-002', date: '2026-07-19', type: 'CatechismClass', status: 'Present' },
    { id: 'AT-103', studentId: 'ST-003', date: '2026-07-19', type: 'CatechismClass', status: 'Present' },
    { id: 'AT-104', studentId: 'ST-004', date: '2026-07-19', type: 'CatechismClass', status: 'AbsentExcused', note: 'Nghỉ phép gia đình' },
    { id: 'AT-105', studentId: 'ST-005', date: '2026-07-19', type: 'CatechismClass', status: 'Present' },
    { id: 'AT-106', studentId: 'ST-006', date: '2026-07-19', type: 'CatechismClass', status: 'Present' },
    { id: 'AT-107', studentId: 'ST-007', date: '2026-07-19', type: 'CatechismClass', status: 'Present' },
    { id: 'AT-108', studentId: 'ST-008', date: '2026-07-19', type: 'CatechismClass', status: 'Present' },
    { id: 'AT-201', studentId: 'ST-001', date: '2026-07-12', type: 'SundayMass', status: 'Present' },
    { id: 'AT-202', studentId: 'ST-002', date: '2026-07-12', type: 'SundayMass', status: 'Present' },
    { id: 'AT-203', studentId: 'ST-003', date: '2026-07-12', type: 'SundayMass', status: 'Present' },
    { id: 'AT-204', studentId: 'ST-004', date: '2026-07-12', type: 'SundayMass', status: 'Present' },
    { id: 'AT-205', studentId: 'ST-005', date: '2026-07-12', type: 'SundayMass', status: 'Present' },
    { id: 'AT-206', studentId: 'ST-006', date: '2026-07-12', type: 'SundayMass', status: 'Present' },
  ]

  for (const a of attendanceList) {
    await db.insert(attendance).values({ ...a as any, parishId: 'thanh-gia', createdAt: now, updatedAt: now, updatedBy: 'seed' }).onConflictDoNothing()
  }
  console.log(`  Attendance: ${attendanceList.length} records`)

  const noticeList: any[] = [
    { id: 'NC-001', title: 'Thông báo Lịch Thi Học Kỳ II Niên Học 2025-2026', content: 'Ban Giáo Lý Giáo Xứ xin thông báo đến Quý Phụ huynh và các em Thiếu nhi: Kỳ thi Giáo lý Học kỳ II sẽ chính thức diễn ra vào Chủ Nhật ngày 09/08/2026 sau Thánh Lễ Thiếu nhi. Đề nghị các em ôn bài đầy đủ.', date: '2026-07-20', author: 'Trưởng Ban Giáo Lý', priority: 'urgent', targetBranch: 'All' },
    { id: 'NC-002', title: 'Hội Thao & Trại Hè Thiếu Nhi Thánh Thể Giáo Xứ', content: 'Chương trình Trại hè TNTT chủ đề "Bánh Thánh Thể - Nguồn Sống" sẽ diễn ra từ 15/08 đến 16/08/2026. Đăng ký tham gia tại Văn phòng Xứ đoàn trước ngày 05/08.', date: '2026-07-18', author: 'Tuyên Úy Xứ Đoàn', priority: 'important', targetBranch: 'All' },
    { id: 'NC-003', title: 'Nhắc nhở nộp danh sách Lễ Sinh phụ vụ Lễ Quan Thầy', content: 'Các Huynh Trưởng Ngành Thiếu và Ngành Nghĩa nộp lại danh sách thiếu nhi tham gia đội Lễ sinh phục vụ Lễ Quan Thầy Giáo xứ trước thứ Bảy tuần này.', date: '2026-07-15', author: 'Xứ Đoàn Trưởng', priority: 'normal', targetBranch: 'ThieuNhi' },
  ]

  for (const n of noticeList) {
    await db.insert(notices).values({ ...n as any, parishId: 'thanh-gia', createdAt: now, updatedAt: now, updatedBy: 'seed' }).onConflictDoNothing()
  }
  console.log(`  Notices: ${noticeList.length} records`)

  console.log('Seed complete!')
}

seed().catch(console.error)
