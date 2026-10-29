---
name: Requirement Analysis
description: Master methodology for analyzing and specifying ${PROJECT_NAME} requirements to Gate 1 (DoR) standard — INVEST user stories, Given/When/Then Gherkin criteria, BR-${PROJECT_ID}-* numbering, boundary value analysis, conflict arbitration, and statutory compliance. Use when scoping features, drafting PRDs, and defining acceptance gates.
---

# Requirement Analysis & Specification — ${PROJECT_NAME} (Gate 1: Definition of Ready)

Authoritative sources: `docs/product/`, `docs/qa/RELEASE_QUALITY_GATES.md` (Gate 1), `docs/process/SDLC.md`, and the Enterprise Engineering Constitution (§1–§6).

A requirement is **READY FOR IMPLEMENTATION** only when it satisfies the statutory criteria of Gate 1: unambiguous business objectives, mathematically bounded acceptance criteria, strict Zod schemas, assigned business rule IDs, and explicit privacy impact assessments.

---

## 1. Input Discovery & Source Pre-Flight

Before drafting any specification, load and verify context:

1. **System Memory:** Read `docs/memory/PROJECT_STATE.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md`, `RISKS.md`, and `KNOWN_ISSUES.md`.
2. **Authoritative Sources (Priority Ladder per Constitution §3):**
   $$\text{1. Blueprint} \to \text{2. BRD/PRD/SRS/NFR} \to \text{3. ADRs} \to \text{4. ACs} \to \text{5. ERD/Contracts} \to \text{6. Code/Tests} \to \text{7. Backlog} \to \text{8. User Prompt}$$
3. **Module Code Inspection:** Inspect existing code in `src/modules/<affected_module>/` and its database models in `drizzle/schema/`. Never specify features assuming a non-existent route or schema.

---

## 2. Requirement Arbitration Protocol (Conflict Resolution)

When requirements from different sources contradict each other:
1. **HALT:** Do not guess, assume, or pick the newer/easier requirement.
2. **ISOLATE:** Quote both sources verbatim with exact file paths and line numbers.
3. **IMPACT ANALYSIS:** Document which entities, database columns, API contracts, and user journeys are broken by the discrepancy.
4. **LOG & BLOCK:** Record the issue in `docs/memory/OPEN_QUESTIONS.md` under a formal identifier (`OQ-<AREA>-NNN`).
5. **ESCALATE:** Present the trade-off to the Human Product Owner with recommended options. The affected scope remains **BLOCKED** until formally arbitrated.

---

## 3. Statement Epistemology & Classification (Constitution §4)

Tag every statement in the requirement package:
- **FACT:** Directly evidenced by source code, passing tests, executed benchmarks, or approved documentation.
- **DECISION:** Explicitly approved choice recorded in `docs/memory/DECISIONS.md` or an accepted ADR.
- **ASSUMPTION:** Working hypothesis. Must be accompanied by a validation plan and risk rating. Never treat assumptions as facts.
- **UNKNOWN:** Missing information. Must be investigated before development or marked as an open blocker.

---

## 4. Requirement Drafting Standards

### 4.1 INVEST User Story Formulation
Every story must be:
- **I**ndependent: Minimal coupling with other stories in the sprint.
- **N**egotiable: Captures the essence of what is needed, leaving implementation flexibility.
- **V**aluable: Delivers observable value to a defined ${PROJECT_NAME} persona.
- **E**stimable: Well-defined boundaries enabling confident technical sizing.
- **S**mall: Deliverable within a single sprint iteration (vertical slice).
- **T**estable: Accompanied by Given/When/Then acceptance criteria.

### 4.2 Given/When/Then Gherkin Acceptance Criteria
Acceptance criteria must assert **observable behavior**, not internal code mechanisms:
- ✅ *Valid:* "Given a jobseeker with 0 credits, When they trigger CV keyword tailoring, Then the request is rejected with HTTP 422 and message 'Saldo kredit tidak mencukupi', and no credit ledger mutation occurs."
- ❌ *Invalid:* "System checks user credits using CreditService and throws an exception." (Specifies internal implementation rather than contract behavior).

Every story must include:
- **Happy Path Scenarios:** Nominal operational journey.
- **Boundary & Extreme Scenarios:** Zero inputs, maximum file sizes, multi-byte Unicode strings, high-concurrency requests.
- **Negative & Failure Scenarios:** Missing authentication, foreign resource access (IDOR attempt), unhandled third-party downtime, rate limit exhaustion.

### 4.3 Business Rule Numbering Protocol (`BR-${PROJECT_ID}-NNN`)
- Every business rule must carry a unique, immutable identifier: `BR-${PROJECT_ID}-NNN` (e.g. `BR-${PROJECT_ID}-006`: Data Minimization Rejection of NIK and Full Address).
- **Prohibition:** Never reuse deleted rule numbers or renumber existing rules. New rules must take the next sequential integer.

---

## 5. Non-Functional Requirements (NFR) Quantification

Never use subjective adjectives. Quantify every non-functional expectation:

| Qualitative Descriptor (Rejected) | Quantitative NFR Specification (Approved) | Verification Method |
|---|---|---|
| "Harus cepat" | P95 API response latency $< 300\text{ms}$ for cached/indexed CRUD operations | k6 HTTP load test |
| "Aman dari serangan" | Server-side ownership validation on 100% of entity IDs; zero IDOR vulnerabilities | Automated IDOR matrix test |
| "Ramah disabilitas" | WCAG 2.1 Level AA compliance; zero critical Axe violations; 100% keyboard navigable | Playwright + Axe audit |
| "Ekspor PDF cepat" | A4 PDF compilation and byte-stream generation $< 3000\text{ms}$ | Playwright timer |
| "Evaluasi ATS instan" | 17-factor ATS diagnostic rule execution $< 1500\text{ms}$ | Vitest benchmark |

---

## 6. Statutory Compliance & Privacy Assessment (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile))

Every requirement package must include an explicit Privacy Impact Section:
1. **Data Minimization Justification:** For every field collected, state why it is strictly necessary for service delivery.
2. **Rejected Field Filter (`BR-${PROJECT_ID}-006`):** National identification numbers (`nik`) and full residential addresses (`alamat_lengkap`) are prohibited. Inputting them must return HTTP 422.
3. **Lawful Basis & Consent:** Identify if the feature requires explicit user consent (`user_consents` table) and ensure consent is unbundled and revocable.
4. **Account Erasure Cascade Parity:** Verify that any new persistent data structure is automatically hard-deleted when the user executes `DELETE /api/v1/user/account` within the statutory $< 30\text{s}$ SLA.

---

## 7. Requirement Traceability Matrix (RTM) Formulation

Generate a forward-and-backward traceability mapping for the requirement:

```markdown
| Requirement ID | Acceptance Criterion | Domain Module | Target Route / Schema | Planned Test Case | Status |
|:---:|:---:|:---:|:---:|:---:|:---:|
| BR-${PROJECT_ID}-042 | AC-01: Tailor CV nominal | `src/modules/cv` | `POST /api/v1/cv/tailor` | `TC-CV-012` | PLANNED |
| BR-${PROJECT_ID}-042 | AC-02: Zero credit rejection | `src/modules/billing` | `POST /api/v1/cv/tailor` | `TC-BILL-008` | PLANNED |
| BR-${PROJECT_ID}-042 | AC-03: IDOR cross-user probe | `src/modules/identity` | `POST /api/v1/cv/tailor` | `TC-SEC-015` | PLANNED |
```

---

## 8. Definition of Ready (DoR) Gate 1 Sign-Off Checklist

A requirement package passes Gate 1 if and only if all items are verified:
- [ ] User stories follow INVEST criteria with prioritized Given/When/Then ACs (P0/P1/P2).
- [ ] All business rules carry immutable `BR-${PROJECT_ID}-NNN` identifiers.
- [ ] Boundary conditions (0, 1, max, invalid, unicode) explicitly enumerated.
- [ ] Non-functional requirements quantified with numeric SLA thresholds.
- [ ] Privacy impact documented (UU PDP minimization, consent, erasure SLA).
- [ ] Zod request and response interface contracts drafted.
- [ ] All requirement conflicts arbitrated or logged in `OPEN_QUESTIONS.md`.
- [ ] RTM mapping initiated with planned test case identifiers (`TC-*`).

---

## Output Contract

STATUS: READY_FOR_DEV / SPECIFICATION_INCOMPLETE / BLOCKED
- **REQUIREMENT SPECIFICATION:** Full PRD/User Story package.
- **BUSINESS RULES DEFINED:** `BR-${PROJECT_ID}-NNN` rules table.
- **GHERKIN SCENARIOS:** Given/When/Then testable criteria.
- **TRACEABILITY MAPPING:** RTM table connecting Reqs to TCs.
- **GATE 1 STATUS:** Verification against DoR checklist.
