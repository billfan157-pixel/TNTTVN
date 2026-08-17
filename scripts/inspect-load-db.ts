import { createClient } from '@libsql/client'

const dbPath = process.argv[2]
if (!dbPath) throw new Error('Usage: npx tsx scripts/inspect-load-db.ts /tmp/db-path')
const client = createClient({ url: `file:${dbPath}` })
for (const sql of [
  'SELECT count(*) AS total FROM students',
  "SELECT id, student_id FROM (SELECT id, student_id FROM grades LIMIT 1)",
  "SELECT id FROM students WHERE id = 'load-student-00000'",
  "SELECT id FROM students WHERE id = 'load-student-00499'",
  'PRAGMA foreign_key_check',
  'PRAGMA foreign_key_list(grades)',
  'PRAGMA table_info(grades)',
]) {
  const result = await client.execute(sql)
  console.log(JSON.stringify({ sql, rows: result.rows }))
}
client.close()
