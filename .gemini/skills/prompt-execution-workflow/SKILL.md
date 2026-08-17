---
name: prompt-execution-workflow
description: Standard operating procedure for AI agents receiving user prompts. Use for structuring multi-step execution, ensuring evidence-first repository inspection, running verification tests, and maintaining documentation synchronization.
---

# Prompt Execution Workflow (PEW) v1.0

## 1. Purpose & Core Principles
This skill defines the mandatory step-by-step procedural workflow that an AI agent must follow upon receiving any non-trivial user prompt. 

It enforces:
- **Evidence-First Engineering**: Inspect repository and authoritative docs before making claims or code changes.
- **Structured Planning**: Break complex requests into manageable phases using the planning tool.
- **Rigorous Verification**: Run tests, linting, and typechecks to guarantee correctness.
- **Documentation Synchronization**: Keep all authoritative Markdown sources (ADRs, architecture specs, business rules) in lockstep with actual code changes.

---

## 2. The 6-Step Execution Lifecycle

### Step 1: Context & Intent Analysis
- Parse the user prompt to identify core objectives, target domain, and technical stack (e.g., React frontend, Hono backend, Drizzle ORM, offline sync, security/auth).
- Check relevant SSOT documents (`docs/02_ARCHITECTURE.md`, `docs/BUSINESS_RULES.md`, `docs/ADR_ARCHITECTURE_DECISION_RECORDS.md`).

### Step 2: Task Planning & Classification
- Classify task complexity and risk level (D0 Trivial to D3 Critical using Decision Matrix).
- Establish a structured multi-phase execution plan using the `plan` tool.

### Step 3: Evidence Collection & Repository Inspection
- Read existing source code, schema definitions, and test suites. Do not rely on assumptions.
- Verify existing constraints (e.g., multi-tenant isolation via `parish_id`, permission checks, rate limiters).

### Step 4: Execution & Implementation
- Implement code changes adhering strictly to project architectural patterns (Modular Monolith, strict TypeScript types, pure CQRS read models where applicable).
- Avoid side effects on protected business rules.

### Step 5: Verification & Documentation Sync
- Execute automated tests (`npm run test`) and static type checks (`tsc -b --noEmit`).
- **Mandatory Documentation Update**: If changes affect architecture, API contracts, database schema, or security rules, immediately update the corresponding authoritative Markdown documentation files.

### Step 6: Professional Delivery
- Deliver clear, information-rich, and professionally formatted final outputs using Markdown tables, structured paragraphs, and relevant file attachments.
