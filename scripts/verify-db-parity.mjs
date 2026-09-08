#!/usr/bin/env node
/**
 * verify-db-parity.mjs — READ-ONLY gate for the region-migration runbook.
 *
 * Compares TWO Turso/SQLite databases table-by-table (schema set, row counts,
 * exact content sha256) to prove a dump/restore migration lost nothing.
 * Makes ZERO writes. Credentials ONLY via environment (never commit them):
 *
 *   OLD_TURSO_URL=... OLD_TURSO_AUTH_TOKEN=... NEW_TURSO_URL=... NEW_TURSO_AUTH_TOKEN=... \
 *     node scripts/verify-db-parity.mjs [--tables users,students,grades]
 *
 * Exit 0 = identical. Exit 1 = any mismatch (details printed). Exit 2 = usage/config error.
 * Run during the write-freeze window; otherwise live tables (rate_limits, audit_logs)
 * may legitimately differ — the report shows exactly which tables/rows diverge.
 */
import { createHash } from 'node:crypto'
import { createClient } from '@libsql/client'

function need(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`[parity] Missing env ${name}`)
    process.exit(2)
  }
  return v
}

const tableFilter = process.argv
  .find((a) => a.startsWith('--tables='))
  ?.slice('--tables='.length)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const toJsonable = (v) => {
  if (v instanceof Uint8Array) return { __bytes: Buffer.from(v).toString('base64') }
  if (typeof v === 'bigint') return { __bigint: v.toString() }
  if (v instanceof ArrayBuffer) return { __bytes: Buffer.from(v).toString('base64') }
  return v
}

async function snapshot(client, label) {
  const tablesRes = await client.execute(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  let tables = tablesRes.rows.map((r) => ({ name: String(r.name), sql: String(r.sql ?? '') }))
  if (tableFilter) {
    const keep = new Set(tableFilter)
    tables = tables.filter((t) => keep.has(t.name))
  }
  const out = { label, tables: {} }
  for (const t of tables) {
    const quoted = `"${t.name.replace(/"/g, '""')}"`
    const res = await client.execute(`SELECT * FROM ${quoted}`)
    const rows = res.rows.map((row) => {
      if (Array.isArray(row)) return row.map(toJsonable)
      const obj = {}
      for (const [k, v] of Object.entries(row)) obj[k] = toJsonable(v)
      return obj
    })
    const canon = rows.map((r) => JSON.stringify(r)).sort()
    const hash = createHash('sha256').update(canon.join('\n')).digest('hex')
    out.tables[t.name] = { count: rows.length, sha256: hash, ddl: t.sql }
  }
  return out
}

async function main() {
  const oldDb = createClient({ url: need('OLD_TURSO_URL'), authToken: process.env.OLD_TURSO_AUTH_TOKEN })
  const newDb = createClient({ url: need('NEW_TURSO_URL'), authToken: process.env.NEW_TURSO_AUTH_TOKEN })
  try {
    const [a, b] = await Promise.all([snapshot(oldDb, 'OLD'), snapshot(newDb, 'NEW')])
    const totalTables = Object.keys(a.tables).length + Object.keys(b.tables).length
    if (totalTables === 0) {
      console.error('[parity] FAIL: source has no tables (wrong URL? empty DB?) — refusing vacuous PASS.')
      process.exit(2)
    }
    let failures = 0
    const names = new Set([...Object.keys(a.tables), ...Object.keys(b.tables)])
    console.log(`[parity] tables OLD=${Object.keys(a.tables).length} NEW=${Object.keys(b.tables).length}`)
    for (const name of [...names].sort()) {
      const ta = a.tables[name]
      const tb = b.tables[name]
      if (!ta || !tb) {
        failures++
        console.log(`[parity] MISMATCH table=${name} presentOld=${!!ta} presentNew=${!!tb}`)
        continue
      }
      const ddlSame = ta.ddl === tb.ddl
      const ok = ta.count === tb.count && ta.sha256 === tb.sha256 && ddlSame
      if (!ok) failures++
      console.log(
        `[parity] ${ok ? 'OK      ' : 'MISMATCH'} table=${name} count=${ta.count}/${tb.count} ` +
          `sha=${ta.sha256.slice(0, 12)}/${tb.sha256.slice(0, 12)} ddlSame=${ddlSame}`,
      )
    }
    if (failures > 0) {
      console.error(`[parity] FAIL: ${failures} table(s) diverge — DO NOT cut traffic over.`)
      process.exit(1)
    }
    console.log('[parity] PASS: databases identical.')
  } finally {
    oldDb.close()
    newDb.close()
  }
}

main().catch((err) => {
  console.error('[parity] ERROR:', err?.message || err)
  process.exit(2)
})
