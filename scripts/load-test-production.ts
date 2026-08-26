import { existsSync, rmSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const dbPath = `/tmp/brave-davinci-load-${process.pid}.db`
process.env.DB_PATH = dbPath
process.env.NODE_ENV = 'test'
process.env.OPS_TOKEN = 'load-test-ops-token'

const { client } = await import('../server/src/db/index.js')

const STUDENT_COUNT = 10_000
const BATCH_SIZE = 500
const CONCURRENCY = 24
const ITERATIONS_PER_WORKER = 12
const PARISH_ID = 'gia-ton'
const BRANCH_ID = 'load-branch'
const ACADEMIC_YEAR_ID = 'load-year-2026'
const CLASS_ID = 'load-class-2026'
const TEST_DATE = '2026-08-09'

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return 0
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  return sorted[index]
}

function _formatMs(value: number): string {
  return `${value.toFixed(2)} ms`
}

async function insertBatch(table: string, columns: string[], rows: Array<Array<string | number | null>>) {
  const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')
  const args = rows.flat()
  await client.execute({
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`,
    args,
  })
}

async function seedLargeDataset() {
  await client.execute({
    sql: `INSERT OR IGNORE INTO branches (id, name, scarf_color, age_min, age_max, parish_id)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [BRANCH_ID, 'Load Test Branch', '#1D4ED8', 6, 18, PARISH_ID],
  })
  await client.execute({
    sql: `INSERT OR IGNORE INTO academic_years (id, start_date, end_date, is_locked, parish_id)
          VALUES (?, ?, ?, ?, ?)`,
    args: [ACADEMIC_YEAR_ID, '2026-08-01', '2027-05-31', 0, PARISH_ID],
  })
  await client.execute({
    sql: `INSERT OR IGNORE INTO classes (id, code, name, branch_id, academic_year_id, parish_id)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [CLASS_ID, 'LOAD-2026', 'Load Test Class', BRANCH_ID, ACADEMIC_YEAR_ID, PARISH_ID],
  })

  for (let start = 0; start < STUDENT_COUNT; start += BATCH_SIZE) {
    const end = Math.min(STUDENT_COUNT, start + BATCH_SIZE)
    const students: Array<Array<string | number | null>> = []
    const grades: Array<Array<string | number | null>> = []
    const attendance: Array<Array<string | number | null>> = []

    for (let index = start; index < end; index += 1) {
      const id = `load-student-${String(index).padStart(5, '0')}`
      const createdAt = new Date(Date.UTC(2026, 7, 1, 0, 0, index % 60)).toISOString()
      students.push([
        id,
        `LOAD${String(index).padStart(6, '0')}`,
        `Thánh ${index}`,
        `Thiếu nhi Load ${index}`,
        index % 2 === 0 ? 'Nam' : 'Nữ',
        '2015-01-01',
        'Phụ huynh Load Test',
        `090000${String(index).padStart(4, '0')}`,
        'Địa chỉ load test',
        index % 2 === 0 ? 'ThieuNhi' : 'NghiaSi',
        CLASS_ID,
        'Đang học',
        PARISH_ID,
        createdAt,
        createdAt,
      ])
      grades.push([
        `load-grade-${String(index).padStart(5, '0')}`,
        id,
        ACADEMIC_YEAR_ID,
        1,
        8,
        8.5,
        9,
        8,
        8.5,
        9,
        8.75,
        PARISH_ID,
        createdAt,
        createdAt,
      ])
      attendance.push([
        `load-attendance-${String(index).padStart(5, '0')}`,
        id,
        TEST_DATE,
        'SundayMass',
        index % 10 === 0 ? 'AbsentExcused' : 'Present',
        null,
        PARISH_ID,
        createdAt,
        createdAt,
      ])
    }

    await insertBatch(
      'students',
      ['id', 'code', 'holy_name', 'full_name', 'gender', 'date_of_birth', 'parent_name', 'parent_phone', 'address', 'branch', 'class_id', 'status', 'parish_id', 'created_at', 'updated_at'],
      students,
    )
    const studentCount = await client.execute({ sql: 'SELECT count(*) AS total FROM students WHERE class_id = ?', args: [CLASS_ID] })
    if (Number(studentCount.rows[0]?.total ?? 0) < end) {
      throw new Error(`Fixture student count mismatch after batch ending at ${end}: ${JSON.stringify(studentCount.rows[0])}`)
    }
    const parentProbe = await client.execute({ sql: 'SELECT id FROM students WHERE id = ?', args: [grades[0]?.[1] ?? ''] })
    if (!parentProbe.rows.length) {
      throw new Error(`Missing student parent before grades batch: ${String(grades[0]?.[1])}`)
    }
    await insertBatch(
      'grades',
      ['id', 'student_id', 'academic_year', 'semester', 'score_oral', 'score_15m', 'score_1_period', 'score_midterm', 'score_final', 'score_dao_duc', 'version', 'parish_id', 'created_at', 'updated_at'],
      grades,
    )
    await insertBatch(
      'attendance',
      ['id', 'student_id', 'date', 'type', 'status', 'note', 'parish_id', 'created_at', 'updated_at'],
      attendance,
    )
  }
}

async function runWorkload(name: string, query: () => Promise<unknown>) {
  const durations: number[] = []
  const errors: string[] = []
  const startedAt = performance.now()

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let iteration = 0; iteration < ITERATIONS_PER_WORKER; iteration += 1) {
      const start = performance.now()
      try {
        await query()
        durations.push(performance.now() - start)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
  })
  await Promise.all(workers)

  const elapsedMs = performance.now() - startedAt
  const successful = durations.length
  const result = {
    name,
    requests: successful + errors.length,
    successful,
    errors: errors.length,
    throughputPerSecond: Number((successful / (elapsedMs / 1000)).toFixed(2)),
    p50Ms: Number(percentile(durations, 0.5).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    maxMs: Number(Math.max(...durations, 0).toFixed(2)),
    sampleError: errors[0] ?? null,
  }
  console.log(JSON.stringify(result))
  if (errors.length > 0) {
    throw new Error(`${name} had ${errors.length} failed requests`)
  }
}

try {
  console.log(JSON.stringify({ event: 'load_test_start', dbPath, studentCount: STUDENT_COUNT, concurrency: CONCURRENCY, iterationsPerWorker: ITERATIONS_PER_WORKER }))
  await seedLargeDataset()
  console.log(JSON.stringify({ event: 'dataset_ready', students: STUDENT_COUNT, grades: STUDENT_COUNT, attendance: STUDENT_COUNT }))

  await runWorkload('student_list_with_count', async () => {
    await Promise.all([
      client.execute({
        sql: `SELECT id, code, full_name, class_id, created_at
              FROM students
              WHERE parish_id = ? AND deleted_at IS NULL
              ORDER BY created_at
              LIMIT 100 OFFSET 2000`,
        args: [PARISH_ID],
      }),
      client.execute({
        sql: `SELECT count(*) AS total
              FROM students
              WHERE parish_id = ? AND deleted_at IS NULL`,
        args: [PARISH_ID],
      }),
    ])
  })

  await runWorkload('attendance_lookup_by_date_and_student', async () => {
    await client.execute({
      sql: `SELECT a.student_id, a.status
            FROM attendance a
            INNER JOIN students s ON s.id = a.student_id
            WHERE a.parish_id = ? AND a.date = ? AND a.type = ? AND s.deleted_at IS NULL
            LIMIT 10000`,
      args: [PARISH_ID, TEST_DATE, 'SundayMass'],
    })
  })

  await runWorkload('grade_lookup_by_student_batch', async () => {
    await client.execute({
      sql: `SELECT student_id, semester, score_oral, score_final, score_dao_duc
            FROM grades
            WHERE parish_id = ? AND academic_year = ? AND semester = ?
            ORDER BY student_id
            LIMIT 10000`,
      args: [PARISH_ID, '2026-2027', 1],
    })
  })

  console.log(JSON.stringify({ event: 'load_test_complete', status: 'passed' }))
} finally {
  try { client.close() } catch {}
  if (process.env.KEEP_LOAD_DB !== '1') {
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${dbPath}${suffix}`
      if (existsSync(path)) rmSync(path, { force: true })
    }
  } else {
    console.log(JSON.stringify({ event: 'load_test_db_preserved', dbPath }))
  }
}
