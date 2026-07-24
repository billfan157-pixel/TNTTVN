import { db } from './db/index.js'
import { users } from './db/schema.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

async function fixUsers() {
  const newHash = bcrypt.hashSync('FFanbill123@', 10)
  
  // Update USR-001 to username bill and correct password hash
  await db.update(users).set({
    username: 'bill',
    passwordHash: newHash,
    fullName: 'Phêrô Phan Bảo',
    role: 'admin',
    status: 'ACTIVE',
    failedAttempts: 0
  }).where(eq(users.id, 'USR-001'))

  const allUsers = await db.select().from(users)
  console.log('Updated Users in DB:', allUsers.map(u => ({ id: u.id, username: u.username, role: u.role, status: u.status })))

  const billUser = allUsers.find(u => u.username === 'bill')
  if (billUser) {
    const isMatch = await bcrypt.compare('FFanbill123@', billUser.passwordHash)
    console.log(`✅ Verified bcrypt compare 'FFanbill123@': ${isMatch}`)
  }
}

fixUsers()
