---
name: Manual Testing
description: Enterprise manual and exploratory testing methodology for ${PROJECT_NAME} — Session-Based Test Management (SBTM), persona tours, hostile-input stress probes, cross-browser/device coverage beyond Chromium, defect filing with complete reproduction packages, regression suites, and UAT facilitation. Use when conducting manual exploratory sessions or validating fixes.
---

# Manual & Exploratory Testing — ${PROJECT_NAME} (Exploratory Quality Engineering)

Authoritative sources: `docs/qa/SIT_STRATEGY.md`, `docs/qa/UAT_STRATEGY.md`, `docs/qa/SMOKE_TEST_STRATEGY.md`, `docs/qa/REGRESSION_STRATEGY.md`, `docs/qa/TEST_EVIDENCE_STANDARD.md`, and `docs/qa/DEFECT_MANAGEMENT.md`.

Manual testing is not passive clicking; it is an active, investigative, and adversarial discipline. Automation verifies known assumptions; manual exploratory testing uncovers unknown edge cases, usability friction, visual defects, and complex concurrency races across browser tabs.

---

## 1. Session-Based Test Management (SBTM) Framework

All exploratory testing must be organized into structured, timeboxed charters:

```markdown
### SBTM CHARTER EXECUTION TEMPLATE
- **Charter Identifier:** `SBT-<AREA>-NNN`
- **Target Mission:** [Specific capability, persona, and targeted failure modes]
  - Example: "Explore the 3-pane CV Builder under low-bandwidth network throttling and multi-tab editing to discover state desynchronization and credit debit flaws."
- **Timebox:** 45–60 minutes (Strictly enforced; never exceed 60 minutes per charter).
- **Environment Tier:** Sandbox (`${DB_NAME}_sit`) | UAT (`${DB_NAME}_uat`).
- **Data Persona:** Seeded multi-persona profile (`npm run seed:sit`).
- **Tactical Tours Executed:**
  1. *Persona Journey Tour:* Nominal workflow mimicking authentic jobseeker/recruiter behavior.
  2. *Hostile Input Tour:* Extreme inputs, boundary strings, emojis, malformed files.
  3. *Interruption & Recovery Tour:* Disconnecting network mid-operation, refreshing browser tab, back/forward button navigation.
  4. *Multi-Tab Concurrency Tour:* Triggering identical actions simultaneously across multiple browser tabs.
  5. *Indonesian Copy Audit Tour:* Verifying linguistic clarity and emotional tone.
```

---

## 2. Environment & Synthetic Fixture Discipline

1. **Environment Verification:** Execute `npm run verify:tiers` before testing to confirm that services and databases are healthy.
2. **Synthetic Data Prohibition on PII:** Never use real production customer data in testing environments. Seed synthetic personas via `npm run seed:sit`.
3. **Destructive Flow Boundary:** Testing destructive operations (account erasure cascade, credit depletion, bulk candidate rejection) is strictly restricted to **Sandbox (`${DB_NAME}_sit`)**. UAT is reserved for business validation; Production receives only non-destructive smoke checks.
4. **Email Flow Verification:** Monitor transactional emails and OTP tokens via MailHog web interface on `http://localhost:8025`.

---

## 3. High-Priority ${PROJECT_NAME} Exploratory Probes

Conduct rigorous, targeted probes against ${PROJECT_NAME}'s core architectural risk centers:

### 3.1 Financial & Credit Ledger Integrity
- **Pre-Debit Disclosure:** Does the interface clearly inform the user of the credit cost before the transaction occurs?
- **Balance Consistency:** Does the credit balance update immediately and accurately in the header without requiring a manual page refresh?
- **Double-Click Defense:** Does rapid double-clicking on credit-consuming buttons trigger multiple debits?
- **Insufficient Balance State:** When balance is 0, is the user presented with an informative, actionable error message rather than a generic 500 failure?

### 3.2 AI Provenance Lineage
- **Visible Badging:** Are AI recommendations clearly marked with the *Saran AI* visual badge?
- **No Silent Verification:** When a user accepts an AI suggestion, is the content integrated into the CV draft without silently being promoted to `VERIFIED` status in the database?
- **Rejection Integrity:** If a suggestion is rejected, does it disappear permanently from the active draft?

### 3.3 Account Erasure Cascade (`DELETE /api/v1/user/account`)
- **Password Re-Authentication:** Does the interface demand password confirmation before initiating account deletion?
- **SLA Enforcement:** Does the deletion complete within $< 30\text{s}$?
- **Complete Wipe:** Verify that subsequent login attempts fail with HTTP 401, and that associated CVs, ATS diagnostic reports, and credit balances are wiped from the database.

### 3.4 Real-World File Uploads & Parsing Stress
- Upload messy, scanned PDFs lacking text layers (assert proper OCR guidance).
- Upload 15MB oversized PDF files (assert immediate, graceful HTTP 422 rejection; zero server freeze).
- Upload Word documents (.docx) containing multi-level nested tables and embedded images.
- Upload files with path-traversal filenames: `cv_../../etc/passwd.pdf`.

### 3.5 17-Factor ATS Scoring Sanity
- Submit resumes with missing dates, duplicate sections, or non-standard formatting.
- Assert that diagnostic category radar charts and sub-scores render deterministically without division-by-zero or `NaN` errors.

---

## 4. Cross-Browser & Device Responsiveness Matrix

Playwright CI tests only Desktop Chromium. Manual testing must walk the cross-browser matrix and report explicit coverage and gaps:

- **Desktop Firefox (Gecko):** Form validation bubbles, CSS Grid alignment, scrollbar behaviors.
- **Desktop Safari / WebKit:** Native date pickers, canvas rendering, CSS backdrop filters.
- **Mobile Viewports ($\le 380\text{px}$):** Safe-area notch handling, responsive hamburger menus, touch targets ($\ge 44\text{px}$), horizontal scroll elimination.

---

## 5. Defect Reporting Standard (docs/qa/DEFECT_MANAGEMENT.md)

An unreproducible defect report is a defective report. Every report must contain:
1. **Title:** `[Module] Summary of failure when action is executed under precondition`.
2. **Severity (`S1–S4`) & Priority (`P0–P2`):** Decoupled impact and urgency ratings.
3. **Preconditions:** Persona, environment tier, seeded data state.
4. **Step-by-Step Reproduction:** Numbered, unambiguous sequence of actions.
5. **Observed vs Expected:** Verbatim error messages, visual screenshots, and expected behavior.
6. **Attached Evidence:** Browser console logs, network HAR exports, MailHog email links, or video captures.

---

## 6. UAT Facilitation & Production Smoke Protocol

- **UAT Facilitation (Gate 5):**
  - Guide the Human Product Owner through end-to-end business acceptance scenarios on `${DB_NAME}_uat`.
  - Compile the formal sign-off package in `docs/governance/PROMPT_50_UAT_PRODUCT_OWNER_SIGNOFF.md`.
- **Production Smoke Testing (Gate 8):**
  - Execute immediately upon production deployment (`${DB_NAME}_prod`).
  - Must complete in **$< 30\text{s}$**.
  - Walk Golden Path: Login $\to$ Fetch Master Profile $\to$ Non-destructive health ping $\to$ Logout. Zero residual test data mutation.

---

## Output Contract

STATUS: DONE / PARTIAL / BLOCKED
- **CHARTERS EXECUTED:** List of `SBT-*` charters and session durations.
- **CROSS-BROWSER COVERAGE:** Browsers and viewports walked, plus explicit gaps.
- **DEFECTS FILED / RETESTED:** Formal defect tickets with reproduction evidence.
- **PROBE FINDINGS:** Results of credit, provenance, upload, and erasure probes.
- **GATE ASSESSMENT:** Recommendation for Gate 4 (SIT), Gate 5 (UAT), or Gate 8 (Smoke).
- **NEXT ACTIONS:** Defect remediation or release sign-off handoff.
