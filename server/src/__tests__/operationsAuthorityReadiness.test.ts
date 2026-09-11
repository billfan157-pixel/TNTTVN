// @vitest-environment node
import { createClient, type Row } from '@libsql/client'
import { describe, expect, it, vi } from 'vitest'
import { analyzeOperationsAuthoritySnapshot, auditOperationsAuthorityReadiness } from '../db/operationsAuthorityReadiness.js'

const row = (value: Record<string, unknown>) => value as Row

describe('Operations organizational authority readiness', () => {
  it('does not certify an empty inventory as deployment-ready', () => {
    const manifest = analyzeOperationsAuthoritySnapshot({ parishes: [], units: [], terms: [] }, { today: '2026-09-10' })
    expect(manifest).toMatchObject({
      status: 'operations_authority_preflight_requires_review',
      evaluatedOn: '2026-09-10', parishCount: 0,
      requiresOperatorReview: true, findingCount: 1,
      findings: { inventory: [{ reason: 'NO_PARISH_DATA' }] },
    })
  })

  it('audits legacy-only parishes and refuses a cross-parish account link without changing database rows', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      // Minimal legacy schema deliberately permits corrupt references so the
      // audit must establish tenant ownership itself, independently of FKs.
      await client.executeMultiple(`
        CREATE TABLE parish_profiles (parish_id TEXT);
        CREATE TABLE users (parish_id TEXT, id TEXT, role TEXT, status TEXT, deleted_at TEXT);
        CREATE TABLE parish_organization_units (parish_id TEXT, id TEXT, parent_id TEXT, unit_type TEXT, is_active INTEGER, deleted_at TEXT);
        CREATE TABLE parish_people (parish_id TEXT, id TEXT, linked_user_id TEXT, service_status TEXT, deleted_at TEXT);
        CREATE TABLE parish_service_terms (parish_id TEXT, id TEXT, person_id TEXT, unit_id TEXT, position_code TEXT, start_date TEXT, end_date TEXT, deleted_at TEXT);
        INSERT INTO users VALUES ('foreign','same-user','phuta','ACTIVE',NULL);
        INSERT INTO parish_people VALUES ('local','person','same-user','ACTIVE',NULL);
        INSERT INTO parish_people VALUES ('people-only','old-person',NULL,'FORMER',NULL);
        INSERT INTO parish_organization_units VALUES ('local','board',NULL,'BOARD',1,NULL);
        INSERT INTO parish_service_terms VALUES ('local','leader','person','board','PARISH_LEADER','2026-01-01',NULL,NULL);
        INSERT INTO parish_service_terms VALUES ('terms-only','orphan','missing',NULL,'PARISH_LEADER','2026-01-01',NULL,NULL);
      `)
      const tables = ['parish_profiles', 'users', 'parish_organization_units', 'parish_people', 'parish_service_terms']
      const readRows = () => Promise.all(tables.map(async table => (await client.execute(`SELECT * FROM ${table} ORDER BY rowid`)).rows))
      const before = await readRows()
      const transaction = client.transaction.bind(client)
      const commitChecked = vi.fn()
      vi.spyOn(client, 'transaction').mockImplementation((async (...args: any[]) => {
        const tx = await (transaction as any)(...args)
        const commit = tx.commit.bind(tx)
        vi.spyOn(tx, 'commit').mockImplementation(async () => {
          const after = await Promise.all(tables.map(async table => (await tx.execute(`SELECT * FROM ${table} ORDER BY rowid`)).rows))
          expect(after).toEqual(before)
          commitChecked()
          await commit()
        })
        return tx
      }) as any)
      const manifest = await auditOperationsAuthorityReadiness(client, { today: '2026-09-10', includeParishId: true })

      expect(manifest.findings.leaderIdentity).toEqual(expect.arrayContaining([
        expect.objectContaining({ parishRef: 'local', reasons: expect.arrayContaining(['STAFF_ROLE_INVALID', 'STAFF_ACCOUNT_NOT_ACTIVE']) }),
      ]))
      expect(manifest.findings.boardRootCardinality.map(item => item.parishRef)).toEqual(expect.arrayContaining(['people-only', 'terms-only']))
      expect(manifest.findings.parishLeaderCurrentCardinality).toEqual(expect.arrayContaining([
        expect.objectContaining({ parishRef: 'local', activeLeaders: 0 }),
        expect.objectContaining({ parishRef: 'terms-only', activeLeaders: 0 }),
      ]))
      expect(commitChecked).toHaveBeenCalledOnce()
      expect(JSON.stringify(manifest)).not.toContain('same-user')
    } finally {
      client.close()
    }
  })

  it('accepts an active admin account linked to a valid Parish Leader term', () => {
    const manifest = analyzeOperationsAuthoritySnapshot({
      parishes: ['parish-a'],
      units: [row({ parish_id: 'parish-a', id: 'board', parent_id: null, unit_type: 'BOARD', is_active: 1, deleted_at: null })],
      terms: [row({ parish_id: 'parish-a', id: 'leader', person_id: 'person', unit_id: 'board', position_code: 'PARISH_LEADER', start_date: '2026-01-01', end_date: null, deleted_at: null, linked_user_id: 'admin', person_service_status: 'ACTIVE', person_deleted_at: null, user_role: 'admin', user_status: 'ACTIVE', user_deleted_at: null })],
    }, { today: '2026-09-10' })

    expect(manifest.requiresOperatorReview).toBe(false)
    expect(manifest.findings.leaderIdentity).toEqual([])
    expect(manifest.findings.parishLeaderCurrentCardinality).toEqual([])
  })

  it('passes one rooted board with valid, linked and non-overlapping leaders', () => {
    const manifest = analyzeOperationsAuthoritySnapshot({
      parishes: ['parish-a'],
      units: [
        row({ parish_id: 'parish-a', id: 'board', parent_id: null, unit_type: 'BOARD', is_active: 1, deleted_at: null }),
        row({ parish_id: 'parish-a', id: 'branch', parent_id: 'board', unit_type: 'BRANCH', is_active: 1, deleted_at: null }),
        row({ parish_id: 'parish-a', id: 'committee', parent_id: 'board', unit_type: 'COMMITTEE', is_active: 1, deleted_at: null }),
      ],
      terms: [
        row({ parish_id: 'parish-a', id: 'parish-leader', person_id: 'p1', unit_id: 'board', position_code: 'PARISH_LEADER', start_date: '2026-01-01', end_date: null, deleted_at: null, linked_user_id: 'u1', person_service_status: 'ACTIVE', person_deleted_at: null, user_role: 'phuta', user_status: 'ACTIVE', user_deleted_at: null }),
        row({ parish_id: 'parish-a', id: 'branch-leader', person_id: 'p2', unit_id: 'branch', position_code: 'BRANCH_LEADER', start_date: '2026-01-01', end_date: null, deleted_at: null, linked_user_id: 'u2', person_service_status: 'ACTIVE', person_deleted_at: null, user_role: 'chunhiem', user_status: 'ACTIVE', user_deleted_at: null }),
        row({ parish_id: 'parish-a', id: 'committee-leader', person_id: 'p2', unit_id: 'committee', position_code: 'COMMITTEE_LEADER', start_date: '2026-01-01', end_date: null, deleted_at: null, linked_user_id: 'u2', person_service_status: 'ACTIVE', person_deleted_at: null, user_role: 'chunhiem', user_status: 'ACTIVE', user_deleted_at: null }),
      ],
    }, { today: '2026-09-10' })

    expect(manifest).toMatchObject({ status: 'operations_authority_preflight_passed', findingCount: 0, requiresOperatorReview: false, parishIdentifiers: 'sha256_truncated' })
  })

  it('reports structural, scope, identity, overlap and current-leader findings without exposing raw ids', () => {
    const manifest = analyzeOperationsAuthoritySnapshot({
      parishes: ['private-parish'],
      units: [
        row({ parish_id: 'private-parish', id: 'board-1', parent_id: null, unit_type: 'BOARD', is_active: 1, deleted_at: null }),
        // A second active BOARD nested below the valid root must not evade a
        // preflight that only counts root boards.
        row({ parish_id: 'private-parish', id: 'board-2', parent_id: 'board-1', unit_type: 'BOARD', is_active: 1, deleted_at: null }),
        row({ parish_id: 'private-parish', id: 'branch-orphan', parent_id: null, unit_type: 'BRANCH', is_active: 1, deleted_at: null }),
      ],
      terms: [
        row({ parish_id: 'private-parish', id: 'leader-1', person_id: 'p1', unit_id: 'board-1', position_code: 'PARISH_LEADER', start_date: '2026-01-01', end_date: null, deleted_at: null, linked_user_id: 'u1', person_service_status: 'ACTIVE', person_deleted_at: null, user_role: 'phuta', user_status: 'ACTIVE', user_deleted_at: null }),
        row({ parish_id: 'private-parish', id: 'leader-2', person_id: 'p2', unit_id: 'board-2', position_code: 'PARISH_LEADER', start_date: '2026-06-01', end_date: null, deleted_at: null, linked_user_id: 'u2', person_service_status: 'ACTIVE', person_deleted_at: null, user_role: 'phuta', user_status: 'ACTIVE', user_deleted_at: null }),
        row({ parish_id: 'private-parish', id: 'bad-branch', person_id: 'p3', unit_id: 'board-1', position_code: 'BRANCH_LEADER', start_date: '2026-01-01', end_date: null, deleted_at: null, linked_user_id: null, person_service_status: 'ACTIVE', person_deleted_at: null, user_role: '', user_status: '', user_deleted_at: null }),
      ],
    }, { today: '2026-09-10' })

    expect(manifest.status).toBe('operations_authority_preflight_requires_review')
    expect(manifest.findings.boardRootCardinality).toHaveLength(1)
    expect(manifest.findings.boardRootCardinality[0]).toMatchObject({ activeBoards: 2, activeRootBoards: 1 })
    expect(manifest.findings.branchCommitteeParent).toHaveLength(1)
    expect(manifest.findings.positionScope).toHaveLength(1)
    expect(manifest.findings.leaderIdentity).toHaveLength(1)
    expect(manifest.findings.leaderTermOverlap).toHaveLength(1)
    expect(manifest.findings.parishLeaderCurrentCardinality).toEqual([expect.objectContaining({ activeLeaders: 2 })])
    expect(JSON.stringify(manifest)).not.toContain('private-parish')
    expect(JSON.stringify(manifest)).not.toContain('leader-1')
  })
})
