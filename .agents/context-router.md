# Context Router — Catevia / TNTTVN

> Parent: root `AGENTS.md`
> Scope: retrieve the smallest relevant repository slice for the current task.
> Widen retrieval only when evidence is insufficient, contradictory, or reveals
> another material boundary.

| Concern | Inspect first |
| ------- | ------------- |
| Architecture / module boundaries | `docs/02_ARCHITECTURE.md` + relevant ADR |
| Recent project context | Search `docs/AI_CONTEXT_MAP.md` by feature/domain/date |
| Business behavior | Relevant `docs/BUSINESS_RULES.md` section |
| Architecture decisions | Search `docs/ADR_ARCHITECTURE_DECISION_RECORDS.md` |
| API contract | `docs/FRONTEND_API_CONTRACT.md` + current client/server implementation |
| Database/schema/migration | Current schema + migrations + relevant `docs/07_DATABASE_PLAN.md` section |
| Security/RBAC/privacy | Middleware/routes/services/tests + relevant security SSOT |
| Offline/sync | Sync engine/Dexie/services/tests + applicable architecture/ADR |
| Exams/grades/attendance/finance | Current writer → persistence → readers/tests → applicable business rule |
| Operations | Current routes/services/domain/authorization/tests + applicable Operations ADR/plan |
| Design system/UI | `.agents/rules/ui-design-system.md` + `docs/03_DESIGN_SYSTEM.md` |
| E2E/testing | Current tests + `docs/08_E2E_TESTING_STRATEGY.md` + current CI |
| Deployment/runtime | `docs/DEPLOYMENT_GUIDE.md` + runtime config + current workflows |

## Evidence Routing

The table above identifies useful entrypoints. It does not make every document
equal evidence or authority, and there is no universal source ordering that
replaces claim-specific reasoning.

For **observed/current behavior**, start from evidence that can demonstrate the
actual path or environment in question:

```text
current implementation + reproducible runtime/deployment evidence when relevant
→ current tests / CI as supporting or falsifying evidence
→ targeted history only when regression origin or prior behavior matters
```

Tests describe what they exercise and can themselves drift. Runtime evidence may
be environment-specific. Treat either as evidence for the claim it actually
supports, not as automatic authority over all other sources.

For **intended/normative behavior**, retrieve the smallest applicable authority:

```text
explicit current product decision authority
→ current canonical SSOT for that behavior
→ applicable active ADR / scoped rule
→ explicitly current approved plan only when it owns the intended target
```

When observed and normative evidence disagree, follow
`catevia-current-truth`: report both, investigate the conflict, and do not
average them into a conclusion.

`docs/AI_CONTEXT_MAP.md` is a locator and recent-context aid. It is not, by
itself, proof of runtime behavior or normative authority.

## Historical Artifact Rule

Audit, remediation, and research documents are revision-bound evidence by
default. They do not become current findings merely because they remain in the
repository.

Implementation plans require a separate check:

- an explicitly current/approved plan may define intended target behavior when
  the repository assigns it that authority;
- a plan still does **not** prove that its target is implemented;
- completed, superseded, or revision-specific plans are historical evidence.

Use historical artifacts when they help answer questions such as:

- whether a regression has returned;
- why a design or invariant exists;
- what evidence was available at a previous revision;
- which area deserves targeted re-verification.

Never carry a historical finding forward as a current defect without locating
and re-verifying the relevant path on the current revision.

Never treat an old remediation report or implementation plan as proof of current
implementation. Re-establish current truth first.

Prefer repository search by:

- symbol/function/class;
- route;
- table;
- schema field;
- ADR ID;
- business-domain term;
- error message;
- invariant;
- test name.
