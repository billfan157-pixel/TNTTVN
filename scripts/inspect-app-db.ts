import { createClient } from '@libsql/client'
import { join } from 'path'

const dbPath = join(process.cwd(), 'server/data/parish.db')
const client = createClient({ url: `file:${dbPath}` })

console.log('Checking database at:', dbPath)

try {
  const countRes = await client.execute('SELECT count(*) as total FROM students')
  console.log('Total students:', countRes.rows[0])

  const parishesRes = await client.execute('SELECT DISTINCT parish_id, count(*) as count FROM students GROUP BY parish_id')
  console.log('Students by parish_id:', parishesRes.rows)

  const sampleRes = await client.execute('SELECT id, full_name, parish_id, status FROM students LIMIT 5')
  console.log('Sample students:', sampleRes.rows)
} catch (err) {
  console.error('Error querying DB:', err)
} finally {
  client.close()
}
