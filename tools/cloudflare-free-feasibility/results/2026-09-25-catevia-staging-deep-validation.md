# Current-source Catevia Worker staging validation

Captured 2026-09-24 UTC on the current dirty worktree (repository HEAD
`90b2b61116394fa98889bd4bd9f07f4251286beb`). The staging Worker was deployed
from that uncommitted worktree as `uncommitted-20260925-staging`, version
`4cad9d47-8931-43d1-9605-cce7c48a4a8c`. These results do not establish a
commit-pinned release. Staging used only the disposable
`catevia-cloudflare-probe-20260924` Turso database and the probe R2 bucket.

## Measured results

| Area | Result | Evidence and limit |
| --- | --- | --- |
| Authentication/session | PASS | Invalid login returned 401; failed-attempt count increased then reset after valid login; HttpOnly/Secure refresh cookie; refresh rotation; logout confirmed session revocation. |
| Role and read routes | PASS | Authenticated `/api/auth/me`, students and classes returned 200; notification access for the synthetic `phuta` user returned 403. This covers those routes only. |
| Writes/idempotency | PASS | Unauthorized class write 401; class/student create, read, update, delete passed; replay returned the same class ID; conflicting replay returned 409 `IDEMPOTENCY_CONFLICT`. |
| R2 archive | PASS | Synthetic 1×1 PNG upload/download passed authorization and SHA-256/size integrity checks. No real user asset was used. |
| Background maintenance | CONDITIONAL PASS | All eight manual job endpoints returned 200. The disposable database had zero eligible work for these jobs, so this proves invocation/startup but not behavior on non-empty production queues. Automatic scheduling remained disabled in staging. |
| Notification recovery | PASS for provider-absent behavior | Repeated recovery returned a stable `PUSH_PROVIDER_NOT_CONFIGURED`, one attempt, and cleared the lease. It deliberately sent no push and does not prove APNs/FCM/Web Push delivery. |
| Encrypted backup | PASS on disposable data | Worker created an encrypted R2 backup after a 3.2 MB random fixture was inserted; status 200, client-observed elapsed 2,254 ms, cleanup confirmed. The downloaded encrypted object was 4,414,114 bytes. These are wall-clock/size measurements, not Worker or Durable Object CPU measurements. |
| Restore | PASS on isolated local SQLite | Decryption and restore produced 78 tables/447 rows, zero foreign-key violations, and the recovery-quarantine check blocked startup. No production database was restored or changed. |
| PDF | PASS for one synthetic request | Authenticated render returned 200; 21,807-byte PDF had `%PDF-` signature; client-observed elapsed 3,008 ms. Browser Run minutes and Worker/DO CPU for this request were not captured. |

The one-request PDF result is not a capacity claim. Cloudflare currently lists
10 Browser Run minutes per day on Workers Free; actual daily use must be
measured against the production workload before relying on that allowance
([Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/)).

## Deployment and production boundary

- Production `catevia-api` remains configured with `CATEVIA_TRAFFIC_ENABLED=no`
  and `CATEVIA_MAINTENANCE_OWNER=render`. An unauthenticated request to
  `/api/auth/me` returned `503 Backend cutover pending`.
- `vercel.json` still routes `/health` and `/api/*` to Render. Render remains
  the current application and scheduled-job owner.
- `.github/workflows/deploy-production.yml` now has an uncommitted exact-SHA
  Cloudflare deploy step, config guard, and closed-state smoke. YAML parsing,
  Wrangler 4.137.0 dry-run, and the local bundle passed; GitHub Actions has not
  executed this workflow change yet.
- `npm run verify:ci` passed lint, architecture inventory, design-system lint,
  and the full build. The serial coverage phase did not produce a final result
  during the local run and was stopped; the full repository test gate is
  therefore UNKNOWN. Focused Worker tests passed 39 tests across 9 files.

## Cutover decision

**NO-GO for public production routing on this evidence.** The staging paths
above pass on disposable data, but full API/authorization/tenant parity,
provider-backed notification delivery, non-empty job execution, real-data
backup/restore, measured Free quota headroom for backup/PDF, production
traffic observation, and an exercised rollback are still unverified. The
owner confirmed that no users installed the old native app; old-binary
compatibility is not a gate. This does not waive web/API correctness or
rollback verification.

## Fresh verification on 2026-09-25

The current checkout remains `main` at `90b2b61116394fa98889bd4bd9f07f4251286beb`, matching `origin/main`. Migration implementation is still uncommitted and mixed with unrelated worktree edits.

- `npm run build`: PASS (root TypeScript, server TypeScript, Vite, and PWA build). Vite emitted the existing `NODE_ENV=production` `.env` warning; it did not fail the build.
- Current Worker adapter tests: PASS, 16 tests across 7 files.
- Security-critical suite: PASS, 81 tests across 8 files.
- Wrangler 4.137.0 production config dry-run with `--strict`: PASS. Config still has `CATEVIA_TRAFFIC_ENABLED=no` and `CATEVIA_MAINTENANCE_OWNER=render`; no production deploy was made.
- Read-only live boundary check: Render `/health` returned 200, release `90b2b61116394fa98889bd4bd9f07f4251286beb`, database `connected`; Vercel root returned 200; Vercel `/api/auth/me` returned the expected unauthenticated 401 and carried `X-Render-Origin-Server: Render`; the Worker `/api/auth/me` still returned 503 `Backend cutover pending`.

These checks verify the current Render rollback route and the closed Worker state. They do not prove provider-backed push, maintenance against non-empty production work, production backup/restore, or production Free-quota headroom. Full coverage/CI remains UNKNOWN because the prior serial coverage run did not return a final result. Production routing remains NO-GO on current evidence. The owner confirmed no users installed an older native build, so old-binary compatibility is not a gate.
