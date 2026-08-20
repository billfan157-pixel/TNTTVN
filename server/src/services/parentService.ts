import { db } from '../db/index.js'
import { users, students, classes } from '../db/schema.js'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { phoneMatchVariants } from '../utils/phone.js'

export interface ParentChildDTO {
  id: string
  code: string
  holyName: string
  fullName: string
  gender: string
  dateOfBirth: string
  branch: string
  status: string
  classId: string
  className: string
  classCode: string
}

/**
 * Danh sách con của phụ huynh: khớp users.phone (đã chuẩn hóa) với students.parentPhone.
 * Chỉ trả học sinh còn học (chưa soft-delete) trong cùng giáo xứ. ADR: khớp phone là
 * intent sẵn có của CanAccessStudentSpecification — không cần bảng liên kết riêng.
 *
 * Tenant invariant: classes dùng composite identity (parishId, id), nên JOIN phải giữ
 * cả hai thành phần. JOIN chỉ theo classId có thể match lớp cùng id của giáo xứ khác.
 */
export async function getMyChildren(userId: string, parishId: string): Promise<ParentChildDTO[]> {
  const [user] = await db
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.parishId, parishId)))
    .limit(1)

  if (!user || !user.phone) return []

  const variants = phoneMatchVariants(user.phone)
  if (variants.length === 0) return []

  const rows = await db
    .select({
      id: students.id,
      code: students.code,
      holyName: students.holyName,
      fullName: students.fullName,
      gender: students.gender,
      dateOfBirth: students.dateOfBirth,
      branch: students.branch,
      status: students.status,
      classId: students.classId,
      className: classes.name,
      classCode: classes.code,
    })
    .from(students)
    .innerJoin(classes, and(
      eq(classes.id, students.classId),
      eq(classes.parishId, students.parishId),
    ))
    .where(and(
      eq(students.parishId, parishId),
      isNull(students.deletedAt),
      inArray(students.parentPhone, variants),
    ))
    .orderBy(students.fullName)

  return rows
}
