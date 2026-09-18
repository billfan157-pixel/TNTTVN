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

## Retrieval Priority

The table above identifies useful entrypoints. It does not make every document
equal evidence or authority.

For questions about **what the system currently does**, default to:

```text
current implementation / reproducible runtime evidence
→ current tests and CI evidence around that behavior
→ current canonical normative source for intended behavior
→ applicable active ADR or scoped rule
→ recent-context index/history only when needed
```

This is a retrieval priority, not a rule for averaging conflicting evidence.
When sources disagree, follow `catevia-current-truth`: separate observed truth
from normative truth and investigate the conflict.

`docs/AI_CONTEXT_MAP.md` is a locator and recent-context aid. It is not, by
itself, proof of runtime behavior or normative authority.

## Historical Audit / Plan Rule

Audit, remediation, research, and implementation-plan documents describe the
revision and evidence they inspected. They are not current findings merely
because they exist in the repository.

Use historical artifacts when they help answer questions such as:

- whether a regression has returned;
- why a design or invariant exists;
- what evidence was available at a previous revision;
- which area deserves targeted re-verification.

Never carry a historical finding forward as a current defect without locating
and re-verifying the relevant path on the current revision.

Likewise, do not treat a historical plan or remediation report as proof that the
planned behavior is still implemented. Re-establish current truth first.

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
