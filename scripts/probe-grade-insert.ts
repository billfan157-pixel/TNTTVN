import { createClient } from '@libsql/client'

const dbPath = process.argv[2]
if (!dbPath) throw new Error('Usage: npx tsx scripts/probe-grade-insert.ts /tmp/db-path')
const client = createClient({ url: `file:${dbPath}` })
const args = [
  'probe-grade',
  'load-student-00000',
  '2026-2027',
  1,
  8,
  8.5,
  9,
  8,
  8.5,
  9,
  1,
  'gia-ton',
  new Date().toISOString(),
  new Date().toISOString(),
]
try {
  const result = await client.execute({
    sql: `INSERT INTO grades (id, student_id, academic_year, semester, score_oral, score_15m, score_1_period, score_midterm, score_final, score_dao_duc, version, parish_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args,
  })
  console.log(JSON.stringify({ inserted: result.rowsAffected }))
} catch (error) {
  console.error(error)
}
client.close()
