# Agent Guidelines: TNTT Parish Management Platform (`brave-davinci`)

## 📐 Mandatory Decision Matrix & Code Audit Framework v4.1.2

In EVERY working session, the agent MUST automatically load and apply the following skills:
1. **Decision Matrix & Code Audit Framework v4.1.2** ([`.gemini/skills/decision-matrix/SKILL.md`](./.gemini/skills/decision-matrix/SKILL.md)) for all architectural decisions, technical trade-offs, security audits, and post-implementation reviews.
2. **Prompt Execution Workflow v1.0** ([`.gemini/skills/prompt-execution-workflow/SKILL.md`](./.gemini/skills/prompt-execution-workflow/SKILL.md)) for all user request processing, ensuring structured planning, evidence-first inspection, and documentation synchronization.

### Core Principles (Decision Matrix v4.1.2):
1. **Evidence-First Engineering**: Score without evidence is invalid (`§6 Evidence Model E1–E5`). Always inspect repository before scoring (`§4 Inspect Before Scoring`, `§5 Source Authority`).
2. **Decision Severity Tiers** (`§3`): D0 (Trivial), D1 (Local), D2 (Cross-Module), D3 (Critical Architectural).
3. **Dynamic Decision Profiles** (`§8`):
   - GENERAL: Product & Engineering
   - SECURITY: Security & Privacy (35% Security)
   - OFFLINE / SYNC: Offline Reliability (30% Offline)
   - ARCHITECTURE: Infrastructure & Maintenance
4. **Hard Safety Gates (`§13`)**:
   - D2: Reject if `Security & Privacy < 7`, `Data Integrity < 7`, `Testability < 6` (khi áp dụng).
   - D3: Reject if `Security < 8`, `Privacy < 8`, `Data Integrity < 8` (Privacy đánh giá evidence riêng).
5. **ADR Consistency Gate (`§14`)**: Must check compatibility with existing ADRs (`PASS` / `CONDITIONAL` / `CONFLICT`).
6. **Business Rule Gate (`§17`)**: AI findings must be classified as `CONFIRMED`, `CONDITIONAL`, or `NOT CONFIRMED`.
7. **TNTTVN Priority Order (`§29`)**: Security & Privacy > Data Integrity > Tenant Isolation > Business Rule Correctness > Offline Reliability.

## 📝 Mandatory Documentation Synchronization Rule

When editing files, updating code, developing new features, refactoring, or modifying system structure/architecture/schema/APIs:
1. **Mandatory Markdown Updates**: The agent **MUST** synchronously update all relevant authoritative Markdown documentation files (e.g., [`docs/02_ARCHITECTURE.md`](file:///C:/Users/phanb/Documents/antigravity/brave-davinci/docs/02_ARCHITECTURE.md), [`docs/AI_CONTEXT_MAP.md`](file:///C:/Users/phanb/Documents/antigravity/brave-davinci/docs/AI_CONTEXT_MAP.md), [`docs/BUSINESS_RULES.md`](file:///C:/Users/phanb/Documents/antigravity/brave-davinci/docs/BUSINESS_RULES.md), [`docs/FRONTEND_API_CONTRACT.md`](file:///C:/Users/phanb/Documents/antigravity/brave-davinci/docs/FRONTEND_API_CONTRACT.md), [`docs/SECURITY_AUDIT_LOG.md`](file:///C:/Users/phanb/Documents/antigravity/brave-davinci/docs/SECURITY_AUDIT_LOG.md), [`docs/ADR_ARCHITECTURE_DECISION_RECORDS.md`](file:///C:/Users/phanb/Documents/antigravity/brave-davinci/docs/ADR_ARCHITECTURE_DECISION_RECORDS.md), [`docs/07_DATABASE_PLAN.md`](file:///C:/Users/phanb/Documents/antigravity/brave-davinci/docs/07_DATABASE_PLAN.md), etc.).
2. **No Undocumented Changes**: No feature development, code refactoring, schema change, API contract update, or security fix is considered complete until all corresponding Markdown documentation sources-of-truth reflect the exact changes made.

