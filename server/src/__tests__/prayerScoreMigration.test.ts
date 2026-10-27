import { describe, expect, it } from 'vitest'
import { createClient } from '@libsql/client'
import { MIGRATIONS } from '../db/migrations.js'
import { applyMigrations } from '../db/migrationRunner.js'

const migrations = MIGRATIONS.filter(m => m.version.startsWith('20261027-'))

async function oldDatabase() {
  const client = createClient({ url: 'file::memory:' })
  await client.executeMultiple(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE students(parish_id TEXT, id TEXT, PRIMARY KEY(parish_id,id));
    CREATE TABLE exam_sessions(parish_id TEXT, id TEXT, PRIMARY KEY(parish_id,id));
    CREATE TABLE grades(parish_id TEXT, id TEXT, score_oral REAL, PRIMARY KEY(parish_id,id));
    CREATE TABLE grade_overrides(parish_id TEXT, id TEXT, score_field TEXT);
    CREATE TABLE assessment_entries(
      id TEXT, parish_id TEXT, student_id TEXT, exam_session_id TEXT, academic_year TEXT,
      semester INTEGER, score_type TEXT CHECK(score_type IN ('oral','15m','1period','midterm','final')),
      raw_score REAL, max_score REAL, score REAL, source TEXT, entry_date TEXT, created_by TEXT, created_at TEXT,
      PRIMARY KEY(parish_id,id));
    INSERT INTO students VALUES ('p','s');
    INSERT INTO exam_sessions VALUES ('p','exam');
    INSERT INTO grades VALUES ('p','g',8);
    INSERT INTO assessment_entries VALUES ('manual','p','s',NULL,'2026-2027',1,'oral',8,10,8,'manual_entry','2026-10-20','u','2026-10-20T10:00:00Z');
    INSERT INTO assessment_entries VALUES ('machine','p','s','exam','2026-2027',1,'15m',7,10,7,'exam_finalization','2026-10-21','u','2026-10-21T10:00:00Z');
    INSERT INTO assessment_entries VALUES ('baseline','p','s',NULL,'2026-2027',1,'oral',6,10,6,'legacy_baseline',NULL,'system','2026-10-19T10:00:00Z');
  `)
  return client
}

describe('Khảo kinh schema upgrade', () => {
  it('preserves every old attempt and date, adds nullable columns, and safely replays migrations', async () => {
    const client = await oldDatabase()
    try {
      const before = (await client.execute('SELECT * FROM assessment_entries ORDER BY id')).rows
      await applyMigrations(client, migrations)
      expect((await client.execute('SELECT * FROM assessment_entries ORDER BY id')).rows).toEqual(before)
      expect((await client.execute('SELECT score_oral,score_prayer,score_prayer_source,score_prayer_updated_at FROM grades')).rows[0]).toMatchObject({ score_oral: 8, score_prayer: null, score_prayer_source: null, score_prayer_updated_at: null })
      await applyMigrations(client, migrations)
      expect((await client.execute('SELECT * FROM assessment_entries')).rows).toHaveLength(3)
      await client.execute("INSERT INTO assessment_entries VALUES ('prayer','p','s',NULL,'2026-2027',1,'prayer',9,10,9,'manual_entry','2026-10-27','u','2026-10-27T10:00:00Z')")
      await expect(client.execute("UPDATE assessment_entries SET score=11 WHERE id='prayer'")).rejects.toThrow()
      await expect(client.execute("UPDATE assessment_entries SET parish_id='other' WHERE id='prayer'")).rejects.toThrow()
      await expect(client.execute('UPDATE grades SET score_prayer=11')).rejects.toThrow(/score_prayer/)
      await client.execute("INSERT INTO grade_overrides VALUES ('p','ov','scorePrayer')")
      await expect(client.execute("UPDATE grade_overrides SET score_field='unknown'")).rejects.toThrow(/score_field invalid/)
    } finally { client.close() }
  })

  it('rolls back a failed ledger rebuild without replacing old data or recording a migration marker', async () => {
    const client = await oldDatabase()
    try {
      const before = (await client.execute('SELECT * FROM assessment_entries ORDER BY id')).rows
      const last = migrations.at(-1)!
      const broken = { ...last, sql: last.sql + '\nSELECT missing_column FROM missing_table;' }
      await expect(applyMigrations(client, [broken])).rejects.toThrow('Migration failed')
      expect((await client.execute('SELECT * FROM assessment_entries ORDER BY id')).rows).toEqual(before)
      expect((await client.execute('SELECT * FROM schema_migrations')).rows).toHaveLength(0)
    } finally { client.close() }
  })
})
