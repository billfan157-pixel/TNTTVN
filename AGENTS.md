# Agent Guide — Catevia / TNTTVN

> Repository: `TNTTVN` (`billfan157-pixel/TNTTVN`)
> Internal codename: `brave-davinci`
> Product: `Catevia`

This file is the repository entry point for AI coding agents. It only routes —
it does not contain the full governance text.

Start here, then load **only** the branch needed for the current task:

```text
AGENTS.md
│
├─ task classification                  → .agents/task-classification.md
├─ skill router                         → .agents/skill-router.md
├─ protected invariants                 → .agents/protected-invariants.md
├─ context router                       → .agents/context-router.md
└─ repository-wide operating contract   → .agents/operating-contract.md
         │
         ├── current-truth      → .agents/skills/catevia-current-truth/SKILL.md
         ├── change-impact      → .agents/skills/catevia-change-impact/SKILL.md
         ├── verification       → .agents/skills/catevia-verification/SKILL.md
         └── quantitative-targets → .agents/skills/quantitative-targets/SKILL.md
```

| Branch | File | Load when |
| ------ | ---- | --------- |
| task classification | `.agents/task-classification.md` | First, for every task — classify D0 / D1 / D2 / D3 before anything else. |
| skill router | `.agents/skill-router.md` | To decide which skill to load, and how skills hand off to each other. |
| protected invariants | `.agents/protected-invariants.md` | Whenever touching auth, tenancy, data integrity, sync, historical state, UI, or business behavior. |
| context router | `.agents/context-router.md` | To find the smallest relevant docs/code slice for the task. |
| repository-wide operating contract | `.agents/operating-contract.md` | The per-task contract: inspect → change minimally → verify → sync docs → report. Its phases are executed by the four skills above. |

Do not preload every branch, skill, ADR, business rule, or
project-history file. Retrieve only the context needed for the current task.
