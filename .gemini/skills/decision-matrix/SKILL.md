---
name: decision-matrix
description: Quantitative Decision Matrix & Quality Audit framework v2.0 for evaluating technical choices, architecture trade-offs, and post-implementation code quality.
---

# 📐 Decision Matrix & Code Audit Skill v2.0

> **Purpose:** Enforces a quantitative, weighted decision-making and audit framework for all architectural, technical, security, and implementation choices in the TNTT Parish Management Platform (`brave-davinci`).

---

## 1. Dual Trigger Workflows

Activate this framework in two distinct phases:

### Phase A: PRE-Implementation (Architecture & Tech Selection)
Trigger BEFORE:
1. Selecting technology stacks or external libraries (e.g. `@react-pdf/renderer` vs `html2pdf.js`, `xlsx` vs `exceljs`).
2. Choosing between competing architectural patterns (e.g. Monolithic vs Modular vs Microservices).
3. Deciding implementation approaches for complex features (e.g. IAM password reset workflows, offline sync retry strategies).

### Phase B: POST-Implementation (Code Quality & Security Audit)
Trigger AFTER:
1. Completing a major Phase or feature deliverable to evaluate code quality, dead code, edge cases, and security vulnerabilities.
2. Assessing bugs, lint errors, performance bottlenecks, and type safety compliance.

---

## 2. Quantitative Evaluation Formula

$$\text{Weighted Score} = \sum_{i=1}^{n} (\text{Score}_i \times \text{Weight}_i)$$

Where:
- **Score**: Integer from $1$ (Unacceptable) to $10$ (Exceptional).
- **Weight**: Percentage weight ($\sum \text{Weight} = 100\%$).

---

## 3. Standard Evaluation Criteria Matrix (Parish Platform v2.0)

| Criterion | Weight | Key Metrics & Definition |
|---|:---:|---|
| **1. Parish Operational Simplicity** | **20%** | Ease of use for Priests, Catechists, and Parish Admin. Zero complex IT steps or terminal setup. |
| **2. Offline-First & Data Reliability** | **20%** | Works 100% offline in parish basement with weak WiFi/4G. Zero data loss on sync conflict. |
| **3. Security, Privacy & RBAC** | **20%** | Protection of youth/student personal data, JWT expiration, strict RBAC role enforcement. |
| **4. Maintenance & Cloud Cost ($0)** | **15%** | Zero monthly cloud bills, low developer effort, zero OS maintenance overhead. |
| **5. Performance & Responsiveness** | **15%** | Lightweight bundle, TTI < 1.5s, smooth 60fps renders on old PCs and budget smartphones. |
| **6. Code Quality & Type Safety** | **10%** | Clean TypeScript interfaces, zero dead code, zero `any` casts, 100% test passing. |

---

## 4. Decision Matrix Template (PRE-Implementation)

```markdown
### 📊 Technical Decision Matrix: [Topic Name]

| Evaluation Criteria | Weight | Option A: [Name] | Option B: [Name] | Option C: [Name] |
|---|:---:|:---:|:---:|:---:|
| Parish Operational Simplicity | 20% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| Offline-First & Reliability | 20% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| Security, Privacy & RBAC | 20% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| Maintenance & Cloud Cost ($0) | 15% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| Performance & Speed | 15% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| Code Quality & Type Safety | 10% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| **TOTAL WEIGHTED SCORE** | **100%** | **X.X / 10** | **Y.Y / 10** | **Z.Z / 10** |

#### Verdict & Architectural Rationale:
- **Winner**: Option [X] (Score: X.X / 10).
- **Key Justification**: [Explain why winning option best satisfies criteria].
- **Risk Mitigation & Fallback Plan**: [Define clear fallback mechanism if edge case occurs (e.g. popup blocker fallback)].
```

---

## 5. Post-Implementation Audit Template (POST-Implementation)

```markdown
### 🔍 Code Quality & Security Audit Matrix: [Feature / Phase Name]

| Component / File | Issues Discovered | Severity (🔴/🟡/🟢) | Remediation Plan |
|---|---|:---:|---|
| `[FileName.tsx]` | [Description of issue / dead code / type safety] | 🔴 High | [Exact fix steps] |

#### Overall Score: **X.X / 10**
- **Strengths**: [Key accomplishments]
- **Defects Fixed**: [Confirmed 0 TypeScript errors, 0 dead code, 100% verified test suite]
```
