---
name: catevia-current-truth
description: >
  Reconstruct and verify the current behavior of Catevia/TNTTVN before
  diagnosing bugs, auditing a subsystem, answering architecture questions,
  or planning material changes. Use for research, investigation, audit,
  workflow tracing, root-cause analysis, authority/ownership discovery, or
  whenever code, tests and documentation may disagree. Establish observed
  truth separately from normative truth before proposing changes.
version: 3.0
---

# Catevia Current Truth

## Purpose

Establish what Catevia currently does and why before proposing a fix,
architecture change, or implementation plan.

Keep these separate:

- **Observed truth** — what the current system actually does.
- **Normative truth** — what the system is intended or required to do.
- **Inference** — what appears likely but is not yet demonstrated.

Never silently convert one into another.

## Core Law

> **NO MATERIAL CLAIM OR FIX WITHOUT SUFFICIENT CURRENT EVIDENCE.**

Therefore:

- documentation does not prove runtime behavior;
- current code does not automatically prove intended behavior;
- historical test results are not current verification;
- frontend restrictions are not server authorization;
- conflicting current evidence must be investigated, not averaged;
- if evidence is insufficient, report `UNKNOWN`.

Every material verified claim must have a concrete evidence locator:
source symbol/line, test, runtime result, schema/constraint, CI result,
benchmark, or normative document section.

---

## 1. Pin the Investigation

Before research:

1. Identify the revision being inspected.
2. State the exact question being investigated.
3. Identify the likely domain and entrypoint.
4. Classify the task using root `AGENTS.md`.
5. Load only relevant context.

If the user supplied a commit, inspect that commit.

If current HEAD cannot be established, state:

`REVISION: UNKNOWN`

Do not silently use remembered repository state.

---

## 2. Trace Observed Behavior

Start from implementation or reproducible behavior, not documentation.

Trace only the layers needed for the claim.

Typical path:

```text
UI / caller
→ client/store/API
→ server route
→ authorization / validation
→ service / domain policy
→ transaction or consistency boundary
→ persistence
→ downstream reader / projection
→ recovery / reconciliation
```

For offline behavior:

```text
UI mutation
→ durable local owner
→ queue
→ dependency/order handling
→ server mutation
→ acknowledgement
→ pull/reconciliation
→ converged state
```

For cross-domain behavior, continue until the downstream consumer relevant to
the question is understood.

### Retrieval discipline

Prefer targeted retrieval by:

- symbol;
- route;
- call site;
- table;
- error;
- test;
- ADR/business concept.

Do not read entire large files or documents unless the control flow genuinely
requires it.

Widen investigation only when evidence is insufficient, contradictory, or an
alternate writer/path may exist.

---

## 3. Identify Authority and Ownership

For every material fact determine:

- Who is the authoritative writer?
- What persisted fact represents the decision?
- Who reads it?
- Is the boundary atomic or eventually consistent?
- What retry/recovery path exists?
- Can another path write the same business fact?

Do not assume:

- frontend state = authority;
- candidate picker = authorization;
- cache = authority;
- projection = command source;
- current state = historical truth;
- documentation = runtime.

If multiple paths appear to own the same business fact, determine whether they
are:

- adapters to one canonical writer;
- intentionally separate writers;
- legacy/dead paths;
- competing authorities.

Do not hide competing authority behind abstraction.

For sync/conflict behavior, establish both:

- how the winning state is chosen;
- what happens to the losing mutation/state.

---

## 4. Load and Compare Normative Truth

After understanding the implementation, load the smallest applicable normative
context through AGENTS.md.

Typical sources:

- docs/BUSINESS_RULES.md
- relevant ADR
- docs/FRONTEND_API_CONTRACT.md
- docs/02_ARCHITECTURE.md
- security/database/testing/design-system SSOT when applicable
- explicit current user requirement

Document age alone does not make a source stale.

If a newer decision touches the same invariant, check whether the older source
was actually superseded.

Classify important claims as:

- VERIFIED_OBSERVED
- VERIFIED_NORMATIVE
- ALIGNED
- DRIFT
- CONDITIONAL
- HYPOTHESIS
- UNKNOWN

NON_DETERMINISTIC, TIMING_SENSITIVE, or ENVIRONMENT_DEPENDENT describe
behavior characteristics; they are not truth-status values.

If observed and normative truth disagree, report both sides.

Do not silently choose whichever side appears more convenient.

---

## 5. Resolve Evidence Conflict

When two current evidence sources disagree:

```text
test says A
runtime/code path says B
```

or:

```text
writer A enforces rule X
writer B appears not to
```

do not choose one immediately.

Check:

- reachability;
- actual caller;
- state/config conditions;
- environment;
- legacy/dead path;
- test drift;
- timing/race;
- alternate writer.

If the conflict invalidates an earlier assumption, re-trace that segment.

Record the result as:

- RESOLVED_CONDITIONAL
- DEAD_OR_LEGACY_PATH
- TEST_DRIFT
- ENVIRONMENT_DIFFERENCE
- IMPLEMENTATION_DIVERGENCE
- UNRESOLVED

---

## 6. Bug / Root-Cause Investigation

For bugs, failures or unexpected behavior:

1. Reproduce if practical.
2. Read the actual error/result.
3. Trace the incorrect state/value backward to its source.
4. Find the first boundary where expected and observed behavior diverge.
5. Form one root-cause hypothesis.
6. Test it with the smallest valid probe.
7. Re-trace if the hypothesis is false.

Use:

```text
I think X is the root cause because Y.
Evidence that would confirm or falsify it: Z.
```

Use targeted Git history only when regression origin, intent or unexplained
divergence matters.

Do not perform git blame / history analysis as ritual.

Do not declare root cause while materially plausible alternatives remain.

---

## Read-Only Rule

For audit, research, explanation or read-only diagnosis:

Do not modify tracked repository files.

Allowed:

- repository search;
- existing tests;
- existing audit commands;
- safe read-only queries;
- runtime inspection;
- external scratch analysis.

If source instrumentation or implementation changes are required, hand off to
the appropriate implementation workflow.

---

## Quantitative Claims

Load:

```text
.agents/skills/quantitative-targets/SKILL.md
```

only when the conclusion materially depends on numerical performance,
reliability, accuracy, capacity, cost, benchmark or SLO evidence.

D2/D3 alone does not trigger this skill.

---

## Report Contract

For substantial investigations report:

### Question

What was investigated.

### Revision

Commit / branch inspected.

### Observed Path

Concrete current behavior and data/control flow.

### Authority & Ownership

Authoritative writer, persisted fact and relevant readers.

### Normative Requirement

Applicable current requirement only.

### Truth Matrix

| Claim | Observed | Normative | Status | Evidence |
|-------|----------|-----------|--------|----------|

### Findings / Root Cause

Evidence-supported conclusions only.

### Evidence Conflicts

Any conflicting evidence and whether it was resolved.

### Unknowns

What remains unknown and what evidence would resolve it.

### Implications

Current blast radius only; do not turn this into an implementation plan.

### Next Decision

What needs to be decided or changed, if anything.

If a material implementation is required:

```text
handoff → catevia-change-impact
```

---

## Anti-Patterns

Stop if you are:

- reading one document and declaring runtime behavior;
- reading one file and declaring cross-domain behavior;
- treating old test/CI results as current verification;
- using frontend state as authorization evidence;
- proposing a rewrite before identifying the authoritative writer;
- calling invariant-protecting complexity technical debt without tracing it;
- ignoring alternate writers;
- continuing after later evidence disproves an earlier assumption;
- forcing source-line citations onto runtime/CI/database evidence;
- modifying tracked source during a read-only investigation;
- using generic best practice to override an explicit Catevia rule.
