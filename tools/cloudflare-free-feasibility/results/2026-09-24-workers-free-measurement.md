# Workers Free measurement, 2026-09-24

## Scope and provenance

- Repository baseline: `90b2b61116394fa98889bd4bd9f07f4251286beb`; probe source and harness are uncommitted changes in this checkout.
- Target: isolated `catevia-free-feasibility.billfan157.workers.dev`, deployed via Wrangler 4.137.0. No Catevia production route, Turso credential, PDF, notification, backup, or user data was involved.
- Plan: Cloudflare dashboard `Workers plans` displayed **Free**, `$0`, and **Current plan**. The account page showed the 100,000 requests/day and 10 ms/Worker invocation limits.
- Run source: `load.mjs` on the local Windows machine, sending requests over the public Internet to the deployed Worker. Client timings include network, Cloudflare routing, Durable Object queueing, and execution. They are not CPU timings.
- The bcrypt probe performs **one new cost-12 hash plus one compare** per request. A normal Catevia login checks a stored hash and does not generate a new hash, so these results cannot be read as login endpoint latency.
- Cloudflare source: [Worker metrics](https://dash.cloudflare.com/c12d9d0f5e1316688884c19b42c36948/workers/services/view/catevia-free-feasibility/production/metrics) and [Durable Object metrics](https://dash.cloudflare.com/c12d9d0f5e1316688884c19b42c36948/workers/durable-objects/view/781392735ca141fa92df2628d2259e1d), read after the runs. Analytics ingestion and percentile aggregation can differ from the exact client sample window.

## Client-observed results

| Scenario | Count | Concurrent | Valid | p50 wall time | p95 wall time | Raw data |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Authenticated ping | 30 | 5 | 30 | 78.51 ms | 293.22 ms | [JSON](2026-09-24-ping-30-c5.json) |
| bcrypt hash + compare, cost 12 | 10 | 1 | 10 | 952.46 ms | 2196.65 ms | [JSON](2026-09-24-bcrypt-10-c1.json) |
| bcrypt hash + compare, one DO | 10 | 5 | 9 | 2931.23 ms | 3998.86 ms | [JSON](2026-09-24-bcrypt-10-c5.json) |
| bcrypt repeat, one DO | 5 | 5 | 5 | 3015.38 ms | 4607.43 ms | [JSON](2026-09-24-bcrypt-5-c5-repeat.json) |
| bcrypt repeat, one DO | 10 | 5 | 10 | 3948.56 ms | 5746.21 ms | [JSON](2026-09-24-bcrypt-10-c5-repeat.json) |

One additional single bcrypt request returned HTTP 200 in 1809.96 ms. An unauthenticated ping returned HTTP 403. The first 5 authenticated pings also returned HTTP 200 (p50 57.01 ms, p95 283.25 ms); these two initial checks were not saved as JSON.

The failed request in the first concurrent bcrypt batch returned HTTP 500 after 2934.06 ms. The probe returns a generic 500 from its catch handler; the stored client response does not establish which operation failed. Cloudflare's Durable Object dashboard showed no invocation error or CPU-limit event. **The 500 root cause remains unknown.** Do not treat the subsequent successful repeats as resolution.

## Cloudflare-observed results

- Durable Object namespace: 35 requests, 0 invocation errors, 0 exceeded-CPU events. CPU p50 **713.644 ms**, p90 **860.093 ms**, p99 **2559.682 ms**. Memory p50 **4.69 MB**, p99 **6.79 MB**. These are Cloudflare dashboard aggregates over the selected last-24-hours window at the time of inspection.
- Front HTTP Worker: 68 invocations, 0 invocation errors, CPU p50 **0.63 ms**, p90 **1.16 ms**, p99 **1.63 ms** after manual refresh. HTTP 500 returned by application code is not counted as an invocation exception in this metric. Dashboard counts can lag the client run.
- During this initial bcrypt/ping run, the probe made no Turso call. The Turso, PDF, and alarm follow-up measurements are recorded below; backup, notification delivery, real Catevia API routes, and native client behavior remain untested.

## Decision

The initial bcrypt/ping run proved that cost-12 hash and compare can execute on a SQLite-backed Durable Object in this actual Workers Free account under a small workload. It did not establish the full backend's viability or real login latency. The measured bcrypt CPU exceeds the 10 ms HTTP Worker cap, so login cannot simply execute in the front Worker. Sending all probe requests to one Durable Object raised client p95 to multiple seconds at five concurrent requests and produced one unexplained 500. Follow-up Turso, PDF, and alarm evidence plus the remaining blockers are below; they still do not qualify a full migration.

No Render or Vercel route was changed. The protected probe Worker remains deployed for follow-up measurements; its random `PROBE_TOKEN` is stored only as a Cloudflare secret and in ignored local `.dev.vars`.

## Follow-up gates, 2026-09-24

These tests were performed after the initial report. All times below are client-observed wall time from the same network in Viet Nam to Cloudflare and Turso's `AWS US East (Virginia)` database group. They include network and queue time; they are not database or Worker CPU measurements.

The current extracted Hono app route tree was also passed through Wrangler's Cloudflare bundler in dry-run mode: **5,453.32 KiB uncompressed / 1,012.88 KiB gzip**, no binding configuration, no deployment, and no runtime database connection. This shows the source can be bundled at this size; it does not execute module initialization or prove any route works on Workers. The build-only entry is `src/catevia-dryrun.js` with isolated config `wrangler-catevia-dryrun.jsonc`.

The experiment's dependency audit found three high-severity advisories in the **development dependency tree**: `extract-zip` symlink/path-traversal advisories flow through `@puppeteer/browsers` into `@cloudflare/puppeteer` 1.4.0. `npm view` reported 1.4.0 as the current published version; npm's suggested fix is a breaking downgrade to 0.0.11, which predates the documented 1.4.0 Guardrails requirement. A separate `npm audit --omit=dev --offline` reported zero production dependency vulnerabilities. Keep this as an experiment-only dev-tool risk; do not adopt the package into application dependencies until a compatible patched release or documented mitigation is available. No automatic dependency downgrade was applied.

At the initial probe, Wrangler returned Cloudflare API error **10042, “Please enable R2 through the Cloudflare Dashboard.”** The user subsequently activated R2 and created a private Standard bucket for this test. Through the Dashboard, the 142-byte synthetic encrypted `fixture.enc` was uploaded to the private bucket and downloaded back. The downloaded file's SHA-256 matched the original (`0386a495e9f35f225d2d95c64425484bfb83bf88f727e32e20126f38abbbf004`), then local AES-256-GCM decryption with the local-only key matched the expected 110-byte synthetic plaintext. A later deployed Worker binding probe also passed a separate encrypted synthetic object round-trip; see the runtime check below. Neither test verifies Catevia backup export, retention, or isolated restore. A temporary bucket-scoped S3 token was revoked before use; the Worker probe used the R2 binding and no S3 token. [R2 activation](https://developers.cloudflare.com/r2/get-started/) [R2 free tier and billing](https://developers.cloudflare.com/r2/pricing/)

| Gate | Workload | Result | Evidence |
| --- | --- | --- | --- |
| Turso read | `SELECT 1`, 10 requests, concurrency 2 | 10/10 valid; p50 1,090.11 ms, p95 1,755.34 ms | [JSON](2026-09-24-turso-read-10-c2.json) |
| Turso write transaction | Create probe table once, then insert/read a random row in a write transaction and roll it back; 10 requests, concurrency 2 | 10/10 HTTP 200; every response verified the row was absent after rollback; p50 1,470.36 ms, p95 3,799.30 ms | [JSON](2026-09-24-turso-transaction-10-c2.json) |
| Durable Object alarm | Schedule one alarm for 1 second later and read its persisted result | Passed; fired 1 ms after scheduled time in this single sample | [JSON](2026-09-24-alarm.json) |
| Browser Run PDF | Render self-contained Vietnamese sample HTML as A4 PDF; JavaScript disabled, outbound browser requests blocked with an empty hostname allowlist | Passed once at 22,636 bytes in 13,687.26 ms; PDF header valid; script did not run; an external `example.org` navigation was blocked by Guardrails | [JSON](2026-09-24-pdf-1-c1-detailed-repeat.json) |
| bcrypt follow-up | Cost-12 hash and compare, one Durable Object, 10 requests at concurrency 5 | 10/10 HTTP 200; p50 4,627.33 ms, p95 6,298.61 ms. This is a later sample, not an explanation for the earlier HTTP 500. | [JSON](2026-09-24-bcrypt-10-c5-post-turso.json) |

The first PDF call in this round also returned a valid PDF in 12,517 ms but the load harness discarded response details. One later repeat exceeded the harness's original 20-second client timeout; after the harness timeout was raised to 45 seconds, the next request passed. This is harness/client evidence, not proof that Browser Run itself failed. Dashboard usage, read after these requests, showed one session, zero browser hours, and zero Quick Action requests; that aggregate did not provide enough resolution to calculate actual browser time consumed.

## Current migration decision

**NO-GO for a complete Render-to-Workers-Free cutover on the current implementation.** This is a decision about readiness and parity, not proof that no future Workers-Free design can work.

This section records the state at the first follow-up. The later APNs implementation and bcrypt forensics below supersede its earlier open-item wording; the production cutover decision remains NO-GO.

What passed:

- The HTTP Worker itself remains well below the 10 ms CPU cap for the measured probe; bcrypt cost-12 hashing and comparison ran in a SQLite-backed Durable Object. The Free plan permits this class of work. Failures remain intermittent: the latest paired 10-request concurrency-5 sample had one HTTP 500 with 10 synthetic shards (9/10), while the control passed 10/10. Sharding lowered sampled p95 from 5,741.11 ms to 2,267.78 ms, but it has not met a reliability gate and does not explain the 500. These small samples are not login capacity or reliability qualification.
- The Workers-compatible Turso web client completed basic reads and rollback transactions against the disposable Free-plan database. Simple reads had p95 1.76 seconds and the test transaction p95 3.80 seconds from this client location. This proves API compatibility and transaction behavior for the probe, not Catevia's real schema, queries, concurrency, or production placement.
- Browser Run generated a valid isolated sample PDF while enforcing no external web access. Current published Workers Free limits include 10 browser minutes per day, three concurrent browser sessions, at most one new browser instance every 20 seconds, and a 60-second default browser inactivity timeout. The sample took about 13.7 seconds end to end. Current reporting demand and real-template throughput were not measured, so daily capacity is still unqualified. [Limits](https://developers.cloudflare.com/browser-run/limits/) [Pricing](https://developers.cloudflare.com/browser-run/pricing/)
- A SQLite Durable Object alarm ran on the Free account. One alarm sample does not prove Catevia's durable notification, retry, lease, idempotency, or cross-scheduler behavior.

Blocking gaps for cutover:

1. The bcrypt failure investigation is **PARTIALLY RESOLVED** by the later forensic check below: one sharded HTTP 500 coincided with a Durable Object code-update reset in the same trace. Two earlier HTTP 500s still have only generic parent errors, so their exact causes are unknown. A bounded retry exists only in the isolated probe, not Catevia authentication. Neither a passing probe nor a plausible deployment correlation qualifies production login reliability.
2. No successful DB-backed Catevia route has run on Workers. The extracted Hono app preserves route registration. A local `workerd` run now initializes the route tree after narrowly gating module-load DDL/PRAGMAs and moving two random/file-path operations out of global scope; `/health` executed and returned the expected degraded 503 against a deliberately invalid Turso URL. This is an isolated startup proof, not a database or API parity proof. The Worker dry-run aliases `@libsql/client` to the required `@libsql/client/web` entry; the actual application still has a module-global client and direct imports throughout routes/services. Cloudflare's [official Turso integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/turso/) specifies the web entry. Startup schema/parish assertions, seeding, recovery, and scheduler ownership still lack an equivalent release gate. A request-safe database strategy and serialized release-time migration/readiness workflow remain required.
3. APNs delivery currently imports `node:http2` and calls `http2.connect` in `server/src/services/apnsPushProvider.ts`. Cloudflare's current Node.js compatibility documentation lists `node:http2` as a **non-functional stub**. A new probe using `fetch()` against Apple's sandbox, with an intentionally invalid bearer token and all-zero device token, received `403 InvalidProviderToken`. This proves the request reached APNs using the Worker fetch transport; it does not prove provider-token signing, valid device delivery, retry semantics, or Catevia notification parity. Port the provider to `fetch` + Web Crypto and test against a dedicated APNs sandbox app before claiming parity. [Cloudflare Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) [Apple APNs connection requirements](https://developer.apple.com/documentation/usernotifications/establishing-a-connection-to-apns?language=objc)
4. Notification processing, reminder/lifecycle/dispatch/receipt maintenance, and backup currently use process memory and `setInterval`/`setTimeout`. A single alarm test does not port their durable lease, retry, ordering, and idempotency rules. The Worker must become the sole fenced owner during transition.
5. PDF test did not use the existing Catevia sanitizer or report route, did not compare real report output, and did not exercise A3/Letter, page count, Vietnamese font/print layout, concurrent generation, or daily quota exhaustion/429 behavior.
6. The real application backup workflow was not tested. Existing remote backup code requires explicit encryption and independent R2 storage; the current blob abstraction can fall back to local filesystem, which is not a persistent Worker backup target. A synthetic encrypted object passed both a Dashboard upload/download check and a later deployed Worker R2 binding round-trip. Catevia export, retention, and isolated restore drill remain unverified.
7. Current production routing still targets Render in `vercel.json` and native build settings in `codemagic.yaml`. Existing installed native apps embed the old API origin and have not been tested against a migration/compatibility strategy.
8. A read-only Turso Analytics inspection on 2026-09-24 showed `tnttvn` at about 9.15K queries for Today (UTC), with a displayed 868 ms average query time; the 24-hour chart view did not expose an API request count. This is a partial database workload indicator, not a count of Catevia HTTP requests, peak request rate, login distribution, or report volume. Workers Free request/CPU/subrequest quota headroom therefore remains **UNKNOWN**.

The evidence is sufficient to close the feasibility question for the present release: **do not remove Render or cut traffic over to Workers Free yet**. It is not sufficient to close implementation, production readiness, backup/recovery, or a future re-evaluation after the listed gaps are addressed. Keep Render as the serving backend and rollback path.

## Follow-up experiments, 2026-09-24

These experiments updated only the isolated `catevia-free-feasibility` Worker.
They did not use Catevia credentials, users, or production routes.

| Experiment | Workload | Result | Interpretation |
| --- | --- | --- | --- |
| Bcrypt, one DO (control) | Cost-12 hash + compare; 20 requests; concurrency 5 | 20/20 pass; p50 3,256.33 ms; p95 5,099.44 ms | Client wall time; all work queues behind one synthetic object. [Raw](2026-09-24-bcrypt-20-c5-control.json) |
| Bcrypt, 10 synthetic DO shards | Same work; 20 requests; concurrency 5; 10 fake account identifiers | 20/20 pass; p50 1,275.55 ms; p95 1,881.93 ms; no 500s | About 63% lower p95 than the control in this single paired run. This is promising, not a production load qualification. [Raw](2026-09-24-bcrypt-sharded-20-c5.json) |
| Repeat control | Same as control | 19/20 pass; 1 HTTP 500; p50 3,528.18 ms; p95 4,396.67 ms | Confirms the unexplained failure can recur when one synthetic object is hot. Cause remains unknown. [Raw](2026-09-24-bcrypt-20-c5-control-repeat.json) |
| Repeat sharding | Same as sharded | 20/20 pass; p50 1,291.73 ms; p95 2,138.25 ms | Improvement repeated: sharded p95 was about 51% lower than its paired control. Still only two small runs and synthetic hash+compare. [Raw](2026-09-24-bcrypt-sharded-20-c5-repeat.json) |
| PBKDF2 in HTTP Worker | PBKDF2-HMAC-SHA256, 600,000 rounds, two derivations | Rejected with `NotSupportedError`: Worker runtime caps iteration counts at 100,000 | Not a viable drop-in password-hash replacement at OWASP's current 600,000-round recommendation. [Raw](2026-09-24-pbkdf2-600k-1-c1.json) [Error detail](2026-09-24-pbkdf2-600k-error-detail.json) [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| APNs sandbox transport | One POST with an intentionally invalid provider token and all-zero device token | APNs returned `403 InvalidProviderToken` | Confirms the Worker can reach APNs through `fetch`; does not prove signing or delivery. [Result](2026-09-24-apns-fetch-sandbox-response.json) |
| Bcrypt paired repeat, control | Cost-12 hash + compare; 10 requests; concurrency 5 | 10/10 HTTP 200; p50 2,402.63 ms; p95 5,741.11 ms | Synthetic work only; client wall time. [Raw](2026-09-24-bcrypt-control-final.json) |
| Bcrypt paired repeat, 10 synthetic shards | Same work; 10 requests; concurrency 5; fake account identifiers | 9/10 HTTP 200; 1 HTTP 500; p50 1,727.06 ms; p95 2,267.78 ms | Faster sampled p95 than control, but failure means sharding is not reliability-qualified. Cause of 500 remains unknown. [Raw](2026-09-24-bcrypt-sharded-final.json) |
| Protected ping and alarm repeat | Authorized ping, unauthenticated ping, and 3 sequential alarm schedules | Authorized ping 200; unauthenticated ping 403; 3/3 alarms fired at target | Probe auth gate and this small alarm path work; not application auth or scheduler parity. Client wall for authorized ping was 710.24 ms. |
| Backend source checks | TypeScript `tsc --noEmit`; Wrangler `--dry-run` bundling | Both exited 0; bundle 5,453.32 KiB / 1,012.88 KiB gzip | Compilation and bundling only. Wrangler dry-run does not evaluate module initialization, open Turso, or execute routes. |

### Recommended target architecture

1. Keep Turso as the sole canonical database. Move schema bootstrap, migrations,
   seed, readiness checks, and repair scripts into a serialized release/preflight
   step; never run DDL or seed writes while importing a request Worker module.
2. Make the Hono app and database access request-safe before deploying routes.
   Current modules create a Node libSQL client and run quarantine/PRAGMA/bootstrap
   work at module load, then startup seeds and registers timers. A dry-run bundle
   does not prove those modules can execute in Workers. Do not bridge Cloudflare
   bindings through mutable process-global state.
3. Keep bcrypt cost 12. Only consider a Durable Object per stable
   `(parishId, userId)` key for bcrypt computation after operation-level tracing
   explains the intermittent 500 and reliability tests pass under representative
   contention. The latest sharded batch is not a pass even though its sampled
   p95 was lower. Use the object for bcrypt computation
   only. Keep `failedAttempts`, lockout status, audit events, token revocation,
   and session issue/reset in the existing conditional/atomic Turso transactions.
   Unknown users must still receive the existing dummy-work policy, and tests must
   cover concurrent valid/invalid attempts, password rehash, and lockout races.
   Add Free Durable Object request/duration quota monitoring; object sharding
   removes the single hot queue but does not add daily quota.
4. Use Smart Placement for the stateless Hono fetch handler if representative
   Turso traces show it helps the current `AWS US East (Virginia)` database.
   Smart Placement is available on all Workers plans, but it needs real
   multi-region traffic and takes time to converge; measure with the disposable
   database before relying on it. Do not assume the earlier Vietnam client
   latency was a database-only measurement.
5. Port APNs to `fetch` and Web Crypto, preserving provider JWT caching, sandbox/
   production selection, response classification, and durable retry. Keep the
   existing DB outbox/event as authority. Cloudflare Queues may be a delivery
   signal, not the only durable copy: Free retention is 24 hours and the allowance
   is 10,000 operations/day (normally about 3 operations per delivered message).
   A bounded Cron/DO dispatcher can recover from the DB outbox; test single-owner
   fencing before Render and Workers overlap.
6. Treat Browser Run as optional, quota-limited PDF compute until representative
   templates and demand pass. Workers Free allows 10 browser minutes/day; the one
   self-contained sample does not establish a sustainable report budget. Preserve
   the sanitizer, JavaScript-off behavior, blocked network/file access, page
   sizes, and Vietnamese rendering in parity tests.
7. Keep encrypted backups independent of the runtime. A Worker filesystem is not
   durable storage; do not count local fallback as backup. R2 is now enabled and
   a private Standard test bucket exists. Synthetic encrypted objects passed
   Dashboard upload/download and a deployed Worker R2 binding round-trip.
   Catevia export and isolated restore have not passed, so this gate cannot be
   waived while staying on Workers Free.
8. Keep Render serving while routing is changed in stages. Verify web rewrite,
   native API base, old installed app behavior, real API parity, rollback, and
   monitoring on the exact deployed Worker version before any cutover.

### Updated conclusion

At the time of this experiment, sharding lowered sampled bcrypt latency, but
the last sharded repeat still had one unexplained HTTP 500. The later forensic
section identifies a code-update reset for that specific request. APNs `fetch` has a safe sandbox-level
reachability result. The protected ping, repeated alarm, TypeScript check, and
Wrangler dry-run also passed within their narrow scopes. These close limited test
questions, not the migration. The existing API cannot yet be lifted into Workers
because its database and scheduler initialization are process-startup based;
backup/restore, real-route behavior, full notification parity, PDF quota, actual
traffic headroom, and client routing remain unqualified. Current status remains
**NO-GO for production cutover**.

## Experimental resources

- Disposable Turso database: `catevia-cloudflare-probe-20260924` in the user's Free organization. A database-scoped read/write token with a one-day expiry was used only by the probe; it was never written to the repository. Its Worker Secret was deleted after the tests. The Turso token expires within one day of issuance. The database contains only the `__catevia_cf_probe` table and no Catevia data. The production `tnttvn` database was not queried by the probe.
- Cloudflare Worker: `catevia-free-feasibility`, latest experimental version `a6cb9c5d-ecaf-448c-a5f6-18d648ea1887`, on the Workers Free account. It has only the `workers.dev` hostname and no route or custom domain for Catevia. It has `AUTH_CPU`, `PASSWORD_CPU`, `BROWSER`, and test-bucket-only `BACKUP_PROBE` bindings. Wrangler deployment had previously removed the non-secret disposable Turso URL/enable flag to match the checked-in isolated config; the Turso secret had already been deleted.
- Earlier Dashboard inspection on 2026-09-24 showed the probe configured with a Durable Object and Browser Run binding, before the R2 binding deployment. The metrics card showed 191 requests/0 errors over its displayed 24-hour interval before the latest test pair; these are probe-only account metrics, and event details were unavailable in the Observability events view after refresh. Do not interpret them as Catevia traffic or evidence of no failures in the latest sample.
- R2: subscription is active. The private Standard bucket `catevia-cf-backup-probe-20260924` was created in the automatic Asia-Pacific location on 2026-09-24. A synthetic AES-256-GCM object (`fixture.enc`, 142 B) was uploaded through the Dashboard, downloaded through the Dashboard, and verified locally: original and downloaded SHA-256 both equal `0386a495e9f35f225d2d95c64425484bfb83bf88f727e32e20126f38abbbf004`; decrypting with the local-only key yielded the expected 110-byte synthetic plaintext. The later Worker-binding test is described below. A user R2 API token with Object Read & Write on only this bucket and a 24-hour TTL was deleted before use; the Worker binding did not require it. Neither test proves Catevia backup export, retention, or isolated restore.

## Local Catevia route-tree runtime check, 2026-09-24

The repository HEAD was `90b2b61116394fa98889bd4bd9f07f4251286beb` with existing unrelated worktree edits. The isolated `wrangler-catevia-dryrun.jsonc` config used local `workerd`, `@libsql/client/web` aliasing, `CATEVIA_RUNTIME=cloudflare-worker`, and a deliberately invalid `libsql://invalid.invalid` URL with a synthetic token. No production database or Cloudflare route was contacted or changed.

The first local startup failed because `dbConfig.ts` evaluated `fileURLToPath(import.meta.url)` globally. After deferring the local-file branch, startup failed on database I/O at module load. Gating that I/O only in the Worker runtime exposed global `randomBytes`/bcrypt work in `passwordPolicy.ts`, then a second global `fileURLToPath` in `safetyDir.ts`. The dummy bcrypt hashes were precomputed from discarded random passwords to preserve request work factors without a first-request hash; the safety path is now resolved only on the Node/local path. With these changes, `workerd` started and executed the actual Hono `/health` route, returning **HTTP 503** with `database: disconnected` against the invalid URL. `/api/auth/me` returned **HTTP 500** in that synthetic setup; without a real disposable DB and operation trace this is not an auth compatibility result. It also confirms that successful Worker startup alone cannot qualify API requests.

The Worker-only bypass of module-load database checks additionally requires a Workers-specific runtime global, so setting `CATEVIA_RUNTIME` on Node alone cannot skip Node's startup checks. Focused Node checks after these changes: server TypeScript `--noEmit` passed; `cloudflareRuntime.test.ts` plus existing `blobStorage.test.ts` passed (7 tests); existing `authLoginTiming.test.ts` plus `blobStorage.test.ts` passed earlier (9 tests, synthetic timing median ratio 1.061). The latest helper edit was included in the 7-test and TypeScript runs. The local Worker smoke was repeated after that edit and still returned 503 as expected.

These checks do not qualify real Turso queries, authentication, rate limiting, startup readiness equivalence, background delivery, PDF, backup, or production routing. The current Worker config is a local/dry-run experiment with `workers_dev: false`, not a cutover artifact.

The same protected bcrypt probe was also run in local `workerd` on loopback port 8793, using the local-only harness gate and synthetic identities. A 20-request concurrency-5 control batch passed 20/20 (p95 6,764.71 ms); a 20-request 10-shard batch passed 20/20 (p95 6,792.51 ms). [Control raw](2026-09-24-bcrypt-local-control.json) [Sharded raw](2026-09-24-bcrypt-local-sharded.json). No HTTP 500 appeared in local logs. Unlike the remote Cloudflare samples, local sharding did not reduce p95; the single-machine emulator shares CPU and is not an equivalent performance environment. This does not identify or clear the intermittent HTTP 500 measured on the real Workers Free account.

An isolated Worker R2 binding probe now encrypts a synthetic fixture with AES-256-GCM, writes it to the named test bucket binding, reads and verifies ciphertext/plaintext, and deletes the unique test object before returning success. Wrangler dry-run resolved the `BACKUP_PROBE` binding and bundled the probe (888.62 KiB / 178.64 KiB gzip). The local `workerd` R2 emulator passed **1/1 HTTP 200** in 479.36 ms client wall time. [Local raw](2026-09-24-r2-worker-local.json). After Wrangler OAuth was restored through Edge, version `c3fbc449-0e41-42c9-b4d0-cbfd78e3a0ec` was deployed with the private test-bucket binding. The actual Workers Free request passed **1/1 HTTP 200**, with 1,948.81 ms client wall time, at 2026-09-24 07:14:47-07:14:49 UTC. [Remote raw](2026-09-24-r2-worker-remote.json). This proves one live encrypted synthetic object put/get/verify/delete cycle through the Worker binding; it does not qualify Catevia backup/export, restore, retention, large objects, or repeated reliability.

The Catevia APNs provider now has a Worker-specific `fetch` transport and Web Crypto ES256 provider-token signer; the existing Node `http2` path remains for Render. The focused unit test generated a disposable P-256 key, verified the emitted JWT signature independently with Node crypto, and checked one accepted and one `Unregistered` APNs response. The focused suite passed 3/3; server TypeScript and targeted oxlint passed. The real Catevia route-tree Wrangler dry-run also bundled successfully (5,500.72 KiB / 1,017.96 KiB gzip). This is source-level compatibility evidence only. No real APNs signing key, device token, notification queue, or Worker deployment of the Catevia app was used. Worker subrequest budgeting and durable retry/fencing remain open.

A further live bcrypt shard run under Wrangler tail produced 9/10 valid responses at concurrency 5: nine HTTP 200 responses and one client-side `TypeError` without an HTTP status, with sampled p95 10,594.98 ms. [Raw](2026-09-24-bcrypt-sharded-tail.json). The captured Worker/DO tail entries that were visible showed successful executions and no exception; the raw tail included request metadata and was not retained. This run does not explain the earlier HTTP 500 and is not a reliability pass. The no-status request might have failed before or during network delivery; that remains unknown.
An error-only Wrangler tail was then used for a 20-request shard batch at concurrency 5. It returned 20/20 HTTP 200, p95 2,045.03 ms, and no error entries in that window. [Raw](2026-09-24-bcrypt-sharded-error-tail.json). The earlier HTTP 500 and the newer client-side no-status failure remain unexplained; this clean small batch cannot establish reliability.
- No Render or Vercel production setting was changed.

## Bcrypt failure forensics and bounded retry, 2026-09-24 14:48 GMT+7

Cloudflare Workers Observability's 24-hour error view showed an `AuthCpuProbe` Durable Object event at **13:30:12.410 GMT+7** with the exact message **“Durable Object reset because its code was updated.”** Its trace `0fb8c979c2c84d02cabe71f65b64c71d` also contained the parent `/probe/bcrypt-sharded` HTTP error, matching the 06:30:07.556 UTC client run in [the 9/10 sharded batch](2026-09-24-bcrypt-sharded-final.json). This establishes the immediate cause of **that one** HTTP 500: the Durable Object RPC was interrupted by a code-update reset. Cloudflare documents code-update shutdown and transient RPC error handling: [lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), [error handling](https://developers.cloudflare.com/durable-objects/best-practices/error-handling/). The dashboard evidence was inspected through the account's [probe Observability view](https://dash.cloudflare.com/c12d9d0f5e1316688884c19b42c36948/workers/services/view/catevia-free-feasibility/production/observability/events); it is not a repository test fixture.

The earlier HTTP 500s in the [first concurrent batch](2026-09-24-bcrypt-10-c5.json) at 03:39:59.974 UTC and [control repeat](2026-09-24-bcrypt-20-c5-control-repeat.json) at 04:56:27.261 UTC have only parent HTTP errors and the probe's old generic catch log. Wrangler deployment history shows updates before both failures, but timing alone does not prove they were also code-update resets. Their exact causes remain unknown. The earlier no-status `TypeError` was separately narrowed by an instrumented harness run: the local Node client reported `UND_ERR_CONNECT_TIMEOUT` before receiving HTTP, not a Worker HTTP 500. This does not establish why that network connection timed out.

Two controlled deploy-overlap experiments did not reproduce the Durable Object reset: [first overlap](2026-09-24-bcrypt-deploy-overlap.json) returned 49/50 HTTP 200 plus one local `UND_ERR_CONNECT_TIMEOUT`; [actual Durable Object code update](2026-09-24-bcrypt-do-code-update.json) returned 50/50 HTTP 200. These runs show that a deployment does not necessarily fail an in-flight request; they do not negate the observed reset event.

The isolated synthetic probe now handles only idempotent cost-12 hash-and-compare work with one bounded retry after a retryable RPC error or that exact code-update-reset error. It obtains a fresh Durable Object stub after an exception, waits 50-74 ms, and does not retry `.overloaded` or arbitrary errors. Unit tests passed 3/3 for fresh-stub retry, overload exclusion, and the one-retry bound. Wrangler dry-run passed; version `bdcb74ad-e6ed-4094-bcd8-08d924a23982` deployed with the same test-only bindings. A normal post-deploy batch passed [5/5 HTTP 200](2026-09-24-bcrypt-retry-postdeploy.json), p50 823.82 ms and p95 1,387.47 ms client wall time. That batch did **not** trigger the retry branch, so the deployed branch has unit evidence but no live fault-injection proof. The real Catevia login and password-write paths still call `bcryptjs` directly and do not use this probe helper.

Cloudflare's [current Free limits](https://developers.cloudflare.com/workers/platform/limits/) list 10 ms CPU per HTTP Worker request and 100,000 requests/day; [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/) list a 30-second default CPU budget per invocation and permit SQLite-backed objects on Free. The measured synthetic hash-plus-compare cannot be moved unchanged into the front HTTP Worker. A real auth adapter must preserve rejected-login timing, tenant/account sharding, lockout transactions, token revocation, and audit behavior. A retry of any real write requires an explicit idempotency design; this probe retry is **not** reusable for writes.

### Cutover gate after forensics

**NO-GO: keep Render serving.** The authenticated, DB-backed Catevia routes have not passed on a deployed Worker against a disposable schema; the production login compute still resides in request code. Release-time migrations/readiness, durable notification and reminder ownership, real PDF parity and Free quota, encrypted Catevia backup plus isolated restore, production traffic headroom, web/native routing, and a tested rollback remain open. The synthetic probes answer narrow platform questions and cannot substitute for these application and recovery checks. No Render, Vercel, native API origin, or production Turso data was changed in this investigation.

## Catevia password-compute adapter, 2026-09-24

The application password call sites in `passwordPolicy.ts`, `routes/auth.ts`, `userService.ts`, and `passwordResetRequestService.ts` now use one adapter. Node/Render still computes bcrypt locally. In the Worker runtime, a per-request `AsyncLocalStorage` scope supplies the `PASSWORD_CPU` binding and each hash/compare becomes a stateless Durable Object RPC; the binding is required or the operation fails closed. The adapter recreates the stub and retries **only the computation** once for an explicitly retryable RPC error or the observed code-update-reset message, and never retries `.overloaded`. It does not retry a database write, session, lockout counter, or audit event. The Durable Object receives passwords/hashes in Cloudflare RPC only; it persists neither and logs neither. Random selection among 32 fixed compute shards avoids naming Durable Objects after account or parish identifiers. This is a candidate boundary; full login timing and load parity on Workers remain open.

Current local verification: server TypeScript and targeted oxlint passed; the new adapter suite passed 5/5, covering Node compatibility, missing-binding failure, fresh-stub retry, overload exclusion, concurrent request scope, and unknown/legacy/current rejected-login work factors. Existing `authLoginTiming.test.ts` plus that suite passed 8/8; six other authentication, lockout, transaction, reset, cookie, and user-management suites passed 63/63. The Worker route-tree Wrangler dry-run resolved `PASSWORD_CPU` and bundled. A local workerd smoke, with `CATEVIA_RUNTIME=cloudflare-worker` explicitly enabled, returned HTTP 200 with cost 12, a matching and a rejected comparison, and `rpcCalls: 3`. An earlier local HTTP 200 without that runtime flag was **discarded** because it could have used Node bcrypt; only the later instrumented result counts as adapter evidence.

The protected isolated feasibility Worker then deployed version `a6cb9c5d-ecaf-448c-a5f6-18d648ea1887` with an additional `PASSWORD_CPU` binding. Its synthetic `/probe/catevia-password-adapter` endpoint uses the actual application adapter and a hard-coded synthetic password, never Catevia credentials or database data. The [remote batch](2026-09-24-catevia-password-adapter-remote.json) passed 5/5 HTTP 200 with three Durable Object RPCs per request; client p50 was 3,041.76 ms and p95 4,576.34 ms for **one new cost-12 hash and two comparisons**. This is a real Workers Free execution proof of the adapter, not a normal login latency or failure-rate qualification. No Catevia API route was deployed and no production routing changed.

Cloudflare's [Durable Objects Free pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) currently includes 100,000 requests/day and 13,000 GB-s/day; **each RPC method call is a billed request**. Therefore a rejected login's two comparisons use at least two Durable Object requests, and any rehash or password write adds more. Real login mix, daily peak, CPU and duration distributions, quota headroom, and auth latency across regions remain unmeasured. The disposable Turso database could not yet be used for a real DB-backed Catevia route because its previous short-lived token expired. A new database-scoped token was authorized by the user, but the Edge browser control did not attach to the signed-in Turso tab, so no new token or Cloudflare Secret was created in this step.

## Actual Catevia API on isolated Workers Free staging, 2026-09-24

The earlier inability to attach Edge was resolved. A new token was created for **only** `catevia-cloudflare-probe-20260924`; it has read/write scope and a one-day lifetime. The guarded Node preflight applied the current Catevia schema on that disposable database and returned `schemaReady: true`. No `tnttvn` credential or data was used. An initial UI submission accidentally selected Turso's default non-expiring lifetime; that token was never installed. Later, a PowerShell stdin BOM caused a Turso bearer-header rejection and exposed the then-current one-day token in a staging trace. **All tokens for the disposable database were invalidated**, covering both tokens. A fresh one-day token was created and installed via Node's ASCII stdin into the staging Worker Secret. The local staging credential file is ignored by Git. This incident and cleanup are limited to the disposable database.

The actual Hono route tree was deployed as `catevia-api-staging`, first without a public target while secrets were provisioned, then on its isolated `workers.dev` hostname. Module evaluation required `DEPLOYMENT_PARISH_ID`, `REPORT_HMAC_SECRET`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`; these were supplied for staging, without weakening Catevia's production fail-closed checks. Startup time was 85-110 ms and the bundle was 5,503.24 KiB uncompressed. There was no Render/Vercel/native route change. The final placed Worker version in this session was `e3c9d5a4-d51d-456d-be20-82e2dc1d1120`.

Before placement, `/health` could read Turso and return 200, and unauthenticated `/api/auth/me` returned 401. A real unknown-account login intermittently returned 500. Wrangler tail tied one 500 to `LibsqlError: SERVER_ERROR: Server returned HTTP status 522` in the DB-backed rate limiter, with 19,469 ms wall time and 21 ms Worker CPU. This supports an upstream connectivity failure for that request, **not** a bcrypt CPU-limit diagnosis. In the bounded [four-cycle baseline](2026-09-24-catevia-staging-connectivity-edge.json), Worker health passed 4/4 at 1,236-6,746 ms; unknown-account login returned 401 twice at 4,264 and 17,305 ms, while two client attempts exceeded the 30-second deadline without a response. A direct Node query to the same Turso database succeeded 3/4 and failed once after 10,666 ms with a `TypeError`. This local failure means the available evidence does not isolate the network problem exclusively to Workers.

Cloudflare's [placement documentation](https://developers.cloudflare.com/workers/configuration/placement/) allows region placement on all Workers plans. Staging was then placed near the known Turso region with `placement.region = "aws:us-east-1"`; response headers showed `Cf-Placement: remote-`. The matching [four-cycle placed sample](2026-09-24-catevia-staging-connectivity-placed.json) returned health 200 in 336-962 ms and unknown-account 401 in 1,827-4,375 ms, all 4/4. One captured unknown-account request had 6 ms in the front Worker and two password Durable Object invocations at 330 and 113 ms CPU; it returned 401. The contrast is promising but these eight requests do not establish a failure rate, regional performance, or sustained quota headroom. [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/) still specify 10 ms CPU per HTTP request, with some transient flexibility; other API routes may exceed it.

An end-to-end test inserted **only a synthetic user** into the disposable database. The final [auth artifact](2026-09-24-catevia-staging-auth.json) records a wrong password returning 401 and raising `failed_attempts` to 1, followed by a correct password returning 200 and resetting it to 0. The same session had an access token and refresh cookie with `HttpOnly`, `Secure`, and `SameSite=None`; authenticated `/me`, empty student and class lists, refresh rotation, and logout revocation all returned 200. A `phuta` user's notification-list request returned 403. The Vercel-origin CORS preflight allowed the configured origin, while an untrusted-origin preflight had no `Access-Control-Allow-Origin` header. No raw token, password, cookie, or JWT was saved in the results. This qualifies these **specific** staging routes, not the whole backend.

**Cutover remains NO-GO on Workers Free.** The actual API can now start and run representative auth, transaction, and list routes on a disposable database, which closes the previous module-load and basic-auth gates. The pre-placement Turso 522, local Turso query failure, small sample size, and untested real-data behavior leave reliability open. The release still lacks a verified encrypted Catevia backup and isolated restore, a single-owner notification/reminder dispatcher during Render overlap, representative PDF behavior within Free quotas, complete route and security parity, production traffic/CPU headroom, a production-data migration plan, web/native routing validation, and an exercised rollback. Render stays live until those are proven on the exact release.

Final local checks for this stage: `server` TypeScript `--noEmit` passed; Wrangler staging dry-run bundled with the Durable Object binding; three focused Vitest files passed 11/11 tests; `node --check` passed for the staging secret, connectivity, and auth scripts. The ignored `.dev.vars.catevia-staging` is confirmed excluded by Git and no JWT-like value was found in the experiment files outside ignored credentials. This verifies code/configuration and the named staging routes only.

At 2026-09-24 08:51 UTC, a read-only check of `https://tnttvn.vercel.app/health` still returned HTTP 200, `database: connected`, and release `90b2b61116394fa98889bd4bd9f07f4251286beb`. The checked-in `vercel.json` still rewrites `/api/*` and `/health` to Render. This confirms the observed production path was unchanged at that moment, not that every Render route is healthy.
