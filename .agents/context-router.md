# Context Router — Catevia / TNTTVN

> Parent: root `AGENTS.md`
> Scope: retrieve the smallest relevant repository slice for the current task.
> Widen retrieval only when evidence is insufficient, contradictory, or reveals
> another material boundary.

| Concern | Inspect first |
| ------- | ------------- |
| Architecture / module boundaries | `docs/02_ARCHITECTURE.md` + relevant ADR |
| Current domain context | Select the domain in `docs/AI_CONTEXT_MAP.md`, then follow its authority, canonical docs and implementation links |
| Implementation history / audit evidence | Follow the domain's linked audit/implementation document or Git history; dated results are not current verification |
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
