import { db } from './db/index.js'
import { users } from './db/schema.js'
import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { BCRYPT_COST } from './utils/passwordPolicy.js'

const isMainModule = process.argv[1]?.endsWith('inspect.ts') || process.argv[1]?.endsWith('inspect.js')

async function fixUsers() {
  if (!isMainModule) return

  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (!adminPassword) {
    console.log('[inspect] SEED_ADMIN_PASSWORD not set — skipping admin reset')
    return
  }
  const newHash = bcrypt.hashSync(adminPassword, BCRYPT_COST)

await db.update(users).set({
     username: 'bill',
     passwordHash: newHash,
     fullName: 'Phêrô Phan Bảo',
     role: 'admin',
     status: 'ACTIVE',
     failedAttempts: 0
   }).where(and(eq(users.id, 'USR-001'), eq(users.parishId, 'gia-ton')))

  const allUsers = await db.select().from(users)
  console.log('Updated Users in DB:', allUsers.map(u => ({ id: u.id, username: u.username, role: u.role, status: u.status })))

  const billUser = allUsers.find(u => u.username === 'bill' && u.parishId === 'gia-ton')
  if (billUser) {
    const isMatch = await bcrypt.compare(adminPassword, billUser.passwordHash)
    console.log(`Verified bcrypt compare: ${isMatch}`)
  }
}

if (isMainModule) {
  fixUsers().catch(console.error)
}
