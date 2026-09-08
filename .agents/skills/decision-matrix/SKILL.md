# Quantitative Targets & SLOs

## Decision Matrix v5.1 Final Reference

> Load only when a decision materially depends on measurable performance,
> reliability, capacity, accuracy, resource usage, cost, or a historical
> numerical target.

---

# 1. Purpose

This reference prevents decisions from being based on:

* vague performance language;
* arbitrary numerical requirements;
* unverified historical benchmark numbers;
* benchmark results without comparable conditions;
* lab results presented as field evidence;
* averages hiding important tail behavior;
* current performance accidentally becoming a permanent target;
* optimizations being preserved or removed without knowing why they exist.

Use:

```text
DEFINE
→ AUTHORIZE
→ MEASURE
→ COMPARE
→ DECIDE
→ REVERIFY
```

---

# 2. Concepts Must Stay Separate

## 2.1 Invariant

A correctness/security condition expected to hold throughout its defined scope.

Examples:

```text
No cross-parish data access.

No silent mutation loss.

No unauthorized bypass of finalized academic state.
```

Evaluate primarily:

```text
PASS / BLOCK / UNKNOWN
```

Critical invariants are not ordinary reliability SLOs.

Do not invent tolerated failure/error budgets for:

* tenant isolation;
* authorization boundaries;
* silent corruption;
* equivalent critical correctness conditions.

---

## 2.2 Metric / SLI

A precisely defined quantitative indicator.

Examples:

```text
p95 interaction latency
API success rate
OMR false-negative rate
sync convergence time
bundle size
cold-start duration
```

A metric answers:

> What exactly is being measured?

---

## 2.3 Metric Target

A desired threshold or range for a metric.

Example:

```text
p95 interaction latency < 100 ms
```

A metric target does not automatically have full SLO semantics.

---

## 2.4 SLO

An SLO is an operational objective over an SLI with enough definition to establish:

* what events/population are measured;
* what counts as success/failure;
* target threshold;
* aggregation;
* scope;
* measurement window;
* measurement source;
* operational interpretation.

Example form:

```text
99% of eligible operations
complete successfully within X seconds
during rolling window Y.
```

Not every performance target needs to become an SLO.

---

## 2.5 Project Constraint

An external/project condition that limits valid solutions.

Examples:

```text
supported device floor
hosting budget
offline operating requirement
platform limitation
storage ceiling
```

A constraint is not automatically an SLO.

---

# 3. Three-Axis Target Model

Every decision-critical target should be interpreted using three independent axes.

---

## Axis A — Record Type

```text
INVARIANT
METRIC_TARGET
SLO
PROJECT_CONSTRAINT
```

---

## Axis B — Obligation

```text
HARD_REQUIREMENT
PRODUCT_TARGET
OPTIMIZATION_TARGET
```

### HARD_REQUIREMENT

Failure blocks acceptance unless an authorized owner changes or explicitly accepts the requirement.

Use sparingly.

### PRODUCT_TARGET

Important product outcome.

Missing it requires:

* gap;
* impact;
* explanation/mitigation;

but does not automatically BLOCK.

### OPTIMIZATION_TARGET

Desired engineering improvement.

Influences trade-offs without independently blocking approval.

---

## Axis C — Authority Status

```text
VERIFIED_CURRENT
CANDIDATE
LEGACY
SUPERSEDED
```

### VERIFIED_CURRENT

Authority/source/scope are established as current.

### CANDIDATE

Proposed but not yet established as current authoritative truth.

### LEGACY

Historically meaningful but current authority is unverified.

### SUPERSEDED

Explicitly replaced.

---

# 4. Why the Axes Are Independent

Example:

```text
Record Type:
METRIC_TARGET

Obligation:
PRODUCT_TARGET

Authority:
VERIFIED_CURRENT
```

is very different from:

```text
Record Type:
METRIC_TARGET

Obligation:
PRODUCT_TARGET

Authority:
LEGACY
```

Similarly:

```text
Record Type:
PROJECT_CONSTRAINT

Obligation:
HARD_REQUIREMENT

Authority:
VERIFIED_CURRENT
```

may legitimately constrain architecture.

Do not put:

```text
LEGACY
CANDIDATE
PROJECT_CONSTRAINT
```

into one mutually exclusive classification list.

They describe different properties.

---

# 5. Minimum Target Record

For a normal metric target:

```text
Record Type:

Metric / SLI:

Target:

Scope:

Obligation:

Authority Status:

Source / Owner:

Measurement Method:

Baseline:

Actual:

Gap:

Evidence:

Confidence:

Last Verified:
```

Unknown fields should be written as:

```text
UNKNOWN
```

rather than invented.

---

# 6. Full SLO Record

When something is genuinely an SLO, also define:

```text
SLI:

Eligible Population / Events:

Good Event:

Bad Event:

Target:

Aggregation:

Measurement Window:

Scope:

Exclusions:

Measurement Source:

Operational Policy:

Error Budget:
  only if meaningful
```

Do not call something an SLO merely because it contains a number.

---

# 7. Historical Number Guard

A numerical statement discovered in old documentation is not automatically a current requirement.

Examples:

```text
TTI < 1.5 s
60 FPS
99% OMR accuracy
$0 cloud baseline
sync within 3 seconds
```

Establish:

```text
Source:
Date:
Version:
Owner / Authority:
Original Scope:
Original Measurement Method:
Original Obligation:
Current Authority:
```

If current authority cannot be established:

```text
LEGACY
```

or, when it was merely a proposal:

```text
CANDIDATE
```

Do not promote a repeated historical number merely because multiple stale documents repeat it.

---

# 8. Target Authority vs Measurement Evidence

Keep these separate.

## Target authority

Typically comes from appropriate normative evidence:

```text
product requirement
approved ADR
approved performance specification
approved operational requirement
explicit authorized decision
```

## Baseline / Actual

Comes from measurement evidence such as:

```text
runtime telemetry
benchmark
test corpus
real-device measurement
controlled experiment
```

A benchmark can prove actual performance.

It does not automatically define what the target should be.

---

# 9. Current Performance ≠ Target

Do not define:

```text
Target = current performance
```

merely because the current system happens to achieve it.

Current performance is:

```text
BASELINE / ACTUAL
```

Targets should represent a validated user/product/operational objective.

Performance feasibility may inform target discussions, but feasibility is not authority.

---

# 10. Measurement Comparability

Before comparing target, baseline and actual, establish comparability.

Check:

```text
Same metric definition?

Same aggregation?

Same environment?

Same dataset/workload?

Same device class?

Same network assumptions?

Same cache/warm/cold state?

Same software configuration?

Same sampling method?
```

If material conditions differ:

> qualify the comparison instead of presenting false precision.

---

# 11. Measurement Mode

Classify measurement as appropriate:

```text
FIELD
LAB
SYNTHETIC
REAL_DEVICE
OTHER
```

## FIELD

Actual user/runtime conditions.

## LAB

Controlled reproducible development environment.

## SYNTHETIC

Artificial workload/input generated for testing.

## REAL_DEVICE

Executed on identified physical hardware.

Categories may overlap where appropriate; record the real conditions instead of forcing a misleading label.

---

# 12. Lab vs Field

Lab evidence is valuable for:

* debugging;
* profiling;
* regression detection;
* controlled A/B comparison.

Lab evidence does not automatically prove real-world user experience.

For real-user experience claims, field evidence is stronger where available.

Never silently translate:

```text
LAB PASS
```

into:

```text
FIELD SLO VERIFIED
```

---

# 13. Baseline

Do not invent a baseline.

If one exists:

```text
Baseline:
Measurement Date:
Environment:
Dataset / Workload:
Method:
Evidence:
Confidence:
```

If none exists:

```text
Baseline: UNKNOWN
```

An optimization may still have a rational technical basis.

But numerical improvement cannot be claimed without comparable baseline and actual measurements.

---

# 14. Target → Actual → Gap

For a valid target:

```text
Target
  ↓
Actual
  ↓
Gap
  ↓
User / Operational Impact
  ↓
Decision Consequence
```

Example:

```text
Target:
p95 < 100 ms

Actual:
p95 = 124 ms

Gap:
24 ms over target
```

Do not automatically convert a gap into an arbitrary `7/10`.

---

# 15. Hard Requirement Semantics

For:

```text
Obligation:
HARD_REQUIREMENT

Authority:
VERIFIED_CURRENT
```

a verified miss means:

```text
BLOCK
```

unless the authorized requirement owner changes or explicitly accepts the requirement.

This acceptance BLOCK does not automatically imply:

```text
Decision Level = D3
Finding Severity = P0
```

Those are independent classifications.

A numeric hard requirement must be sufficiently defined to establish pass/fail reliably.

---

# 16. Product Target Semantics

For:

```text
PRODUCT_TARGET
+
VERIFIED_CURRENT
```

a miss requires:

```text
Target:
Actual:
Gap:
Impact:
Explanation:
Mitigation:
Residual Risk:
Follow-up:
```

It does not automatically BLOCK unless an approved policy explicitly defines that consequence.

---

# 17. Optimization Target Semantics

For:

```text
OPTIMIZATION_TARGET
```

a miss means the desired optimization was not achieved.

Use the outcome to guide trade-offs.

Do not claim optimization success without measurement.

---

# 18. Candidate Target

A candidate target may guide experimentation.

It cannot silently become an acceptance gate.

Before promotion to VERIFIED_CURRENT establish enough of:

```text
Why does the user/product care?

Metric definition?

Target?

Scope?

Measurement method?

Owner / authority?

Consequence of missing it?
```

---

# 19. Legacy Target

LEGACY means:

> Historically meaningful, currently unverified.

Legacy targets may explain:

* historical design choices;
* existing optimization complexity;
* regression context;
* candidate future targets.

They cannot independently BLOCK current work.

---

# 20. Superseded Target

When replaced:

```text
Old target:
Authority = SUPERSEDED

Replacement:
Authority = VERIFIED_CURRENT
```

Preserve sufficient lineage to explain historical decisions.

Do not leave two contradictory current targets active.

---

# 21. Aggregation

Do not automatically use averages.

Select aggregation appropriate to the user/system effect.

Examples:

```text
p50
p75
p95
p99
max
mean
success percentage
error percentage
false-positive rate
false-negative rate
count
```

Do not compare:

```text
average baseline
```

to:

```text
p95 target
```

as equivalent values.

---

# 22. Scope

Every target has scope.

Examples:

```text
desktop web
mobile web
iOS Capacitor
Android Capacitor
low-end device
500-record roster
2000-record roster
cold cache
warm cache
weak Wi-Fi
offline reconnect
specific OMR corpus
```

Do not generalize results beyond demonstrated scope.

---

# 23. Performance Optimization Guard

Before preserving/removing optimization complexity such as:

* requestAnimationFrame throttling;
* virtualization;
* memoization;
* signature-based caching;
* batching;
* lazy loading;
* prefetching;
* worker/off-main-thread processing;

establish:

```text
What problem did this solve?

What metric did it affect?

What evidence originally justified it?

Was there a target?

Is that target still current?

What happens if the optimization is removed?
```

If historical evidence is incomplete:

```text
UNKNOWN
```

is acceptable.

Do not assume optimization complexity is either essential or obsolete.

When simplification removes performance-related complexity, use a relevant regression measurement when practical.

---

# 24. OMR / Algorithm Evaluation

Avoid reducing algorithm quality to one aggregate number when relevant failure modes differ.

Where applicable record:

```text
Corpus version:
Corpus size:
Input/source distribution:
Device distribution:
Resolution:
Lighting conditions:
Capture mode:

Overall accuracy:
False positives:
False negatives:
Rejected / invalid scans:
Processing latency:

Segment results:
```

A synthetic corpus validates only its demonstrated scope.

Do not claim field readiness from limited synthetic data.

---

# 25. Offline / Sync Measurement

Separate correctness from performance.

## Correctness invariants

Examples:

```text
No silent mutation loss
No duplicate committed domain operation
Correct temp-ID remapping
Correct tenant/user ownership
Correct dependency ordering
```

These are normally hard correctness properties.

## Performance metrics

Examples:

```text
reconnect-to-convergence latency
queue throughput
batch processing time
```

These may use metric targets or SLOs.

A faster sync engine that loses mutations fails regardless of its latency.

---

# 26. Reliability SLO

For a real reliability SLO define:

```text
SLI:

Eligible event:

Good event:

Bad event:

Objective:

Window:

Aggregation:

Scope:

Exclusions:

Measurement source:
```

SLO design should reflect user-visible reliability where practical.

---

# 27. Error Budget

Error budgets are appropriate only when a failure mode is legitimately tolerable.

For an SLO:

```text
Error Budget = allowed miss implied by SLO
```

The budget should have an operational interpretation if it is expected to influence release/reliability decisions.

If no policy exists:

```text
Error Budget Policy:
NOT DEFINED
```

Do not invent one.

Never create tolerated budgets for critical security or silent-corruption events merely for symmetry.

---

# 28. Cost / Resource Targets

A cost number may be:

```text
PROJECT_CONSTRAINT
PRODUCT_TARGET
OPTIMIZATION_TARGET
```

depending on the actual authority.

For historical claims such as:

```text
$0 infrastructure
```

establish:

```text
Current authority?
Scope?
Included costs?
Excluded costs?
Time period?
Reason?
```

before rejecting architecture options based on it.

---

# 29. Comparative Benchmarking

When comparing alternatives, use equivalent conditions.

Prefer:

```text
same environment
same dataset
same workload
same measurement method
same runtime configuration
multiple runs where variance matters
```

Record variability when material.

Do not select an option from one anomalous run.

---

# 30. Quantitative Claim Vocabulary

Use explicit states.

## VERIFIED

```text
Measured result changed from X to Y
under defined conditions Z.
```

## EXPECTED_UNVERIFIED

```text
Code/architecture suggests the expected direction,
but no valid comparative measurement was executed.
```

## UNKNOWN

```text
No sufficient comparable evidence exists.
```

Do not present:

```text
"should be much faster"
```

as a verified conclusion.

---

# 31. Target Lifecycle

```text
USER / PRODUCT NEED
        ↓
CANDIDATE METRIC
        ↓
CANDIDATE TARGET
        ↓
MEASUREMENT DEFINITION
        ↓
AUTHORITY / APPROVAL
        ↓
VERIFIED_CURRENT
        ↓
BASELINE
        ↓
IMPLEMENTATION
        ↓
ACTUAL
        ↓
GAP + IMPACT
        ↓
KEEP / REVISE / SUPERSEDE
        ↓
REVERIFY WHEN MATERIAL CONTEXT CHANGES
```

---

# 32. Reverification Triggers

Reverify when material changes affect:

* architecture;
* rendering/data strategy;
* data scale;
* major dependency;
* supported device/platform;
* runtime/deployment;
* network assumptions;
* algorithm;
* measurement methodology.

Do not rebenchmark after every unrelated code change.

---

# 33. Documentation

A durable current target should live in the authoritative source that owns the corresponding product/system truth.

Do not automatically create a global target SSOT.

Do not append every benchmark result to architecture documentation.

Future agents should be able to discover:

```text
what the target is
why it exists
who/what established it
scope
measurement method
current authority
last verification
```

Historical benchmark artifacts may live separately from normative targets.

---

# 34. Decision Output

When a target materially affects a decision:

```text
Metric / SLI:

Record Type:
  INVARIANT / METRIC_TARGET / SLO / PROJECT_CONSTRAINT

Obligation:
  HARD_REQUIREMENT / PRODUCT_TARGET / OPTIMIZATION_TARGET

Authority:
  VERIFIED_CURRENT / CANDIDATE / LEGACY / SUPERSEDED

Target:
Baseline:
Actual:
Gap:

Scope:
Environment:
Dataset / Workload:
Measurement Mode:
Measurement Method:

Evidence:
Confidence:

Impact:
Decision Consequence:
Residual Uncertainty:
```

For a genuine SLO, include its full SLO fields.

---

# 35. Anti-Patterns

Do not:

* use "feels faster" as evidence;
* invent targets because they sound reasonable;
* copy current performance into a target;
* promote historical numbers without authority verification;
* compare incompatible benchmark conditions;
* hide tail latency behind an inappropriate average;
* call lab results field results;
* hide false-positive/negative behavior inside one accuracy number;
* use performance results to override security/data-integrity gates;
* create error budgets for unacceptable corruption/security events;
* preserve complexity forever solely because it was once called an optimization;
* remove optimization complexity without checking why it existed;
* claim numerical improvement without comparable evidence.

---

# 36. Final Principle

Quantification should reduce ambiguity, not manufacture certainty.

> **Define the metric.**
>
> **Establish authority.**
>
> **Measure under known conditions.**
>
> **Compare target to actual.**
>
> **Expose uncertainty.**
>
> **Never let an old number silently become gospel.**
