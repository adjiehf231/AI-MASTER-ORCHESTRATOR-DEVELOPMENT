# Software Testing Life Cycle (STLC) & Quality Engineering

> **Authoritative Specification:** Governed by `skills/qa-verification/SKILL.md` and `skills/test-architecture-design/SKILL.md`.

---

## 1. The 3-Tier Test Pyramid

```
       /\
      /  \      Tier 3: E2E Journeys & Accessibility (Playwright / Axe) - ~5%
     /----\
    /      \    Tier 2: Integration & Contract Tests (Database & Services) - ~25%
   /--------\
  /          \  Tier 1: Air-Gapped Fast-Path Unit Tests (<10s, Zero-DB) - ~70%
 /------------\
```

---

## 2. STLC Execution Phases

1. **Test Strategy Selection:** Identify target risk level (LOW/MEDIUM/HIGH/CRITICAL) and scope (isolated unit, integration contract, end-to-end journey).
2. **Test Case Authoring (TC-* Standard):** Every test scenario must carry an immutable `TC-${PROJECT_ID}-*` ID linked to its corresponding `BR-${PROJECT_ID}-*` requirement.
3. **Execution & Evidence:** All test runs must produce concrete terminal logs with timestamp, test count, assertions verified, and exit code.
4. **Defect Triage (S1–S4):**
   - **S1 (Critical):** Data corruption, authorization bypass, financial double-spend, account erasure failure.
   - **S2 (Major):** Broken primary workflow, unexpected error screen, performance SLA violation.
   - **S3 (Minor):** Secondary workflow glitch, inconsistent visual styling.
   - **S4 (Trivial):** Cosmetic typo, non-functional text alignment.
