# Skill Router — Catevia / TNTTVN

> Parent: root `AGENTS.md`
> Scope: which skill to load, when, and how skills hand off to each other.
> The four skills below are the execution phases of the operating contract
> (`operating-contract.md`):

```text
operating contract
├── current-truth      (§3.1)
├── change-impact      (§3.2)
├── verification       (§3.3)
└── quantitative-targets (§3.4, conditional)
```

Skills are loaded by task need, not merely by D-level.

Do not preload all skills.

Load a skill when entering the phase it owns.

## 3.1 catevia-current-truth

Path:

```text
.agents/skills/catevia-current-truth/SKILL.md
```

Use when the task asks to:

- research;
- investigate;
- audit;
- reconstruct current behavior;
- explain why something happens;
- trace a workflow;
- determine authority or ownership;
- diagnose a bug/root cause;
- compare implementation with requirements;
- resolve disagreement between code, tests, runtime evidence, or documentation.

Also use before D2/D3 planning when the relevant current-state model has not
already been established with sufficient evidence.

Primary responsibility:

```text
WHAT DOES THE SYSTEM CURRENTLY DO?
WHY?
WHAT IS AUTHORITATIVE?
WHAT IS VERIFIED VS UNKNOWN?
```

A read-only audit must remain read-only.

## 3.2 catevia-change-impact

Path:

```text
.agents/skills/catevia-change-impact/SKILL.md
```

Use when planning or implementing a D2/D3 material change involving:

- behavior redesign;
- multiple modules/layers;
- API/schema changes;
- authorization changes;
- persistence changes;
- offline/sync changes;
- cross-domain workflows;
- lifecycle changes;
- protected invariants;
- architecture-affecting refactors.

Primary responsibility:

```text
CURRENT
→ TARGET
→ DELTA
→ BLAST RADIUS
→ INVARIANTS
→ MINIMUM SUFFICIENT DESIGN
→ IMPLEMENTATION PLAN
```

Do not design from the user prompt alone.

If the skill discovers an unverified material boundary, hand that boundary
back to catevia-current-truth before relying on it.

## 3.3 catevia-verification

Path:

```text
.agents/skills/catevia-verification/SKILL.md
```

Use after implementation and before claiming that work is:

- fixed;
- complete;
- correct;
- safe;
- passing;
- ready for commit/PR/release;
- compliant with a plan or requirement.

Also use to independently verify delegated/subagent work.

Primary responsibility:

```text
CLAIM
→ DIRECT EVIDENCE
→ APPLICABLE REPOSITORY GATES
→ REQUIREMENT CONVERGENCE
→ COMPLETION STATUS
```

Verification evidence must apply to the final relevant change state.

A test result becomes stale if later edits can affect the claim it proved.

## 3.4 quantitative-targets

Path:

```text
.agents/skills/quantitative-targets/SKILL.md
```

Load only when a decision materially depends on measurable evidence such as:

- latency;
- throughput;
- reliability;
- capacity;
- OMR accuracy;
- resource usage;
- cost;
- benchmark comparison;
- historical numerical target;
- SLI/SLO.

Do not load this skill merely because:

- a task is D2 or D3;
- the task is an audit;
- architecture is being discussed;
- a protected invariant is involved.

Security/correctness invariants are not ordinary numerical targets.

## 3.5 Skill Handoffs

The skills form a workflow, not independent manuals.

### Research / Audit

```text
catevia-current-truth
→ findings
```

Do not invoke Change Impact unless implementation or remediation planning is
actually requested.

### Bug Fix

For unclear/root-cause-sensitive bugs:

```text
catevia-current-truth
→ root cause
→ implementation
→ catevia-verification
```

If the fix is D2/D3 or changes architecture/invariants:

```text
catevia-current-truth
→ catevia-change-impact
→ implementation
→ catevia-verification
```

### Material Feature / Redesign

```text
catevia-current-truth
        ↓
catevia-change-impact
        ↓
implementation
        ↓
catevia-verification
```

Skip Current Truth only when the relevant current-state model is already
verified and still applicable.

### Verification Feedback Loop

Verification may invalidate an earlier assumption.

If implementation is wrong:

```text
fix implementation
→ verify again
```

If the plan is wrong:

```text
catevia-change-impact
→ replan
```

If the current-state model was wrong:

```text
catevia-current-truth
→ re-investigate
→ catevia-change-impact if needed
```

Do not keep patching code against a broken plan.

## 3.6 Cross-Skill Evidence Contract

Truth status must survive skill handoffs.

A finding marked:

```text
HYPOTHESIS
UNKNOWN
CONDITIONAL
DRIFT
```

by catevia-current-truth does not become verified merely because
catevia-change-impact uses it.

Change Impact must carry unresolved evidence status forward.

Verification begins from the claim → evidence mapping produced by Change
Impact when such a plan exists.

Do not silently:

- upgrade UNKNOWN → fact
- drop a planned claim
- replace a failed claim with a different easier claim
