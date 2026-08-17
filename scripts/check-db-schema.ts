import { createClient } from '@libsql/client'
import { join } from 'path'

const dbPath = join(process.cwd(), 'server/data/parish.db')
const client = createClient({ url: `file:${dbPath}` })

const tables = ['users', 'branches', 'academic_years', 'classes', 'students', 'grades', 'attendance']
for (const t of tables) {
  try {
    const res = await client.execute(`SELECT count(*) as count FROM ${t}`)
    console.log(`Table ${t}: ${res.rows[0]?.count} rows`)
  } catch (err) {
    console.error(`Table ${t} error:`, err)
  }
}
client.close()
