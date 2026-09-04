# Agent Guide — Catevia / TNTTVN

> Repository: `TNTTVN` (`billfan157-pixel/TNTTVN`)
> Internal codename: `brave-davinci`
> Product: `Catevia`

This file is the repository **navigation and invariant map**, not a complete engineering manual.

Do not preload every linked document or skill. Retrieve only the context needed for the current task.

---

## 1. Operating Contract

For every task:

1. Understand the requested behavior and affected scope.
2. Inspect relevant current implementation before making claims or edits.
3. Preserve protected project invariants.
4. Make the minimum sufficient change.
5. Run verification appropriate to the changed scope.
6. Update authoritative documentation only when its documented truth changed.
7. Report evidence, verification, and unresolved risk accurately.

Never treat documentation alone as proof of current runtime behavior.

Never represent inference as verified fact.

---

## 2. Progressive Context Loading

### Default startup

Start with this `AGENTS.md`.

Do **not** automatically read:

* the full Decision Matrix;
* the full `AI_CONTEXT_MAP.md`;
* the full ADR archive;
* the full business-rules document;
* every architecture/security/database document.

Search and retrieve relevant sections only.

### Task classification

Classify the task before loading additional governance.

**D0 — Trivial**

Examples: typo, copy, formatting, obvious non-behavioral cleanup.

Do not load Decision Matrix.

**D1 — Local**

Localized behavior or UI/code change with low blast radius and no protected boundary.

Use normal repository inspection and targeted verification.

Do not load Decision Matrix unless a protected boundary is touched.

**D2 — Cross-module / material**

Affects multiple modules, shared state, API contracts, persistence, cross-layer behavior, important business behavior, or a significant dependency.

Load:

`.gemini/skills/decision-matrix/SKILL.md`

**D3 — Critical**

Affects one or more of:

* authentication or authorization;
* tenant/parish isolation;
* sensitive personal data;
* data integrity;
* offline synchronization semantics;
* schema/data migration;
* financial records;
* grade/exam finalization or semester locks;
* destructive or difficult-to-reverse operations;
* backup/restore;
* security boundaries;
* production infrastructure or transaction boundaries.

Load:

`.gemini/skills/decision-matrix/SKILL.md`

D3 requires applicable hard gates and recovery analysis.

---

## 3. Protected Catevia Invariants

Treat these as protected boundaries unless an explicit approved requirement intentionally changes them.

### Security and tenancy

* Backend authorization is authoritative.
* Hidden navigation or UI state is never an authorization boundary.
* Cross-parish access must fail closed.
* Role/class-scope enforcement must remain server-authoritative.
* Sensitive student/parent/personnel data must be minimized and must not leak into logs, errors, analytics, caches, or unrelated API responses.

### Data integrity

* Do not introduce silent data loss or silent partial success.
* Critical multi-row/domain operations must preserve their intended transaction boundary.
* Idempotency and concurrency semantics must not be removed accidentally.
* Finalized/locked academic or financial state must not be bypassed from the client.

### Offline synchronization

Do not simplify offline code without tracing its synchronization contract.

Preserve, where applicable:

* durable mutation ownership;
* tenant/user scoping;
* temporary-ID → server-ID remapping;
* parent/dependent mutation ordering;
* idempotency;
* retry semantics;
* conflict policy;
* OCC/version behavior;
* pull/reconciliation behavior.

Complexity that protects these invariants is not automatically technical debt.

### Business behavior

Do not infer intended business rules solely from code.

If intended behavior is unclear, inspect the relevant approved business rule and ADR before declaring a bug or changing behavior.

---

## 4. Context Router

Retrieve the smallest relevant slice.

| Concern                          | Inspect first                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Architecture / module boundaries | `docs/02_ARCHITECTURE.md` + relevant ADR section                                              |
| Current recent project context   | Search `docs/AI_CONTEXT_MAP.md` by feature/module/date; do not read the whole file by default |
| Business behavior                | Relevant section of `docs/BUSINESS_RULES.md`                                                  |
| Architecture decisions           | Search `docs/ADR_ARCHITECTURE_DECISION_RECORDS.md` by ADR ID/domain keyword                   |
| API contract                     | `docs/FRONTEND_API_CONTRACT.md` + current client/server implementation                        |
| Database/schema/migration        | current schema + migrations + relevant `docs/07_DATABASE_PLAN.md` section                     |
| Security/RBAC/privacy            | middleware/routes/services/tests + relevant `docs/SECURITY_AUDIT_LOG.md` section              |
| Offline/sync                     | sync engine/services/Dexie stores/tests + relevant architecture/ADR sections                  |
| Exams/grades/attendance/finance  | current route → service/domain → persistence → tests → applicable business rule               |
| Design system/UI                 | `docs/03_DESIGN_SYSTEM.md`, `DESIGN_SYSTEM.md`, relevant primitives and design-system guard   |
| E2E/testing                      | `docs/08_E2E_TESTING_STRATEGY.md`, affected tests, current CI                                 |
| Deployment/runtime               | `docs/DEPLOYMENT_GUIDE.md`, runtime config and `.github/workflows/ci.yml`                     |

Prefer repository search by:

* function/class name;
* route;
* table;
* ADR ID;
* business-domain keyword;
* error message;
* invariant.

Widen retrieval only when evidence is insufficient or contradictory.

---

## 5. Truth Model

Keep two questions separate.

### Normative truth

What the system **should** do.

Sources can include:

* explicit current product requirement;
* security/privacy/compliance constraint;
* approved business rule;
* current approved ADR;
* API/schema contract;
* authoritative architecture specification.

### Observed truth

What the system **currently does**.

Prefer:

1. verified runtime/production evidence;
2. reproducible test/benchmark evidence;
3. current implementation/schema/configuration;
4. documentation claims;
5. agent inference.

A normative document does not prove implementation compliance.

Current implementation does not automatically redefine intended behavior.

If normative and observed truth differ, identify the drift rather than silently choosing one.

---

## 6. Implementation Rules

Before editing:

* trace the affected path far enough to understand ownership and invariants;
* reuse established project patterns where they remain appropriate;
* avoid unrelated cleanup;
* do not perform speculative architecture rewrites;
* do not introduce microservices or new infrastructure merely to make code appear cleaner;
* do not change public contracts unintentionally.

For refactoring, prove that protected observable behavior remains unchanged.

For a new behavior, treat it as a behavior change rather than hiding it under the label “refactor.”

---

## 7. Verification

Verification must support the claim being made.

Before choosing commands, inspect current:

* `package.json`;
* relevant workspace package files;
* `.github/workflows/ci.yml`.

Use the smallest sufficient verification set.

### D0 / D1

Prefer targeted checks for the changed surface.

Do not run an expensive unrelated suite merely as ritual.

### D2

Run:

* relevant targeted tests;
* applicable static/type/build checks;
* contract/integration tests for affected boundaries.

### D3

In addition to targeted verification, run applicable critical invariant/security tests.

Use E2E when the claim depends on a real cross-layer user workflow.

Use broad CI-equivalent verification when the change is broad, infrastructure-sensitive, release-critical, or when required by the repository workflow.

Never hide, delete, weaken, or skip a relevant failing test merely to obtain green output.

Unrelated pre-existing failures must be reported separately from failures caused by the change.

---

## 8. Documentation Synchronization

Documentation synchronization is **truth-based**, not change-count-based.

Update a document only when the truth it owns changed.

Examples:

* architecture boundary changed → architecture/ADR;
* approved business behavior changed → business rules;
* public API contract changed → API contract;
* schema/migration truth changed → database documentation;
* security boundary/finding changed → security SSOT;
* test strategy changed → E2E/testing strategy.

Do not update architecture or ADR documents for an internal implementation change when their documented truth remains accurate.

Do not append implementation-history noise to SSOT documents merely because code changed.

When code and an authoritative document disagree:

1. determine whether this is implementation drift or an intentional requirement change;
2. resolve the contradiction;
3. update the correct side.

---

## 9. Agent Skill Activation

Load `.gemini/skills/decision-matrix/SKILL.md` only when:

* the task is D2 or D3;
* the user explicitly requests an architecture/security/risk audit;
* meaningful technical alternatives must be compared;
* a protected invariant may change.

Do not load it for routine D0/D1 tasks unless evidence shows the task crosses a protected boundary.

The legacy `prompt-execution-workflow` skill is not part of the mandatory execution path. The operating workflow is defined by this file and the selectively loaded Decision Matrix.

---

## 10. Delivery

For completed implementation work, report:

* what changed;
* why;
* important evidence/invariants considered;
* verification actually run and its result;
* documentation changed, if any;
* unresolved or residual risk.

For audits, distinguish clearly between:

* verified findings;
* conditional findings;
* unknowns;
* recommendations.

Never inflate certainty to make a report look complete.

---

## 11. Instruction Scope

If a more specific `AGENTS.md` exists deeper in the directory tree, obey it for files within its scope.

More-specific repository instructions override broader repository guidance when they do not conflict with direct system, developer, or user instructions.

Keep future root-level instructions small, stable, high-signal, and repository-wide.
