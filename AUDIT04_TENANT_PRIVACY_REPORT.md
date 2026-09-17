# Audit #04 — Parish/Tenant Isolation, Privacy & PII

**Repository:** Catevia / TNTTVN (`billfan157-pixel/TNTTVN`, codename `brave-davinci`)
**Audit mode:** D3, deep, adversarial, evidence-based, READ-ONLY (current working tree after Audit #01–#03 remediation)
**Report version:** v1.1 (incorporates post-review citation corrections; no severity changes)
**Governance:** current `AGENTS.md`, `.agents/*` branch files, `catevia-current-truth`, `catevia-verification`

**Audit posture:** D3, read-only, current-working-tree source audit.
**Conclusion:** **The complete isolation/privacy claim is not established.** The inspected server paths contain substantial parish isolation controls, and no production-reachable foreign-parish database access was established. However, **four client account-boundary defects** can mix durable work, transport authority, or cached data across accounts. These remain relevant in a single-parish deployment. A separate server logging path unnecessarily exposes student identity.

**Findings:** 0 Critical · **4 High** · **1 Medium** · 0 Low.

“SOURCE-CONFIRMED” below means the behavior follows from inspected current code. It does **not** mean an incident occurred or a runtime reproduction passed.

---

## 1. Scope & Exact Repository State

| Item | Observed state |
|---|---|
| Workspace | `C:\brave-davinci` |
| Branch | `main` |
| HEAD | `69a5d3d825a60181f6469a220c1c70d7ef1ff6f4` |
| HEAD subject | `docs(agents): split AGENTS.md into indexed branch files with skill router` |
| Tracked dirty files | **79** |
| Tracked diff | **2,208 insertions, 932 deletions** |
| Untracked files | **11** |
| Closing state | Same branch, HEAD, status inventory and diff statistics (re-pinned at close; `GitExit=0`, line-ending warnings only) |

The audit includes the current remediation working tree — not HEAD alone. Relevant dirty areas include authentication, refresh sessions, student writes, reporting projections, backup/restore, purge, notification processing, Operations authorization/dispatch, client transport, encrypted storage, logout and sync coordination.

Relevant untracked implementation files were included:

- `server/src/utils/jwtSecretPolicy.ts`
- `src/lib/syncSessionBoundary.ts`
- `src/services/officialReporting.ts`

The remaining untracked files are tests/E2E specifications. Their presence is repository state, not evidence of failure.

### Method and limits

- Loaded current repository governance and `catevia-current-truth`; loaded `catevia-verification` for evidence closure.
- Static source inspection, targeted searches, schema/migration comparison, and inspection of existing test assertions (no test execution).
- The critical client finding paths returned by delegated review were independently reread and confirmed in source.
- The broad persistence matrix incorporates delegated source inspection; it is **not** independent deployed-schema verification.
- **No code, tests, docs, configuration, migrations or data changed.**
- **No tests, builds, servers, database imports, production requests, exploit reproductions or mutation probes executed.** (System CY safemode prohibits exploit reproduction / offensive workflows.)
- No report artifact was created during the audit; this file was written afterward at the user's explicit request.
- No Audit #01–#03 finding was automatically carried forward; changed paths were reread.

**Verification status:** **PARTIAL** for the requested end-to-end guarantees. The source audit is complete within the coverage stated below; runtime and production guarantees remain unverified.

---

## 2. Tenancy Architecture Map

```text
Deployment configuration
  DEPLOYMENT_PARISH_ID
       │
       ├─ required and slug-validated in production
       ├─ compatibility variables (PARISH_ID, SUPER_ADMIN_PARISH_ID) must agree
       │
       ▼
Database bootstrap/migrations occur during module import
       │
       ▼
Schema readiness + parish-data preflight
       │
       ├─ enumerate physical tables with parish_id
       ├─ reject NULL or foreign parish rows (table names only, no row PII)
       ▼
Seed using deployment parish
       │
       ▼
Repeat parish-data preflight
       │
       ▼
Import/receipt maintenance → notification recovery → schedulers → HTTP
```

**Important ordering qualification:** `server/src/db/index.ts:15–21` executes bootstrap, migrations, defensive synchronization and indices before the composition-root data gate. Startup preflight is therefore a **traffic/worker gate**, not a guarantee that no database mutation occurs before configuration validation.

### Request authority

```text
Access JWT
 → signature/algorithm verification (HS256 pinned)
 → JWT parish equals enforced deployment parish
 → live users lookup by (parishId, userId)
 → live status/tokenVersion/role validation
 → route/service authorization
 → parish-qualified reads and writes
```

Evidence: `server/src/middleware/auth.ts:46–112`.

### Client ownership

```text
Login response
  ├─ memory access token + document authSessionGeneration
  ├─ document tenantScope = parishId:userId
  ├─ shared localStorage account marker (parish_current_user)
  └─ encrypted Dexie state / sync queue / conflicts
```

These components **do not always transition as one identity**. Findings 001–004 concern gaps between them.

### Topology interpretation

ADR-106 (`docs/ADR_ARCHITECTURE_DECISION_RECORDS.md:3608–3622`) deliberately retains composite identities and `parishId:userId` client namespaces while operating one parish per production deployment. It does not make account separation optional.

---

## 3. Parish Identity / Trust-Boundary Map

| Entry or internal path | Parish source | Observed binding |
|---|---|---|
| Production startup | `DEPLOYMENT_PARISH_ID` | Required, validated; conflicting legacy variables rejected (`server/src/utils/deploymentParish.ts`) |
| Unconfigured development/test | Default/requested parish | Intentionally unenforced multi-parish fixture mode |
| Login | Deployment resolver | Legacy body parish ignored when enforcement is active |
| Public password recovery | Deployment resolver | Body parish cannot select another production parish |
| Access/refresh JWT | Signed parish claim | Foreign-deployment issuance and verification rejected |
| Protected requests | Validated JWT | Live account resolved by parish and user ID |
| Path/query resource IDs | Local entity ID | Must be paired with actor parish in service/query |
| JSON restore | Actor parish | Envelope checked; every inserted row forced to actor parish |
| Roster import | Actor parish | Mapping/reference checks use local parish; server generates batch identity |
| Notification enqueue | Explicit internal parish | Deployment scope assertion |
| Notification recovery | Persisted row parish | Enforced deployment predicate; recovered identity retains parish |
| Sunday scheduler | Deployment/configured settings | Enforced enumeration and direct-run scope guard |
| Operations dispatch | Persisted candidate parish | Subsequent task/event/person/notification operations use candidate parish |
| Full backup | Entire deployment database | Isolation relies on deployment database ownership, not row-filtered export |
| Client store | Document `tenantScope` | Physical key includes parish and user |
| Client queue claim | Shared account marker | Exact pair filter, but may disagree with the document's token |
| Retry / response reconciliation | Ambient session/store state | Original owner is not consistently retained across asynchronous boundaries |

The server `/api/sync` route provides only an authenticated watermark (`server/src/routes/sync.ts:5–13`). Queued mutations are sent through ordinary domain APIs. There is no server-side sync envelope here that independently proves the original local queue owner.

---

## 4. Persisted Tenant-Ownership Matrix

**Notation:** `P = parish_id`; composite identities below include `P`. “Operative” means expected from the source bootstrap/migration chain (`db/index.ts:15–21`: bootstrapSchema → MIGRATIONS → defensiveSync → bootstrapIndices), not an inspected production database.

| Family | Identity and important uniqueness | Binding / deletion behavior |
|---|---|---|
| Users, branches, academic years, permissions | Mostly `(P,id)`; users unique `(P,username)` | Role-permission references composite; year policy/target fields include soft references |
| System settings | `(key,P)` | Parish-scoped configuration |
| Students/classes | `(P,id)`; student code and idempotency keys parish-local; class code/year parish-local | Student→class; class→branch/year composite restrictions |
| Catechist assignments | `(P,id)`; scoped user/class uniqueness and active-role constraints | Composite user/class restrictions |
| Grades/attendance | `(P,id)`; grade student/year/semester and attendance student/date/type unique within parish | Composite student references; grade override cascades from grade |
| Attendance sessions | `(P,id)`; class/date/type unique within parish | Composite class restriction; individual attendance is not FK-bound to a session |
| Academic history | `(P,id)`; snapshot student/year and promotion history keys scoped | Snapshot year/student restricted; frozen class/report JSON and promotion destination fields are soft historical references |
| Exams | `(P,id)`; result session/student unique within parish | Result→session cascade and student restriction; blueprint binding includes operative triggers |
| Exam receipts/ledger/finalization | Composite parish identities, including `(P,user,clientMutationId)` | Composite session/student bindings; some grade/result provenance IDs remain soft |
| Question bank | `(P,id)`; versions and blueprint ordinal keys scoped | Composite question/version/creator/branch references; individual FKs do not alone prove question/version semantic consistency |
| Leave requests | `(P,id)` | Student cascade, class restriction; parent/reviewer fields are soft IDs |
| Finance/fees | `(P,id)`; fund code and student/year/fee keys scoped | Fund, student and class bindings exist; transaction target/student/year metadata contains soft references |
| Imports/mapping/service assignments | Mostly `(P,id)`; mapping logical key scoped; grade-import receipt uniqueness includes parish | Batch details→batch cascade; rollback JSON/polymorphic mappings require service validation |
| Audit/notices/outbox | `(P,id)`; notice idempotency parish-local | Actor/entity/aggregate links largely soft or polymorphic |
| Notifications/push/refresh/recovery/feedback | Parish-owned rows | Some credential/device uniqueness is intentionally global: token hash, endpoint, installation, provider token; feedback has sender/target and anonymity constraints |
| Parish Memory | Profile keyed by parish; people/units/records/assets use composite identities | Record-person/asset joins composite; linked users and source events include soft links with service/trigger checks |
| Calendar/Operations | Operations mostly composite; **calendar DDL exception below** | Tasks/dependencies/assignments use composite bindings (migration 260 establishes real FKs for `operation_tasks` — `migrations.ts:2394–2456`); several event relationships remain trigger-bound rather than operative FKs |
| Deployment-global infrastructure | `rate_limits(key)`, `schema_migrations(version)` | No parish column by design (`docs/07_DATABASE_PLAN.md:84–85`) |

### Source declaration/DDL conflicts

These are **not counted as demonstrated tenant-access findings**:

1. **Composite `SET NULL` versus declared cascade.**
   Operative migration uses `SET NULL` for import-detail student references (`migrations.ts:454–465`), notification student/user references (`migrations.ts:508–509`), and push-subscription user references (`migrations.ts:556`), while schema declarations say cascade (`schema.ts:530–537` for import detail; `schema.ts:457–464` for notifications; `schema.ts:556–569` for push subscriptions). Because the composite child key contains non-null `parish_id`, these actions are not equivalent.

2. **Calendar event identity drift.**
   `parish_events` operative DDL has global `id PRIMARY KEY` (`migrations.ts:1045–1062`), although the schema declaration describes `(P,id)` (`schema.ts:1244`).

3. **Triggers are not interchangeable with FKs.**
   Several exam/Operations relationship checks are implemented through insert/update triggers. They do not establish every parent-delete restriction or cascade implied by ORM declarations. Note: migration 260 does establish real operative FKs for `operation_tasks` (RESTRICT to event/workstream/parent/completed_by), so this applies to *some*, not all, Operations relationships.

4. **Readiness is not complete constraint equivalence.**
   Selected index columns, trigger names, PKs and FK violations are checked; the health contract does not inventory every FK action or trigger body. The required marker list `REQUIRED_MIGRATION_MARKERS` contains **256 entries** and ends at version `20260912-259` (`schemaHealth.ts:20–81`), while the operative migration list continues to `20260912-260` (`migrations.ts:2394–2520`). Migration execution remains fail-closed, so this is guard-coverage drift, **not** evidence of serving after a failed migration.

---

## 5. Cross-Domain Reference Map

| Relationship | Current source observation | Assessment |
|---|---|---|
| Class→branch/year; assignment→user | Queries bind ID and parish; ID-keyed maps built from parish-filtered rows (`classService.ts:12–86`) | Selected paths preserve local identity |
| Parent→student | Current account phone variants + student parish; class join also parish-bound (`parentService.ts:28–63`) | Same phone in another parish is excluded |
| Student→report/history | Student, grades, attendance, snapshots and promotion data filtered by parish (`ReportCardProjectionRepository.ts:83–179`) | Selected reporting joins preserve scope |
| Finance→student/class/fund | Base facts and joined dimensions parish-qualified (`financeService.ts:160–330`) | No foreign-parish enrichment established |
| Memory→person/user/event/asset | Selected service reference validation includes parish (`parishProfileService.ts:99–301`) | Soft link does not mean unscoped |
| Operations→task/workstream/event | Resolver loads `(P,id)` and rejects inconsistent relationships (`operationsAuthorization.ts:118–196`) | Current remediation materially strengthens binding |
| Notification→student→parent | Current student phone ownership and active original recipient set revalidated (`notificationQueue.ts:35–65`) | Old notification is not intentionally retargeted to a new parent |
| Import undo→batch details | Batch is scoped, but detail loop filters only `batchId` (`importService.ts:1980–1983`) | Conditional collision concern; production chain not established |

### Import undo: retained concern, not a production finding

`server/src/services/importService.ts:1980–1983` still selects details by batch ID alone.

However:

- The batch lookup is parish-qualified and must be eligible and recent (`1965–1975`).
- The current student lookup is parish-qualified (`1999–2001`).
- Mutation requires matching local identity and exact post-import timestamp (`2002–2007`), a valid rollback snapshot, and no protected downstream activity (grades, attendance, exams, promotions, snapshots, ledger, leaves, fees, finance, parent relink audits — `1886–1957`).
- Batch IDs are generated by the server (`importService.ts:1137`, `utils/id.ts:8–10`) rather than chosen by the import request.
- Production preflight rejects mixed-parish physical rows (`deploymentParishHealth.ts:9–44`).

Therefore, **the missing detail predicate is not promoted to a High finding without a reachable foreign-row/collision chain**. Intentional multi-parish development fixtures remain a separate concern.

---

## 6. PII Inventory & Data-Flow Map

| PII/data | Concrete flow and destination | Assessment |
|---|---|---|
| Student names, holy names, birth/sacrament dates, address, parent name/phone, notes | Roster APIs → staff UI → encrypted offline stores | Staff parish-wide roster reading is explicit policy; parent roster endpoints denied (ADR-092) |
| Student academic results/attendance | Authorized reports/exams → UI, cache, PDF/XLSX | Purpose exists; client account transitions undermine cache ownership (findings 001–004) |
| Parent phone | Account identity/linking → current student ownership checks | Parish-bound; not merely a global phone match |
| Staff/personnel identity and assignments | Users, Operations and Memory projections | Selected parish bindings inspected; complete field-level minimization not certified |
| Authentication secrets | Password processing; memory access token; HttpOnly refresh cookie; persisted refresh hash | Backup JSON profile excludes auth tables; full DB backup does not |
| Audit identity and request metadata | Audit rows / structured logs | Selected redaction exists (A16, AUDIT-F4, phone masking); raw exception paths are not universally scrubbed |
| Anonymous feedback content | Sender-null storage and targeted inbox | Logger removes userId/parishId/IP/user-agent when anonymous mode is set (`logger.ts:31–35`, `feedback.ts:53–59`); infrastructure transport metadata lies outside the application guarantee |
| Academic notifications | Generic message (`ACADEMIC_NOTIFICATION_MESSAGE`) → push provider/device | Student name/score removed from normal academic push body; current recipients revalidated before delivery |
| Student identity on enqueue failure | Report-card path → `console.error` (`smartNotifications.ts:187–188`) | **Finding 005** |
| Student internal ID on className mismatch | Absence path → `console.warn` (`notifications.ts:237–239`) | Technical identifier only; below finding threshold (observation for #22) |
| CSP reports | URI fields or truncated raw JSON (≤1000 chars) → stdout (`cspReport.ts`) | Truncation is not redaction; actual sensitive production content unknown |
| Server exceptions | Raw message/stack → stdout and optional Sentry (`index.ts:310–330`, `observability.ts`) | `sendDefaultPii:false` does not scrub manually supplied exception contents |
| Client exceptions/conflict identifiers | Sentry capture paths (`syncProcessor.ts:254–257`, `core.ts:389–431`) | Actual vendor configuration and full-PII payloads unknown |
| Backup/safety snapshot | Local filesystem (chmod 0600 for `safety/`) or R2 (`blobStorage.ts`, `safetySnapshot.ts`) | Full PII present by recovery purpose; access policy, retention success and namespace separation not verified |
| Public signed QR | Signed identifiers → minimal student identity (code/holyName/fullName/class), not grades (`verification.ts:86–137`) | Foreign signed parish rejected; bearer-link lifetime and operational exposure unverified |

---

## 7. High-Risk Path Analysis

### Backup, restore and purge

**Observed strengths**

- Export requires admin reauthentication (`backup.ts:219–228`) and filters every exported table by actor parish (`backup.ts:275–318`).
- Restore requires an envelope parish match (`backup.ts:365–368`).
- `upsertAll` overwrites row `parishId` with the authenticated parish and uses `(parishId,id)` conflict targets (`backup.ts:176–190`).
- Destructive work and authority revalidation occur inside the restore transaction (`backup.ts:540–543`).
- Current restore blocks unsupported lifecycle/dependency state instead of silently deleting omitted provenance (`backup.ts:33–86`, rechecked at 542–543).
- Successful restore advances the client reset generation in the same transaction (`backup.ts:610–615`).
- Purge requires admin reauth + confirm key and is parish-scoped (`system.ts:26–63`).

**Limits**

- JSON restore remains a partial interchange profile, not full disaster recovery.
- Its row schema accepts arbitrary records (`z.record`); forced top-level parish does not prove every embedded JSON reference is semantically local.
- Full backups cover the whole deployment database.
- Safety snapshots contain plaintext JSON at the application layer before storage; local safety files attempt mode `0600` (`blobStorage.ts:87–91`). R2 policy, IAM and provider-side encryption were not inspected.
- Backup retention lists the shared `backups/` prefix (`backupScheduler.ts:106–120`); separate deployment buckets/prefixes are not proven.
- Local full SQLite backup files do not receive the explicit chmod call shown for `safety/` files. Actual filesystem exposure is unknown.

### Imports and maintenance

Current import reference checks and undo downstream-activity checks are substantial. The id-only detail loop remains conditional as described in §5.

A separate startup conflict exists: migration code seeds four funds under hardcoded `gia-ton` (`migrations.ts:942–947`). An otherwise fresh enforced non-`gia-ton` deployment can consequently encounter the pre-seed mixed-parish gate. This is a **conditional provisioning/startup problem**, not evidence that foreign rows are served.

### Workers

- Notification recovery is deployment-filtered; enqueue rejects a foreign explicit parish (`notificationQueue.ts:147–218, 229`).
- Sunday reminder processing has deployment-aware enumeration/direct-run checks (`sundayReminderScheduler.ts:33, 54`).
- Operations dispatch initially enumerates due candidates globally but carries each candidate parish through task/event/person lookup, eligibility, notification insertion and claim update (`operationsTaskDispatchService.ts:18–50`).
- Other Operations scheduler source predicates show the same row-parish pattern (`operationsEventLifecycleService.ts`, `operationsReminderService.ts`, `operationsManagerReminderService.ts`), but exhaustive post-start ingestion and all maintenance execution contexts were not established. A missing deployment predicate alone is not treated as a vulnerability.

### Client/offline

Encrypted scoped storage is present (`db.ts:161–201` — AES-GCM with AAD `stores:<scopedKey>`), but encryption cannot compensate for assigning data to the wrong active account. Findings 001–004 identify four distinct transition boundaries:

1. stale live state;
2. shared-marker/per-document identity divergence;
3. retry dispatch after identity change;
4. response application after identity change.

Legacy quarantine behavior is fail-closed (`syncStore.ts:142–159`); legacy missing-parish rows are quarantined rather than adopted.

### Public surfaces

- Public recovery resolves the deployment parish and returns a generic accepted response (`passwordResetRequests.ts:40–47`).
- QR verification rejects foreign signed parish and queries student/class by parish (`verification.ts:98–137`).
- CSP collection is public by design and bounded by global rate/body limits, but includes unredacted URI/raw-content logging (`cspReport.ts:30–50`).
- No production enumeration or public-PII incident was demonstrated.

---

## 8. Findings — P0 → P3

### TENANT-P1-001 — Exam state survives logout and can become accessible under the next account

**Severity:** High
**Truth:** SOURCE-CONFIRMED; exposure window depends on next-account hydration/fetch state.
**Data:** Student names, codes, holy names, scores, exam sessions and queued-result metadata.
**Parish source:** Outgoing document scope A, followed by incoming document scope B.

**Reachable chain**

Normal logout/login transition → incomplete live-store reset → absent incoming persisted snapshot preserves current exam singleton → exam UI reads retained results → subsequent persistence uses the incoming account namespace.

**Observed evidence**

- `src/stores/resetStores.ts:14–44` does not reset exam or notice stores (nor settings/academic-year stores — see corroboration below).
- Logout nulls scope and calls that reset: `src/stores/authStore.ts:225–234`.
- Login invokes the same reset before scope activation/hydration: `authStore.ts:174–180`.
- Installed Zustand merges current state when storage returns no persisted value: `node_modules/zustand/middleware.js:337–340, 392–423`.
- Exam loading retains cache offline and on failure: `src/stores/examStore.ts:226–239`.
- Sessions, selected session and results are persisted: `examStore.ts:698–705`.
- UI consumes retained results without owner filtering: `ExamSessionView.tsx:158–162, 256–265, 1148–1154`.
- Result rendering includes student identity and score: `ExamResultsTable.tsx:158–167`.

**Corroboration (v1.1):** `resetStores.ts` also omits `settingsStore` and `academicYearStore`. Both are rehydrated via `rehydrateTenantStores` (`tenantScope.ts:33–46`) and therefore follow the same merge-without-clear mechanism. Lower PII sensitivity than exam; not a separate finding, severity unchanged.

**Normative truth:** Protected privacy/cache invariants (`.agents/protected-invariants.md:13–14`) and ADR-106's retained `parishId:userId` ownership boundary.

**Consequence:** A subsequent account with exam UI access can see data retained from the previous account and can persist that state under its own namespace. This is **accessible cross-account data**, not merely inaccessible encrypted device retention.

**Boundary:** Same-parish account exposure does not require multiple production parishes. Cross-parish exposure additionally requires the origin to retain/serve identities from different parishes. Note: the untracked `authLogoutLifecycle.test.tsx` mocks `resetStores` + `rehydrate` (lines 9–14), so its assertions do not cover this chain.

---

### TENANT-P1-002 — Shared account marker can disagree with the tab's transport identity

**Severity:** High
**Truth:** SOURCE-CONFIRMED identity split; specific server acceptance depends on endpoint authority.
**Data:** Queued student/academic mutations, returned records and attribution.
**Parish source:** Shared localStorage marker versus per-document token and tenant scope.

**Reachable chain**

Multiple normal application tabs → one tab changes account → another tab retains its memory token/scope → queue selection follows the new shared marker → payload dispatch uses the other tab's token.

**Observed evidence**

- Queue owner is reread from shared `parish_current_user`: `src/stores/syncStore.ts:53–95`.
- Pending selection and claim use that owner: `syncStore.ts:211–237`.
- Tenant scope is document-local: `src/lib/tenantScope.ts:6–26`.
- Transport attaches its memory token: `src/lib/api/core.ts:309–311`.
- No storage-event/BroadcastChannel identity synchronization was found in `src`.
- Refresh accepts the token returned through the shared cookie without comparing its identity to the active store/scope: `core.ts:133–165`.
- Server refresh returns only `accessToken`; `/me` omits parishId: `server/src/routes/auth.ts:387–426`.

**Normative truth:** ADR-016 explicitly forbids logged-out-user work syncing under another session (`ADR_ARCHITECTURE_DECISION_RECORDS.md:272`).

**Consequence:** Local work can be submitted under a different valid account, producing wrong attribution or wrong-authority mutations where that account is permitted to perform the operation. Refresh can also invert the mismatch: a new token with stale document identity/cache scope.

**Boundary:** This is not proof of JWT forgery or server authorization bypass. Server resource checks still apply (`middleware/auth.ts:78–112`). Single-parish topology does not resolve the user-identity split.

---

### TENANT-P1-003 — Retry backoff rebinds an existing request to the next session

**Severity:** High
**Truth:** SOURCE-CONFIRMED; timing-sensitive account transition.
**Data:** Original request body, including student/parent PII and academic changes.
**Parish source:** Original request owner is replaced by the ambient session on recursive retry.

**Reachable chain**

An authorized operation enters ordinary network/5xx retry backoff → session changes while awaiting the delay → recursive `request()` captures the new token/generation → original path/body is dispatched under the new account.

**Observed evidence**

- Token and generation captured for each invocation: `src/lib/api/core.ts:309–311`.
- Generation checks precede the backoff, but recursion establishes a fresh generation: `core.ts:325–343, 373–380`.
- A real queued student CREATE reaches an auto-retry-enabled call: `src/lib/syncProcessor.ts:93–102`; `src/lib/api/students.ts:21–25`.
- Server student writes use the currently authenticated actor/parish, not an independently attested original queue owner: `server/src/routes/students.ts:71–95` (route) → `studentService.ts:181–184` (actor parish).

**Normative truth:** Durable operation ownership must survive retry; ADR-016 account isolation.

**Consequence:** An earlier account's payload can be submitted and attributed to the next account. Where its references and authority are valid, it may be accepted as that account's operation.

**Boundary:** Actual acceptance is conditional on the new account's permissions, valid references and request timing. No runtime reproduction or production occurrence is claimed.

---

### TENANT-P1-004 — Returned sync data can be applied after the active owner changes

**Severity:** High
**Truth:** SOURCE-CONFIRMED missing response-to-application binding; timing-sensitive.
**Data:** Grade/attendance records, exam reconciliation and conflict data.
**Parish source:** Original operation/response owner versus current singleton/persistence scope.

**Reachable chain**

An original-account response completes successfully → asynchronous queue retirement/delay overlaps an account transition → reconciliation applies the response to current stores without validating original ownership → persistence uses the incoming account's scope.

**Observed evidence**

- Individual processing awaits a delay after receiving the result: `src/lib/syncCoordinator.ts:371–389`.
- Batch saved results await queue removal before unguarded application: `src/lib/syncApply.ts:280–302`.
- `applyServerResultAsync` lacks an entry owner/generation check and writes grade/attendance data into current stores: `syncApply.ts:96–180`.
- Dexie persistence uses the current scoped key: `src/lib/db.ts:192–195`.
- Conflict path awaits decrypt, stores diagnostics with ambient user/parish, then merges/requeues using ambient ownership (`syncApply.ts:53–88`; `syncStore.ts:367–389`).

**Normative truth:** Tenant/user scope must survive acknowledgment, reconciliation and conflict handling — not just network dispatch.

**Consequence:** Correctly authorized data returned for one account can contaminate another account's live cache and persisted namespace. This is distinct from finding 003: the response has already arrived; no wrong-token server request is required.

**Boundary:** CREATE acknowledgment has explicit ownership checks at `syncApply.ts:198–205`; this finding does not label every acknowledgment path unguarded.

---

### TENANT-P2-001 — Report-card enqueue failure logs student name and class

**Severity:** Medium
**Truth:** SOURCE-CONFIRMED error-path disclosure; occurrence requires an enqueue failure.
**Data:** Student name and class, potentially additional raw exception content.
**Parish source:** Authenticated report-card request parish.

**Privacy chain**

Student report request → normalized student list → report-card notification enqueue → operational failure → student name/class interpolated into stdout log.

**Evidence**

- Active route invokes the batch function: `server/src/routes/notifications.ts:256–297`.
- Batch failure handler logs `${s.studentName} (${s.className})`: `server/src/services/smartNotifications.ts:175–188`.

**Normative truth:** Student PII must be minimized in logs/errors (`.agents/protected-invariants.md:13–14`). Normal academic push processing already uses a generic message (`ACADEMIC_NOTIFICATION_MESSAGE`), demonstrating that child identity is not required for delivery diagnostics.

**Consequence:** Child identity and class membership enter operational log access/retention scope unnecessarily. This is a concrete PII-to-log path, not a general claim that all exceptions contain PII.

**Boundary:** Log readership, retention and actual failure incidence were not inspected; no disclosure incident is asserted.

---

## 9. Evidence Conflicts & Unknowns

The following **12 unknowns** are tracked separately from counted findings:

1. **Actual production configuration/topology:** deployed parish, origin, database and worker configuration not inspected.
2. **Actual deployed schema:** migration markers, FK actions, triggers and existing data not queried.
3. **Post-start alternate ingestion:** no complete proof that external maintenance/direct writers cannot introduce foreign-parish rows after preflight.
4. **Import collision reachability:** no established production chain producing the required same-batch/local-student rollback conditions.
5. **Embedded/soft references:** exhaustive semantic binding of restored JSON, historical metadata and every polymorphic link not established.
6. **Fresh non-default provisioning:** handling of hardcoded `gia-ton` migration seed data before the gate is unknown.
7. **Client runtime frequency/acceptance:** account-switch findings were not executed; browser timing and endpoint-specific acceptance remain conditional.
8. **Telemetry destination controls:** Sentry enablement, scrubbing, SDK enrichment, retention and readership unknown.
9. **CSP sensitive content:** unredacted URI/raw logging exists; actual sensitive report payloads and infrastructure URL logging unknown.
10. **Backup storage isolation/privacy:** bucket sharing, IAM, filesystem ACLs, local file exposure and retention success unknown.
11. **Public-link and anonymity operational guarantees:** QR lifetime/referrer exposure and infrastructure-level feedback correlation unknown.
12. **Complete field-level necessity:** all personnel/Operations/Memory projections, notification history and parent-facing alternate readers were not exhaustively assessed for purpose/minimization.

**Evidence conflicts:** ORM schema is not the operative DDL; historical “zero cross-user leakage” claims in ADR-016 are not supported by the current client transition paths; inspected test assertions are not current test passes.

---

## 10. Demonstrated Strengths

1. Production parish configuration is explicit and fail-closed (`deploymentParish.ts:20–50`).
2. Startup scans every physical table containing `parish_id` via `sqlite_master`, rather than a fixed table list (`deploymentParishHealth.ts`).
3. Foreign-parish token issuance/verification is rejected (`middleware/auth.ts:46–76`).
4. Live user status, role and token version are checked against `(parish,user)` (`middleware/auth.ts:89–100`).
5. Selected joins preserve parish through both SQL joins and ID-keyed projections.
6. JSON restore forces row ownership and uses composite conflict targets (`backup.ts:176–190`).
7. Current restore rechecks authority/dependency state inside its destructive transaction (`backup.ts:540–543`).
8. Parent ownership derives from current parish-scoped account/student state (`parentService.ts`).
9. Academic notification bodies are generic; current recipients are revalidated before delivery.
10. Encrypted Dexie keys and AAD include the exact scoped store key (`db.ts:161–201`).
11. Revoked-session queue quarantine (`syncSessionBoundary.ts:46–87`) and CREATE acknowledgment ownership checks (`syncApply.ts:198–205`) exist; they do not cover every asynchronous boundary.
12. Existing same-ID isolation tests (domain2SameIdIsolation, crossDomainHistory, parishProfile, questionBank, operations) cover important scenarios as **assertions inspected, not executed**.
13. Anonymous feedback applies targeted log redaction (`logger.ts:31–35`).

---

## 11. Coverage / Blind Spots

| Area | Coverage |
|---|---|
| Deployment configuration, JWT and startup gates | **AUDITED** — static source |
| Restore/export ownership and current destructive guards | **AUDITED** — static source |
| Client reset, queue ownership, retry and response application | **AUDITED** — critical source paths independently reread |
| Notification generic payload and report failure log | **AUDITED** — static source |
| Persisted ownership/constraint families | **PARTIALLY_AUDITED** — broad delegated matrix; selected independent checks |
| Cross-domain references | **PARTIALLY_AUDITED** — selected material readers/writers |
| Import/undo and maintenance | **PARTIALLY_AUDITED** |
| All Operations schedulers and external worker contexts | **PARTIALLY_AUDITED** |
| Public surfaces and anonymous feedback | **PARTIALLY_AUDITED** |
| Complete response/log/telemetry field minimization | **PARTIALLY_AUDITED** |

### NOT_AUDITED areas — 6

1. Live production database, configuration, traffic and incident records.
2. Runtime collision, multi-tab/account-switch and fault-injection behavior.
3. Full database disaster-recovery execution and post-restore validation.
4. Native device/OS backup, notification display and downloaded-file lifecycle.
5. Infrastructure/vendor IAM, access logs, storage policies and telemetry retention.
6. Exhaustive every-route/every-query/every-script verification beyond the selected material paths.

No repository gate or test suite is reported as passing.

---

## 12. Handoffs

These are evidence handoffs, **not remediation plans**.

| Audit | Evidence requiring follow-through |
|---|---|
| **#05 Database** | Operative/schema FK-action drift (SET NULL vs CASCADE: import detail, notifications, push subscriptions); calendar global PK; trigger-vs-FK differences; readiness/marker-coverage gap (256 markers end at 259, operative 260 exists) |
| **#06 Disaster Recovery** | Partial JSON profile versus full backup; hardcoded `gia-ton` seed/preflight interaction for fresh non-default provisioning; storage namespaces, retention and file permissions |
| **#07 Sync/Offline** | Findings 001–004; original-owner continuity across tabs, retries, queue retirement, conflict handling and response application; server refresh/me response shape relevant to identity binding |
| **#13 Reports** | Current official server projections are a strength; export lifetime, public signed-identifier semantics and transport identity races remain relevant |
| **#15 Parent** | Current phone-based ownership and notification recipient revalidation; full alternate parent reader/minimization coverage remains partial |
| **#21 Device** | Accessible exam singleton carryover (finding 001) versus retained encrypted queues; OS backup, local downloads and lock-screen notification behavior |
| **#22 Observability** | Finding 005; raw exception forwarding; CSP URI/raw logs; `notifications.ts:237–239` student-ID mismatch log; anonymous-feedback correlation limits and vendor retention |

**Bottom line:** The inspected server implementation supports the intended single-parish model, but that model does not establish end-to-end user isolation. The current client can lose owner continuity at multiple lifecycle boundaries, and those are material even when every server row belongs to one parish.

---

## Addendum v1.1 — Post-review citation corrections

An independent review found citation mapping errors; all were verified against source and corrected in this version. No conclusion or severity changed:

1. **§7 evidence mapping fixed:** `backup.ts:176–190` is the `upsertAll` composite-identity function; export re-auth is `219–228` and parish filtering is `275–318`. (Original draft had attributed the 176–190 range to export.)
2. **§4 drift citations fixed:** schema cascade declarations are at `schema.ts:530–537` (import detail) and `schema.ts:457–464` (notifications); push subscriptions at `schema.ts:556–569`. All three SET NULL (operative) vs cascade (schema) drift pairs confirmed.
3. **Marker-list wording corrected:** the list ends at version `20260912-259` but contains 256 entries (4 historical versions excluded via `migrationRange`).
4. **Finding 001 corroboration added:** `settingsStore`/`academicYearStore` are also omitted from `resetStores`; same mechanism, lower sensitivity, no severity change.
5. **Additional observation logged (not a finding):** `notifications.ts:238` logs `student.id` on className mismatch — internal identifier only, below finding threshold.
6. **Operations FK scope clarified:** migration 260 establishes real operative FKs for `operation_tasks`; the trigger-vs-FK finding applies to *some*, not all, Operations relationships.

---

```text
AUDIT COMPLETE — READ ONLY
Audit ID: 04 (v1.1)
Critical findings: 0
High findings: 4
Medium findings: 1
Low findings: 0
Unknowns: 12
NOT_AUDITED areas: 6
```
