import { db } from './db/index.js'
import { users } from './db/schema.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

async function inspectUsers() {
  const allUsers = await db.select().from(users)
  console.log('All Users in DB:', allUsers.map(u => ({ id: u.id, username: u.username, role: u.role, status: u.status })))

  const billUser = allUsers.find(u => u.username === 'bill')
  if (billUser) {
    const isMatch = await bcrypt.compare('FFanbill123@', billUser.passwordHash)
    console.log(`Bcrypt test 'FFanbill123@' against stored hash: ${isMatch}`)
    if (!isMatch) {
      console.log('Updating password hash for bill...')
      const newHash = bcrypt.hashSync('FFanbill123@', 10)
      await db.update(users).set({ passwordHash: newHash, failedAttempts: 0, status: 'ACTIVE' }).where(eq(users.username, 'bill'))
      console.log('Password hash updated successfully!')
    }
  } else {
    console.log('User bill not found! Creating user bill...')
    const newHash = bcrypt.hashSync('FFanbill123@', 10)
    await db.insert(users).values({
      id: 'USR-001',
      username: 'bill',
      passwordHash: newHash,
      fullName: 'Phêrô Phan Bảo',
      role: 'admin',
      parishId: 'gia-ton',
      status: 'ACTIVE',
      tokenVersion: 1,
      failedAttempts: 0,
      mustChangePassword: 0
    })
    console.log('User bill created successfully!')
  }
}

inspectUsers()
