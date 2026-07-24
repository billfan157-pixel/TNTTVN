# Changelog

## [Unreleased]

### Added
- Full project audit with bugs, tech debt, risks, ADRs (`01_PROJECT_AUDIT.md`)
- Grounded design system from actual CSS tokens (`03_DESIGN_SYSTEM.md`)
- Coding standards extracted from codebase conventions (`04_CODING_STANDARDS.md`)
- Refactor rules and migration dependency graph (`05_REFACTOR_RULES.md`)
- Execution plan with phased work items (`10_MASTER_EXECUTION_PLAN.md`)
- AI context map for LLM-assisted development (`AI_CONTEXT_MAP.md`)

### Changed
- Restructured `docs/` from 10 planning files to 12 canonical files
- Merged tech debt and quick wins into project audit
- Merged data flow into architecture doc
- Merged `MASTER_DEVELOPMENT_PLAN.md` (root) → `10_MASTER_EXECUTION_PLAN.md` (Product Vision, Deployment, Performance sections)
- Renamed files to numbered prefix for ordered navigation

### Removed
- Outdated `DESIGN_SYSTEM.md`, `DESIGN_TOKENS.md` (tokens were partially wrong)
- Aspirational `03_REFACTOR_PLAN.md` (not grounded in codebase)
- `MASTER_DEVELOPMENT_PLAN.md` (merged into `10_MASTER_EXECUTION_PLAN.md`)
- `MASTER_PLAN.md` (v4.0, historical — superseded by `10_MASTER_EXECUTION_PLAN.md`)
- Old UI docs: `ACCESSIBILITY.md`, `AI_UI_RULES.md`, `ANIMATION_GUIDELINES.md`, `COMPONENT_GUIDELINES.md`, `FRONTEND_STANDARDS.md`, `LAYOUT_GUIDELINES.md`, `UI_REVIEW_CHECKLIST.md`, `UX_RULES.md`
