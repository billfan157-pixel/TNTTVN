---
name: decision-matrix
description: Quantitative Decision Matrix framework for evaluating technical choices, architecture trade-offs, and implementation options before writing code.
---

# 📐 Decision Matrix Skill & Evaluation Framework

> **Purpose:** Enforces a quantitative, weighted decision-making framework for all architectural, technical, and implementation choices in the TNTT Parish Management Platform (`brave-davinci`).

---

## 1. When to Trigger the Decision Matrix

Trigger this framework BEFORE:
1. Selecting technology stacks or external libraries (e.g. `@react-pdf/renderer` vs `html2pdf.js`, `xlsx` vs `exceljs`).
2. Choosing between competing architectural patterns (e.g. Monolithic vs Modular vs Microservices).
3. Deciding implementation approaches for complex features (e.g. IAM password reset workflows, offline sync retry strategies).
4. Prioritizing execution roadmap items across subagents.

---

## 2. Quantitative Evaluation Formula

$$\text{Weighted Score} = \sum_{i=1}^{n} (\text{Score}_i \times \text{Weight}_i)$$

Where:
- **Score**: Integer from $1$ (Poor) to $10$ (Exceptional).
- **Weight**: Percentage weight ($\sum \text{Weight} = 100\%$).

---

## 3. Standard Evaluation Criteria for Parish Platform

| Criterion | Weight | Definition |
|---|:---:|---|
| **1. Parish Operational Simplicity** | **25%** | Ease of use for Priests, Catechists, and Parish Admin. Zero complex IT steps. |
| **2. Offline-First & Data Integrity** | **25%** | Works offline in parish basement with weak WiFi/4G. Zero data loss on sync. |
| **3. Implementation & Maintenance Cost** | **20%** | Developer effort, zero monthly cloud costs, zero OS maintenance. |
| **4. Performance & Responsiveness** | **15%** | Bundle size, TTI < 1.5s, smooth 60fps renders on old PCs/phones. |
| **5. Code Maintainability & Type Safety** | **15%** | Clean TypeScript interfaces, low technical debt, zero code duplication. |

---

## 4. Decision Matrix Template

```markdown
### 📊 Decision Matrix: [Decision Topic Name]

| Evaluation Criteria | Weight | Option A: [Name] | Option B: [Name] | Option C: [Name] |
|---|:---:|:---:|:---:|:---:|
| Parish Operational Simplicity | 25% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| Offline-First & Data Integrity | 25% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| Maintenance & Cost | 20% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| Performance & Speed | 15% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| Maintainability & Type Safety | 15% | Score (Weighted) | Score (Weighted) | Score (Weighted) |
| **TOTAL WEIGHTED SCORE** | **100%** | **X.X / 10** | **Y.Y / 10** | **Z.Z / 10** |

#### Verdict & Architectural Rationale:
- **Winner**: Option [X] (Score: X.X / 10).
- **Key Justification**: [Explain why the winning option best satisfies the weighted criteria].
```
