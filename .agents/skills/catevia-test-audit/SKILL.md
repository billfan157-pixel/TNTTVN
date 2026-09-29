---
name: catevia-test-audit
description: >-
  Author, review, and audit Catevia/TNTTVN tests for meaningful regression
  protection, duplicate coverage, misleading assertions, and unnecessary
  test-only production seams. Use when adding or changing tests, reviewing
  test quality, or explicitly pruning a test surface. Supports Vitest,
  Testing Library, Playwright, and Node tooling tests under Catevia governance.
  Does not authorize production changes, broad pruning, or publication.
license: MIT
---

# Catevia Test Audit

Adapted from [OpenClaw test-audit](https://github.com/openclaw/openclaw/tree/4ab72dd0d2c2cc335569da0603f7778f276a1717/.agents/skills/test-audit).
Upstream revision: `4ab72dd0d2c2cc335569da0603f7778f276a1717`.
This is a Catevia workflow; it requires no OpenClaw tools, runners, or services.

## Entry and scope

Read root/scoped `AGENTS.md` and classify the actual task first. Use
`catevia-current-truth` for investigations, `catevia-change-impact` before
material remediation, and `catevia-verification` before completion claims.
This skill supplements those owners; it does not replace their contracts.

- **Author/review:** apply the value checks to the tests being changed.
- **Focused audit (default):** inspect one coherent production owner and its
  related tests. Discovery is read-only; present evidence before cleanup.
- **Broad audit:** only when the user explicitly requests a subsystem-wide
  sweep. Define the subsystem and complete inventory before starting; do not
  turn a focused task into a repository-wide deletion campaign.

Pin HEAD, branch, and dirty state. Preserve concurrent work. Do not edit source,
tests, or shared fixtures while Vitest runs in that checkout. Keep scratch
probes and reports outside tracked application files.

## Value checks before writing or judging a test

Answer these briefly in the working notes or review; avoid ritual documentation
for obvious cases:

1. Which observable outcome or independent contract is protected?
2. Which plausible defect would make the assertion fail for the intended reason?
3. Which existing test owns that contract, and what distinct risk needs another
   case? Prefer extending its fixture/table to replaying the same scenario.
4. Does the test demand an export, bypass, flag, or wrapper used only by tests?
   Prefer the existing production entrypoint instead.

Judge assertions and inputs, not titles. A rounding test needs values that
distinguish rounding policies; a shutdown test claiming to await must detect
loss of waiting. Regression evidence should show the intended failure before
the repair and success afterward, where practical. Unshown baseline failure
remains unverified regression protection.

## Discovery and retention

Search with `rg`; read the complete candidate, including parameter rows, its
production owner, real callers, dependencies and overlapping proof. Inspect
targeted history when intent or origin matters, plus current CI routing.

Investigate assertions that merely mirror implementation: literal TSX/classes,
identifier/import strings, copied inventories, expected values calculated by
the code under test, mocks supplying the claimed decision or receipt,
assertion-free execution, repeated contracts, and test-only production seams.
These are leads, not automatic deletion rules.

Retain independent configuration, architecture, security, storage, migration,
platform, release and public-contract guards. Source inspection is acceptable
when it is the cheapest independent contract check. Narrow its claim to what
it actually proves; parse structured configuration/imports or inspect generated
artifacts when string matching cannot enforce the stated contract. A static
test does not prove browser geometry, asynchronous cancellation or transaction
visibility. A shared shell/helper test does not automatically cover consumer
wiring. E2E and integration tests may protect different risks in the same flow.

Respect Catevia's protected boundaries:

- Authorization denials use otherwise-valid payloads and the intended guard;
  verify persisted state where mutation is relevant. UI hiding is no authority.
- Preserve tenant isolation, transaction ownership, OCC/idempotency, offline
  queue ownership/convergence, locks, finalization and historical evidence.
- Mock external transport or device boundaries where necessary; let real
  policies/services produce the business outcome. Do not treat a mock's
  implementation as proof of the production implementation.
- Do not equate a passing test with coverage of unexercised branches. An owner
  failure is a possible product defect; never delete it to make cleanup pass.

## Candidate ledger and edit gate

For each proposed change record:

- exact file/test name and current revision;
- the failure the existing assertion actually detects;
- production owner and non-test callers of any proposed seam removal;
- keeper test and the same-contract cases it covers, or why no contract exists;
- relevant history, confidence, residual gaps and focused validation command;
- proposed test/support/production change and risk.

Mark **retain**, **repair**, **consolidate**, or **delete**. Missing equivalent
proof means retain/repair, not delete. Show the ledger before implementation.
Proceed with changes inside the user's authorized scope; otherwise deliver
findings. Changes to normative docs/rules follow the owner's approval contract.

Make one coherent batch. Preserve unique cases in the keeper before removing
duplicates. Remove an unused seam only after production-callsite search and
proof relocation; do not create compatibility aliases solely for tests.
Do not optimize for deleted LOC or lower runtime at the expense of confidence.

## Catevia execution map

Re-read `package.json`, `server/package.json`, `vitest.config.ts`,
`playwright.config.ts` and `.github/workflows/ci.yml` for the affected boundary.
The commands below are routing examples, not a frozen replacement for CI.
Run from the current repository root; use installed dependencies.

```powershell
# Frontend/server unit, component and integration tests share the root Vitest config.
npm test -- src/__tests__/examScanGuide.test.ts --fileParallelism=false
npm test -- server/src/__tests__/utils/gradeCalculation.test.ts --fileParallelism=false

# Deployment/script tooling has a separate Node runner and is outside Vitest include.
node --test tools/cloudflare-free-feasibility/detect-password-cpu-retries.test.mjs

# Browser proof only for a claim requiring real browser/cross-layer behavior.
npx playwright test e2e/critical-offline-lifecycle-exam.spec.ts --project=chromium --grep "Smart Exam"

# Broader existing gates when applicable to implementation or merge claims.
npm run test:security-critical
npm run verify:ci
npm run test:e2e:critical
git diff --check
git diff --numstat
```

Use Node tests for `.test.mjs` tooling; an `npm test` pass does not include them.
Use Testing Library for component interaction and Vitest for real policies/DB
contracts. Use Playwright for computed layout, focus/keyboard and real journeys.
Select browser projects for the risk being asserted; do not drop configured CI
browser coverage. OMR browser/helper tests do not qualify physical camera accuracy.

Before DB-backed execution, verify temporary sandbox ownership and that inherited
remote credentials cannot override it. Never load production `.env` for audit
proof. Prefer fixtures and offline CLI dry-runs to a live deployment, tail,
migration, restore or external writer. Such actions need their own task authority.

Run focused owner/sibling tests first. After cleanup, inspect the diff for lost
cases and run the applicable gates through `catevia-verification`. Use a safe
negative control when an assertion's ability to catch a defect is uncertain:
prefer external/in-memory probes, or an isolated checkout; never mutate a dirty
shared owner just to demonstrate a test weakness. Record commands, status,
source state and gaps. Static analysis alone remains static evidence.

## Explicit broad audit

Partition the approved subsystem by production ownership. Inventory every test,
shared fixture and QA scenario in scope, with a baseline result and a ledger
decision for every declaration. Assign one primary keeper per contract and
preserve distinct transport, lifecycle and platform cases. A partial inventory
is a partial audit, not a completed campaign.

Use parallel read-only agents only when explicitly authorized by the user or
applicable instructions. Serialize shared edits and test runs. Before each batch
lands, independently review the removed coverage against keepers; resolve every
potential lost contract. Reconcile later concurrent changes and rerun affected
proof. There is no automatic bulk deletion or automatic commit/PR/push.

## Handoff

Report scope/revision, retained contracts, evidence-backed candidates, actual
defects separately from weak coverage, commands/results and unresolved proof.
For cleanup, state production/tooling versus tests/support LOC and publication
state. Name the next bounded batch; do not claim full CI or production readiness
from focused audit checks.
