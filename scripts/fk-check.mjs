import { createClient } from '@libsql/client'
const c = createClient({ url: 'file:server/data/parish.db' })
// Heal nốt: khôi phục ngành Chiên Con cho gia-ton theo đúng giá trị seed chuẩn
// (global-setup.ts). Additive + idempotent.
await c.execute(`
  INSERT INTO branches (id, name, scarf_color, age_min, age_max, parish_id, created_at, updated_at)
  VALUES ('ChienCon', 'Chiên Con', 'Xanh Dương', 6, 8, 'gia-ton',
          strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT DO NOTHING
`)
const after = await c.execute('PRAGMA foreign_key_check')
console.log('FK violations remaining:', after.rows.length)
process.exit(0)
