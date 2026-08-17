---
name: decision-matrix
description: Evidence-driven decision and audit framework for TNTTVN. Use for significant technical, architectural, security, data, offline-sync, migration, refactoring, and implementation decisions. Enforces evidence quality, measurable targets, hard gates, ADR and architecture consistency, business-rule validation, verification, rollback safety, and post-implementation reassessment.
---

# Decision Matrix v4.1.2

> v4.1.2 (2026-08-10): so với v4.1.1 — khôi phục gate `Privacy` RIÊNG ở D3 (§13) + ma trận mẫu dạng bảng (§12). Đánh số section v4.1.2 đồng bộ AGENTS.md.

## 1. Purpose

Decision Matrix is TNTTVN's engineering decision-control framework.

Its purpose is to prevent significant decisions from being based primarily on:

* intuition
* arbitrary weighted scores
* undocumented assumptions
* incomplete repository inspection
* stale documentation
* theoretical architecture preferences

A significant decision should be:

**Evidence-based → Constraint-aware → Risk-checked → Measurable where applicable → Verifiable → Reversible when practical.**

The Decision Matrix does not replace:

* authoritative architecture documentation
* ADRs
* business rules
* security policies
* API contracts
* product requirements

It consumes and cross-checks those sources.

---

# 2. When to Activate

Use this skill for decisions involving:

* architecture
* authentication / authorization
* security / privacy
* tenant isolation
* database / schema
* offline / sync
* conflict resolution
* API contracts
* major dependencies
* infrastructure
* migrations
* backup / restore
* performance architecture
* major refactors
* cross-module features
* technology selection
* changes to protected business behavior

A full matrix is normally unnecessary for:

* formatting
* typo fixes
* copy-only changes
* isolated behavior-preserving refactors

When uncertain, classify the decision first rather than silently skipping the framework.

---

# 3. Decision Levels

## D0 — Trivial

No matrix required.

The change has negligible behavioral, architectural, security, data, or operational impact.

## D1 — Local

One module or localized behavior with low blast radius.

Use lightweight evaluation.

## D2 — Cross-Module

The decision affects multiple modules, shared state, APIs, database behavior, synchronization, or shared infrastructure.

Use full matrix evaluation.

## D3 — Critical

Use full matrix + hard gates + applicable ADR review + architecture review + verification + recovery planning.

D3 includes decisions affecting:

* authentication
* authorization
* tenant isolation
* sensitive personal data
* data integrity
* offline synchronization
* database migrations
* backup / restore
* security boundaries
* production infrastructure
* transaction boundaries
* synchronization semantics
* irreversible or difficult-to-reverse changes

The level describes **decision risk**, not implementation size.

---

# 4. Inspect Before Scoring

Before scoring an option, inspect the repository and identify applicable authoritative sources.

At minimum, inspect when relevant:

1. Source code
2. Tests
3. Database/schema
4. API contracts
5. Business rules
6. ADRs
7. Architecture specification
8. AI Context Map
9. Security audit findings
10. Existing Decision Records
11. Deployment/configuration
12. Existing performance or operational measurements

Do not score from assumptions when repository evidence is available.

Do not treat documentation as proof that implementation matches it.

When documentation and implementation disagree, record the discrepancy and identify which source is authoritative.

---

# 5. Source Authority

Use the following order to resolve conflicting information, unless the project explicitly defines a more specific authority:

1. Explicit product/business requirement
2. Security or compliance requirement
3. Current approved ADR
4. Current authoritative architecture specification
5. Current API / schema / business-rule specification
6. Verified implementation
7. Tests / benchmarks / production observations
8. Historical documentation
9. Agent inference

Important:

> A lower-level observation does not silently override a higher-level requirement.

If authoritative sources conflict with one another:

> **BLOCK or REASSESS until the conflict is resolved.**

Do not silently choose the source that produces the preferred outcome.

---

# 6. Evidence Model

Evidence and inference are separate concepts.

## Evidence Types

### E1 — Runtime / Production Evidence

Examples:

* production metrics
* production logs
* verified runtime behavior
* incident evidence

### E2 — Test / Benchmark Evidence

Examples:

* automated tests
* security tests
* integration tests
* performance benchmarks

### E3 — Direct Implementation Evidence

Examples:

* source code
* schema
* configuration
* dependency graph

### E4 — Authoritative Specification

Examples:

* ADR
* architecture specification
* business-rule specification
* API contract
* security requirement

### E5 — Historical / Secondary Documentation

Useful for context but weaker than current authoritative sources.

### Inference

Inference is reasoning derived from evidence.

It is **not evidence by itself**.

Never represent an inference as a directly verified fact.

---

# 7. Confidence

Every significant finding should have a confidence state:

```text
HIGH
MEDIUM
LOW
UNKNOWN
```

### HIGH

Directly verified by strong evidence.

### MEDIUM

Evidence exists but relevant uncertainty remains.

### LOW

Mostly indirect evidence or incomplete inspection.

### UNKNOWN

Insufficient evidence to determine the answer.

Golden rule:

> **UNKNOWN ≠ PASS.**

For critical security, privacy, tenant-isolation, data-integrity, or business-rule questions, UNKNOWN normally blocks final approval until investigated or explicitly accepted by the appropriate authority.

---

# 8. Decision Profiles

Select the smallest profile that represents the dominant risk.

## GENERAL

| Criterion                    | Weight |
| ---------------------------- | -----: |
| Business / Operational Fit   |    15% |
| Reliability & Data Integrity |    20% |
| Security & Privacy           |    20% |
| Maintainability              |    15% |
| Performance                  |    10% |
| Testability                  |    10% |
| Reversibility                |     5% |
| Observability                |     5% |

## SECURITY

| Criterion          | Weight |
| ------------------ | -----: |
| Security & Privacy |    35% |
| Data Integrity     |    20% |
| Reliability        |    15% |
| Testability        |    10% |
| Maintainability    |    10% |
| Operational Fit    |     5% |
| Reversibility      |     5% |

## OFFLINE / SYNC

| Criterion           | Weight |
| ------------------- | -----: |
| Offline Reliability |    30% |
| Data Integrity      |    25% |
| Conflict Safety     |    15% |
| Security & Privacy  |    10% |
| Maintainability     |    10% |
| Performance         |     5% |
| Observability       |     5% |

## ARCHITECTURE / INFRASTRUCTURE

| Criterion       | Weight |
| --------------- | -----: |
| Maintainability |    20% |
| Reliability     |    15% |
| Security        |    15% |
| Data Integrity  |    15% |
| Reversibility   |    15% |
| Performance     |    10% |
| Observability   |     5% |
| Operational Fit |     5% |

If no profile fits, explain why and define a temporary profile explicitly rather than silently inventing weights.

---

# 9. Product Targets & SLOs

Important criteria should be measurable when practical.

Avoid vague statements such as:

* fast
* secure enough
* works offline
* cheap
* responsive

Represent measurable requirements as:

```text
Target:
Actual:
Measurement Method:
Gap:
Evidence:
Confidence:
Classification:
```

## Target Classification

### HARD REQUIREMENT

Failure blocks approval unless an authorized requirement owner explicitly changes the requirement.

Examples:

* tenant isolation
* mandatory security control
* no critical data corruption
* no mutation loss

### PRODUCT TARGET

Failure affects evaluation and requires explanation or mitigation, but does not automatically reject the option.

### OPTIMIZATION TARGET

Useful optimization objective that should influence trade-offs but does not block approval.

---

# 10. Legacy / Candidate Product Targets

Historical or previously proposed targets MUST NOT automatically become official requirements.

Examples such as:

* TTI < 1.5s
* approximately 60 FPS
* $0 cloud baseline
* core workflows functioning on weak Wi-Fi

may be recorded as:

```text
LEGACY TARGET
CANDIDATE TARGET
PROJECT CONSTRAINT
```

until confirmed by an authoritative product, architecture, ADR, performance, or operational source.

Never convert an unverified historical metric into a hard gate.

When a target is confirmed, record:

```text
Source:
Version:
Date:
Scope:
Measurement Method:
```

---

# 11. Quantitative Evaluation

When a criterion has a verified measurable target, evaluate:

```text
Target
↓
Actual
↓
Gap
↓
Impact
↓
Score
```

Do not invent a precise score from an uncalibrated metric.

Example:

| Criterion | Target | Actual |   Gap | Score | Confidence |
| --------- | -----: | -----: | ----: | ----: | ---------- |
| TTI       |  <1.5s |   1.3s | +0.2s |     9 | HIGH       |
| TTI       |  <1.5s |   1.7s | -0.2s |     7 | HIGH       |

The exact scoring relationship must be justified by evidence or an established project benchmark.

If no scoring calibration exists:

> Report the target gap explicitly and explain its effect instead of pretending the number is objectively precise.

---

# 12. Scoring

Score applicable criteria from 1–10.

Every non-trivial score MUST contain:

```text
Score:
Evidence:
Confidence:
Unknowns:
Rationale:
```

Formula:

```text
Weighted Score = Σ(score × weight)
```

Matrix template:

| Criterion          | Weight | Option A | Option B | Option C |
| ------------------ | -----: | -------: | -------: | -------: |
| Criterion 1        |     x% |          |          |          |
| Criterion 2        |     x% |          |          |          |
| Criterion 3        |     x% |          |          |          |
| ...                |        |          |          |          |
| **Weighted Score** | **100%** | **X.X**  | **Y.Y**  | **Z.Z**  |

The weighted score is a comparison tool.

It is NOT an authorization mechanism.

The highest score wins only among options that:

1. pass all applicable hard gates;
2. satisfy mandatory requirements;
3. have sufficient evidence;
4. have acceptable residual risk;
5. have no unresolved ADR/architecture conflict.

---

# 13. Hard Gates

Weighted scores never override hard gates.

## D2

For criteria that are actually applicable to the decision:

```text
Security & Privacy < 7 → REJECT
Data Integrity < 7 → REJECT
Testability < 6 → REJECT
```

## D3

```text
Security < 8 → REJECT
Privacy < 8 → REJECT
Data Integrity < 8 → REJECT
```

Lưu ý: dù profile (SECURITY/GENERAL) gộp `Security & Privacy` làm một criterion, ở D3 phải
đánh giá và ghi evidence RIÊNG cho từng khía cạnh Security và Privacy (dữ liệu PII học sinh/
phụ huynh thuộc Privacy — không được ẩn dưới điểm Security cao).

Additional hard-gate failures include:

* verified tenant-isolation violation
* critical security behavior without sufficient verification
* confirmed sensitive-data exposure without accepted mitigation
* confirmed silent data corruption risk
* required verification failure relevant to the decision
* typecheck failure in code affected by the decision
* unsafe irreversible migration without an acceptable recovery strategy
* violation of a mandatory architecture or security constraint without an approved replacement

Do not reject a decision because of an unrelated test or typecheck failure.

The failure must be relevant to the decision under review.

---

# 14. ADR Gate

Before approval:

1. Identify applicable ADRs.
2. Compare every option against them.
3. Mark each relevant ADR:

```text
PASS
CONDITIONAL
CONFLICT
```

`CONFLICT` cannot be silently ignored.

If the decision intentionally replaces an ADR:

1. document the reason;
2. create or update the replacement ADR;
3. explicitly mark the previous decision as superseded;
4. update dependent source-of-truth artifacts.

---

# 15. Architecture Guard

Architecture rules MUST come from the project's current authoritative architecture specification and/or approved ADRs.

For TNTTVN, consult:

```text
docs/02_ARCHITECTURE.md
docs/ADR_ARCHITECTURE_DECISION_RECORDS.md
```

before enforcing architectural boundaries.

Do not hard-code an architecture rule merely because it appears reasonable.

Current architecture documentation defines explicit dependency boundaries. Verify the current document before applying them.

For example, where the authoritative architecture specifies:

```text
Presentation
    ↓
Application / domain responsibilities
    ↓
Infrastructure / persistence
```

a decision must not introduce forbidden reverse or cross-layer dependencies.

Check:

* dependency direction
* module ownership
* bounded-context boundaries
* database access boundaries
* API boundaries
* infrastructure leakage
* cross-module coupling
* transaction boundaries
* domain purity requirements

Architecture drift must be recorded as a finding even when the implementation still functions.

---

# 16. Source-of-Truth Guard

A decision that changes architectural, business, security, API, or operational truth must identify affected authoritative artifacts.

Potential sources include:

* ADRs
* architecture specification
* AI Context Map
* business rules
* API contracts
* database specification
* security audit
* Decision Records
* deployment documentation

For each affected source:

```text
Current:
Expected:
Action:
Status:
```

Do not leave contradictions such as:

```text
Code says A
ADR says B
Architecture document says C
```

unresolved.

If the implementation intentionally changes the truth:

> update the authoritative source.

---

# 17. Business Rule Gate

Do not infer intended business behavior solely from implementation.

Classify behavior as:

```text
CONFIRMED
CONDITIONAL
NOT CONFIRMED
```

If the result depends on an unknown business rule:

1. inspect the authoritative business-rule source;
2. inspect relevant ADRs;
3. ask for clarification if still unresolved.

Do not declare a confirmed bug when the intended business behavior is unknown.

---

# 18. Refactoring Guard

A change is behavior-preserving only when it does not intentionally alter:

* domain invariants
* business rules
* API contracts
* transaction boundaries
* security boundaries
* authorization behavior
* tenant isolation
* synchronization semantics
* persistence semantics
* observable product behavior

Examples of normally safe refactoring:

* extraction
* renaming
* duplication reduction
* internal cleanup
* behavior-preserving dependency restructuring

If any protected behavior changes:

> Treat the work as D1/D2/D3 according to its blast radius.

Do not use the word "refactor" to bypass decision governance.

---

# 19. Risk Assessment

For D2/D3 identify applicable risks:

* Security
* Privacy
* Data Integrity
* Reliability
* Migration
* Operational
* Performance
* Maintenance
* Compatibility
* User impact

For each material risk:

```text
Probability:
Impact:
Severity:
Mitigation:
Residual Risk:
Owner:
```

Residual risk must be evaluated after mitigation, not before.

---

# 20. Reversibility

Classify:

```text
R0 = Immediately reversible
R1 = Reversible by redeployment
R2 = Reversible with migration / compatibility work
R3 = Difficult to reverse
R4 = Effectively irreversible
```

D3 + R3/R4 requires explicit recovery planning before approval.

---

# 21. Migration & Rollback

For risky changes define:

```text
Migration:
Compatibility Strategy:
Rollback Trigger:
Rollback Procedure:
Maximum Rollback Time:
Data Recovery:
Known Limitations:
```

Prefer phased migrations:

```text
Compatibility
    ↓
Migration
    ↓
Verification
    ↓
Cutover
    ↓
Legacy Removal
```

Avoid combining:

* schema migration
* behavior change
* legacy removal

into one uncontrolled deployment when a phased approach is practical.

---

# 22. Verification

Verification must match the claim being made.

Examples:

| Claim                              | Appropriate Verification                   |
| ---------------------------------- | ------------------------------------------ |
| Tenant isolation works             | Tenant-isolation integration tests         |
| API meets latency target           | Benchmark / production latency measurement |
| Offline mutation survives reload   | Offline integration test                   |
| Migration is safe                  | Migration + recovery/rollback test         |
| Authentication is secure           | Security tests + implementation inspection |
| UI remains responsive              | Performance measurement                    |
| Data is not duplicated             | Integrity / idempotency tests              |
| Architecture boundary is preserved | Dependency/import inspection               |

Possible verification methods include:

* lint
* typecheck
* unit tests
* integration tests
* E2E tests
* security tests
* tenant-isolation tests
* offline/sync tests
* migration tests
* performance benchmarks
* production metrics
* dependency/import analysis
* manual verification when automated verification is unavailable

A verification failure only blocks the decision when it is relevant to the claim or requirement under review.

---

# 23. PRE-Implementation Workflow

Execute:

```text
1. Define the problem
2. Classify D0–D3
3. Inspect repository context
4. Identify authoritative sources
5. Identify constraints
6. Select decision profile
7. Identify applicable product targets
8. Generate alternatives
9. Collect evidence
10. Score options
11. Apply hard gates
12. Check ADR compatibility
13. Check architecture compatibility
14. Validate business rules
15. Assess risks
16. Assess reversibility
17. Define migration / rollback
18. Define verification
19. Define source-of-truth updates
20. Select decision
21. Record decision
```

For D3 decisions, prefer at least two viable alternatives plus the current approach when meaningful.

Do not manufacture alternatives when only one viable implementation exists; explicitly record that constraint.

---

# 24. POST-Implementation Workflow

After implementation:

```text
1. Inspect actual implementation
2. Compare against approved decision
3. Compare actual metrics against applicable targets
4. Run required verification
5. Check ADR compliance
6. Check architecture compliance
7. Check security/data implications
8. Check source-of-truth updates
9. Identify implementation drift
10. Record deviations
11. Determine outcome
```

If implementation materially differs from the approved decision:

> **REOPEN THE DECISION.**

Do not claim the original approval automatically covers materially different behavior.

---

# 25. Reassessment Loop

Decision lifecycle:

```text
DISCOVER
   ↓
DEFINE
   ↓
COMPARE
   ↓
DECIDE
   ↓
IMPLEMENT
   ↓
VERIFY
   ↓
MONITOR
   ↓
REASSESS
```

Reassessment is required when:

* assumptions change
* requirements change
* measured targets are materially missed
* new security evidence appears
* implementation diverges
* production behavior contradicts assumptions
* a dependency changes materially
* an ADR becomes obsolete
* residual risk becomes unacceptable

Possible outcomes:

```text
KEEP
ADJUST
REOPEN
SUPERSEDE
ROLL BACK
```

---

# 26. Decision Record

Every D2/D3 decision must record:

```text
Decision:
Status:
Date:
Severity:
Profile:

Problem:
Current State:
Desired State:
Constraints:

Authoritative Sources:

Applicable Product Targets:

Options:

Matrix:

Hard Gates:

Evidence:
Evidence Type:
Confidence:
Unknowns:
Rationale:

ADR Compatibility:
Architecture Compatibility:
Business Rule Status:

Risks:
Mitigations:
Residual Risk:

Reversibility:
Migration:
Rollback:

Verification:
Acceptance Criteria:

Source-of-Truth Updates:

Decision:

Review Date:
```

---

# 27. Outcome Review

D3 decisions should receive a post-implementation review.

Typical review points:

```text
7 days
30 days
90 days
```

Use the interval appropriate to the risk.

Compare:

```text
Target
vs
Actual
```

Evaluate:

* incidents
* performance
* reliability
* security findings
* operational burden
* support burden
* actual cost
* maintenance impact
* user impact
* residual risk

Result:

```text
SUCCESS
PARTIAL SUCCESS
FAILED
REASSESS
```

---

# 28. AI Audit Rules

When auditing TNTTVN, the agent MUST:

* distinguish fact from inference;
* identify the evidence type;
* provide file/function evidence where applicable;
* identify uncertainty;
* inspect applicable ADRs;
* inspect the authoritative architecture specification;
* inspect relevant business rules;
* check whether a reported issue is already fixed;
* check existing audit findings before creating duplicates;
* distinguish confirmed from conditional findings;
* compare implementation against documented architecture;
* use verified measurable targets when applicable;
* identify stale source-of-truth artifacts;
* state what evidence would resolve an unknown;
* scope test/verification failures to the decision under review.

The agent MUST NOT:

* invent configuration;
* invent production behavior;
* invent business rules;
* claim a vulnerability without sufficient evidence;
* treat documentation as proof of implementation;
* treat inference as evidence;
* convert an unverified historical target into a hard requirement;
* use a high weighted score to override a hard gate;
* silently contradict an ADR;
* silently override an authoritative requirement;
* classify protected behavioral changes as trivial refactors;
* classify an architectural change as a simple refactor;
* convert UNKNOWN into PASS;
* reject a decision because of unrelated verification failures.

---

# 29. TNTTVN Priority Order

When trade-offs conflict, use:

```text
1. Security & Privacy
2. Data Integrity
3. Tenant Isolation
4. Business Rule Correctness
5. Offline Reliability
6. Reliability
7. Maintainability
8. Observability
9. Performance
10. Convenience
```

This is a default prioritization aid.

It does not override:

* mandatory requirements
* hard gates
* ADRs
* authoritative architecture rules
* explicit product requirements

---

# 30. Approval States

## APPROVED

All required gates pass and evidence is sufficient.

## CONDITIONAL

Decision is acceptable with explicitly documented conditions.

## BLOCKED

Required evidence, clarification, verification, or recovery planning is missing.

## REJECTED

A hard gate fails or residual risk is unacceptable.

## REASSESS

The original decision may no longer be valid because assumptions, requirements, implementation, evidence, or architecture changed.

---

# 31. Golden Rules

> **Evidence beats intuition.**

> **Inference is not evidence.**

> **UNKNOWN ≠ PASS.**

> **Hard gates beat weighted scores.**

> **Authoritative requirements beat lower-level observations.**

> **Targets make important criteria measurable.**

> **Unverified historical targets are not requirements.**

> **Business rules must be verified, not inferred.**

> **Architecture rules must come from authoritative architecture sources.**

> **ADR conflicts must be explicit.**

> **A refactor that changes protected behavior is not a simple refactor.**

> **Critical decisions must be verifiable.**

> **Risky migrations must be reversible or recoverable.**

> **Architectural decisions must update their source of truth.**

> **Verification failures must be relevant to the claim being evaluated.**

> **A decision is not complete until its outcome can be measured.**

> **When reality materially diverges from the decision, REASSESS.**

# END — Decision Matrix v4.1.2