import { randomInt } from 'node:crypto'
import { db } from '../db/index.js'
import { users, auditLogs, catechistAssignments } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { generateId } from '../utils/id.js'

export async function getUsers(parishId: string, limit: number = 50, page: number = 1) {
  const offset = (page - 1) * limit
  const userList = await db.select().from(users).where(eq(users.parishId, parishId)).limit(limit).offset(offset)
  const assignments = await db.select().from(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))

  const assignmentMap = new Map<string, string[]>()
  for (const a of assignments) {
    if (!assignmentMap.has(a.userId)) assignmentMap.set(a.userId, [])
    assignmentMap.get(a.userId)!.push(a.classId)
  }

  return userList.map((u) => {
    const userClasses = assignmentMap.get(u.id) || []
    const { passwordHash, ...safeUser } = u
    return {
      ...safeUser,
      assignedClasses: userClasses,
    }
  })
}

export async function getUserById(id: string, parishId: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.parishId, parishId)))
    .limit(1)
  if (!u) return null
  const { passwordHash, ...safeUser } = u
  return safeUser
}

export async function createUser(
  data: { username: string; fullName: string; phone?: string; role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'; assignedClasses?: string[] },
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  const id = generateId('USR')
  const tempPass = `Parish@${randomInt(1000, 9999)}`
  const passwordHash = await bcrypt.hash(tempPass, 10)
  const now = new Date().toISOString()

  await db.insert(users).values({
    id,
    username: data.username,
    passwordHash,
    fullName: data.fullName,
    role: data.role,
    status: 'FORCE_PASSWORD_CHANGE',
    tokenVersion: 1,
    failedAttempts: 0,
    mustChangePassword: 1,
    parishId,
    createdAt: now,
  })

  if (data.assignedClasses && data.assignedClasses.length > 0) {
    for (const classId of data.assignedClasses) {
      await db.insert(catechistAssignments).values({
        id: generateId('ASG'),
        userId: id,
        classId,
        roleInClass: data.role === 'chunhiem' ? 'chunhiem' : 'phuta',
        parishId,
        createdAt: now,
        updatedAt: now,
        updatedBy: adminUserId,
      })
    }
  }

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: adminUserId,
    action: 'CREATE_USER',
    entityType: 'user',
    entityId: id,
    newValue: JSON.stringify({ username: data.username, role: data.role }),
    ip,
    userAgent,
    parishId,
  })

  return { id, username: data.username, tempPassword: tempPass }
}

export async function updateUserStatus(
  id: string,
  status: 'ACTIVE' | 'LOCKED' | 'INACTIVE',
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  if (id === adminUserId && status === 'LOCKED') {
    throw new Error('Admin cannot lock their own account')
  }

  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId))).limit(1)
  if (!existing) return null

  await db.update(users).set({ status }).where(eq(users.id, id))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: adminUserId,
    action: 'UPDATE_USER_STATUS',
    entityType: 'user',
    entityId: id,
    oldValue: JSON.stringify({ status: existing.status }),
    newValue: JSON.stringify({ status }),
    ip,
    userAgent,
    parishId,
  })

  return true
}

export async function resetUserPassword(id: string, adminUserId: string, parishId: string, ip: string, userAgent: string) {
  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId))).limit(1)
  if (!existing) return null

  const tempPass = `Reset@${randomInt(1000, 9999)}`
  const passwordHash = await bcrypt.hash(tempPass, 10)

  await db.update(users).set({ passwordHash, status: 'FORCE_PASSWORD_CHANGE', failedAttempts: 0, lockedUntil: null }).where(eq(users.id, id))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: adminUserId,
    action: 'RESET_PASSWORD',
    entityType: 'user',
    entityId: id,
    ip,
    userAgent,
    parishId,
  })

  return { username: existing.username, tempPassword: tempPass }
}

export async function forceLogoutUser(id: string, adminUserId: string, parishId: string, ip: string, userAgent: string) {
  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId))).limit(1)
  if (!existing) return null

  const nextVersion = (existing.tokenVersion || 1) + 1
  await db.update(users).set({ tokenVersion: nextVersion }).where(eq(users.id, id))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: adminUserId,
    action: 'FORCE_LOGOUT',
    entityType: 'user',
    entityId: id,
    newValue: JSON.stringify({ tokenVersion: nextVersion }),
    ip,
    userAgent,
    parishId,
  })

  return true
}
