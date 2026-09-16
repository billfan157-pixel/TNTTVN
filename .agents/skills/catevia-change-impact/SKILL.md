---
name: catevia-change-impact
description: >
  Analyze and plan material behavior or architecture changes in Catevia/TNTTVN
  before implementation. Use for D2/D3 changes, multi-file features, API/schema
  changes, authorization changes, offline/sync changes, cross-domain workflows,
  lifecycle changes, refactors touching protected invariants, or whenever the
  blast radius is not obviously local. Reconstruct current behavior, define
  target behavior, identify affected writers/readers/invariants/tests, and
  produce the minimum sufficient implementation plan before editing code.
version: 3.0
---

# Catevia Change Impact

## Purpose

Convert a requested behavior change into a repository-grounded implementation
plan without breaking Catevia invariants or creating competing authorities.

Do not design from the prompt alone.

A valid change is:

```text
CURRENT TRUTH
+ TARGET REQUIREMENT
+ PROTECTED INVARIANTS
+ MINIMUM SUFFICIENT DELTA
```

## Core Law

> **NO D2/D3 IMPLEMENTATION UNTIL CURRENT → TARGET → IMPACT IS UNDERSTOOD.**

A large prompt is not an implementation plan.

A list of affected files is not an impact analysis.

A HYPOTHESIS or UNKNOWN from Current Truth remains a HYPOTHESIS or UNKNOWN
until new evidence resolves it.

---

## 1. Establish Current Behavior

If current behavior has not already been established with sufficient evidence,
apply catevia-current-truth first.

Confirm the task classification from root `AGENTS.md`.

This skill is intended primarily for D2/D3 work. Do not force a local D1 change
through the full workflow unless it touches a protected boundary.

Record only what is relevant to the requested change:

- current entrypoint;
- authoritative writer;
- persisted facts;
- relevant readers/projections;
- authorization boundary;
- transaction or eventual-consistency boundary;
- recovery/retry behavior where applicable;
- tests covering current behavior.

### Preserve evidence status

Carry forward the Current Truth status for every material fact:

- VERIFIED_OBSERVED
- VERIFIED_NORMATIVE
- ALIGNED
- DRIFT
- CONDITIONAL
- HYPOTHESIS
- UNKNOWN

Never silently promote uncertain current-state evidence into settled plan input.

### Reverse handoff

If impact analysis exposes a material boundary not covered by the original
Current Truth investigation:

```text
Change Impact
→ new boundary discovered
→ catevia-current-truth(new boundary)
→ return to Change Impact
```

Do not plan against remembered or assumed architecture.

---

## 2. Normalize the Target

Translate the user request into observable behavior.

Separate:

- **Required Behavior** — Explicit outcomes the change must produce.
- **Preserved Behavior** — Existing behavior or invariants that must remain unchanged.
- **Non-Goals** — Behavior that is outside the requested change.
- **Design Decisions Needed** — Ambiguities that materially affect implementation.

Classify each unresolved decision as:

- BLOCKING — changes safety, authority, invariant, schema, migration,
  cross-domain semantics, or overall blast radius.
- DEFERRABLE — can be decided later without changing the safety or
  architecture of the plan.

Do not silently resolve BLOCKING product ambiguity.

A BLOCKING decision stops only the planning branch that depends on it unless it
changes the architecture or blast radius of the entire change.

---

## 3. Build the Current → Target Delta

For each affected behavior record:

```text
CURRENT:
what happens now

TARGET:
what must happen

DELTA:
what must change

UNCHANGED:
what remains authoritative

REASON:
why the delta is required
```

Do not describe implementation before the required behavioral delta is clear.

Prefer changing the minimum number of authoritative boundaries.

---

## 4. Trace the Blast Radius

Trace a boundary when the Current → Target delta gives a concrete reason it may
be affected.

Do not enumerate every possible subsystem merely to mark it NOT_APPLICABLE.

Relevant boundaries commonly include:

- **Authority** — Authentication, parish/tenant scope, organizational/class
  scope, parent ownership, resource roles, server-authoritative capabilities.
- **Data Integrity** — Authoritative writer, transaction boundary, uniqueness,
  idempotency, OCC/CAS, locks/finalization, snapshots, audit, soft-delete
  behavior.
- **Offline / Client Persistence** — Dexie ownership, sync queue, temp-ID
  remapping, mutation ordering, retry, conflict semantics, reconciliation,
  cache namespace.
- **Cross-Domain** — Downstream readers, projections, notifications, reports,
  calendar, Parish Memory, finance, academic lifecycle, or another domain
  consuming the changed fact.
- **Schema / Migration** — Check whether the change requires schema evolution
  or existing-data handling. If yes and the task is D3, perform the deeper
  recovery analysis later.
- **Frontend / UX** — Route, page, component, store, API client, responsive
  variants, accessibility, design-system primitives and state feedback.

### Impact rule

Widen the blast radius only when:

- a changed fact has additional readers;
- another writer exists;
- authority changes;
- persistence semantics change;
- recovery/convergence changes;
- or evidence shows another boundary participates.

---

## 5. Review Protected Invariants

Inspect root AGENTS.md and applicable normative sources.

For each relevant invariant classify:

- PRESERVED
- INTENTIONALLY_CHANGED
- AT_RISK
- UNKNOWN

Do not list irrelevant invariants.

An intentional protected-invariant change requires explicit product authority.

Complexity that protects an invariant is not technical debt merely because it
is difficult to understand.

---

## 6. Choose the Smallest Valid Design

Prefer reusing an existing:

- writer
- transaction
- policy
- state machine
- projection
- domain abstraction
- design-system primitive

when its existing contract actually matches the new requirement.

Before creating a new abstraction, answer:

1. Why can the existing abstraction not represent the required invariant?
2. What concrete ambiguity or correctness issue does the new abstraction solve?
3. Who becomes its authoritative owner?
4. Does any existing authority need to disappear or delegate to it?

### Reverse check

Reuse is not automatically safer.

Before extending an existing abstraction, verify that the new responsibility is
semantically compatible with its current contract.

Do not hide a second business responsibility inside an existing abstraction
merely to avoid creating a new one.

The goal is:

```text
minimum sufficient design
≠
minimum number of files/types at any cost
```

---

## 7. Map the Affected Surface

Before task decomposition, map only the verified affected surface.

For each material module identify:

- Module / file:
- Responsibility:
- Why affected:
- Consumes:
- Produces:
- Relevant tests:

Do not invent exact paths, symbols or interfaces.

If likely but unverified, label:

```text
CANDIDATE PATH
```

and verify it before relying on it in an implementation task.

---

## 8. Design Verification Before Implementation

For every material target behavior define:

```text
Acceptance claim
→ lowest sufficient test/evidence layer
→ negative or failure case
→ cross-layer evidence if required
```

Use E2E only when the claim actually depends on a real cross-layer workflow.

Do not use a broad E2E test as a substitute for a precise domain or
authorization regression test.

### Bug-driven changes

If planning follows a root-cause investigation, the regression test must prove
the actual failure mode identified by Current Truth.

A test that merely touches the same endpoint or component is insufficient.

Example:

```text
Root cause:
wrong-class actor bypasses class-scope authorization

Good regression:
valid request + wrong class assignment → denied by class-scope policy

Weak regression:
request returns 403 for any reason
```

---

## 9. Decompose the Implementation

A task should be the smallest coherent unit that:

- has one clear responsibility;
- produces an observable result;
- can be verified independently;
- can be reviewed independently;
- does not intentionally leave the system in an invalid intermediate state.

Order tasks by actual dependency.

A common sequence is:

```text
domain/policy
→ persistence/migration if needed
→ backend writer/authorization
→ API contract
→ client state/UI
→ downstream projections/consumers
→ regression/integration evidence
→ documentation truth synchronization
```

This sequence is guidance, not a template requirement.

### No placeholder plans

Do not write:

```text
add validation
handle edge cases
fix authorization
update sync
write tests
update docs
```

without specifying:

- what behavior changes;
- which authority enforces it;
- which invariant is involved;
- and what evidence will demonstrate success.

### Plan invalidation

If later implementation discovers an unplanned material boundary:

```text
PAUSE the affected implementation branch
→ re-run Current Truth for the new boundary if needed
→ update Change Impact
→ only then continue
```

Do not silently expand implementation beyond the reviewed blast radius.

---

## 10. D3 Failure and Recovery Analysis

For D3 changes, analyze the failure/recovery questions that actually apply to
the changed boundary.

Examples:

- Can the command partially commit?
- Can it safely retry?
- Can it execute twice?
- Can stale clients replay old input?
- Can a migration stop halfway?
- What happens to already-written data?
- Is rollback actually safe?
- Does recovery require forward-fix instead?
- Is backup/restore relevant?
- Is deployment preflight required?

Do not mechanically answer every question for every D3 task.

For example, a pure authorization policy change may require fail-closed and
rollback analysis but not database restore analysis.

Use UNKNOWN when recovery behavior cannot be established.

Never invent rollback capability.

---

## Documentation Ownership

Update authoritative documentation only when the truth owned by that document
changes.

Typical ownership:

```text
business behavior       → BUSINESS_RULES
architecture boundary   → Architecture / ADR
API contract            → FRONTEND_API_CONTRACT
schema/data contract    → database SSOT
security boundary       → security SSOT
testing strategy        → E2E/testing strategy
```

Do not append implementation-history noise to normative documents.

Historical implementation evidence belongs in the appropriate historical or
research artifact.

---

## Plan Output Contract

### Goal

One concise target statement.

### Current Model

Verified current behavior, ownership and Current Truth status.

### Target Model

Required future behavior.

### Gap Matrix

| Area | Current | Truth Status | Target | Required Delta |
|------|---------|--------------|--------|----------------|

### Protected Invariants

Only relevant invariants and their disposition.

### Blast Radius

Affected layers/domains and why they are affected.

### Writer / Reader Map

Authoritative writers and material downstream consumers.

### Schema / Migration Impact

Include when applicable.

### Authorization Impact

Include when applicable.

### Offline / Convergence Impact

Include when applicable.

### Implementation Tasks

Dependency-ordered tasks with verified surfaces and observable outcomes.

### Verification Plan

```text
claim → evidence
```

### Documentation Sync

Only documents whose owned truth changes.

### Recovery / Rollback

Required for applicable D3 risk.

### Design Decisions Needed

Each unresolved decision marked BLOCKING or DEFERRABLE.

### Residual Risk

What remains unverified, external or intentionally deferred.

Do not add empty sections merely to say NONE unless absence itself is
important to the safety review.

---

## Stop Conditions

Pause the affected planning branch when:

- authoritative current behavior cannot be established;
- two normative sources materially conflict and authority cannot be resolved;
- a required decision is BLOCKING;
- the requested change intentionally breaks a protected invariant without
  explicit authority;
- migration/data safety cannot be established where migration is required;
- the authoritative writer cannot be identified;
- the proposed design creates competing writers;
- the plan relies materially on an unresolved UNKNOWN or HYPOTHESIS.

Stop the entire plan only when the unresolved issue changes the global
architecture, safety model or blast radius.

---

## Anti-Patterns

Stop and correct course if you are:

- designing directly from the user prompt without reconstructing current truth;
- silently upgrading a HYPOTHESIS or UNKNOWN into plan fact;
- creating a new abstraction before understanding the existing owner;
- forcing a new responsibility into an old abstraction merely to maximize reuse;
- enumerating unrelated boundaries as checklist ceremony;
- treating every D3 change as if it required identical recovery procedures;
- adding E2E where a focused test proves the claim better;
- planning exact files/symbols that were never verified;
- expanding implementation beyond the reviewed blast radius without re-analysis;
- converting implementation history into normative documentation;
- producing a plan whose tasks say what files to edit but not what invariant or
  behavior each task changes.
