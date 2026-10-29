---
name: uiux-review
description: Comprehensive UI/UX heuristic evaluation and digital accessibility audit — Nielsen's 10 heuristics, Anti-AI-Slop craft validation, WCAG 2.2 AA keyboard and screen reader protocols, microcopy governance, and S1–S4 defect mapping. Use when evaluating user flows, auditing accessibility, or signing off designs.
---

# UI/UX Review & Accessibility Audit — Enterprise Heuristics & Standards

Authoritative sources: `skills/ui-ux-design-system/`, `${DOCS_DIR}/ui/`, `docs/qa/ACCESSIBILITY_TEST_STRATEGY.md`, and the Enterprise Engineering Constitution.

A feature is not done merely because backend code executes. If an interface is confusing, excludes users with disabilities, conceals errors behind endless spinners, exhibits generic AI slop, or obscures transactional costs, it is an incomplete and defective delivery.

---

## 1. The 5-Step Evaluator Walkthrough Protocol

Before rendering any verdict, stress-test the interface under active operational conditions:

1. **Dual Viewport Walkthrough:** Walk the entire flow on standard Desktop ($1920\text{px}$) AND narrow Mobile viewport ($\le 380\text{px}$). Verify zero horizontal scrollbars, fluid padding, and clean touch target scaling ($\ge 44 \times 44\text{px}$).
2. **Keyboard-Only Traversal (Zero Mouse Interaction):**
   - Traverse the entire flow using only `Tab`, `Shift+Tab`, `Enter`, `Space`, and `Escape`.
   - Verify that focus order follows logical visual reading order.
   - Verify visible focus rings on all active elements ($\ge 3:1$ contrast against adjacent background).
   - In modals and popovers: verify focus is trapped inside while open and restored to trigger element on close.
3. **Force the Universal 6-State Matrix:**
   - Throttle network to Slow 3G: verify skeleton loader reserves layout space (`CLS = 0`).
   - Query empty state: verify instructional copy teaches the first user action.
   - Simulate API 500 / 422: verify error banner provides clear explanation and retry affordance.
   - Test unauthorized role: verify clean permission-denied message without leaking internal IDs.
   - Disconnect network: verify offline cached state and graceful recovery.
4. **Anti-AI-Slop Craft Audit:**
   - Verify zero emoji icons used in place of proper SVG controls.
   - Verify zero arbitrary background glow blobs or fake decorative charts.
   - Verify that dark mode uses layered obsidian/slate tones rather than harsh inverted black.
   - Verify that widescreen desktop displays make fluid use of available space without awkward empty gutters.
5. **Transactional & AI Transparency Check:**
   - Check billing/quota/credit balance display before, during, and after any transaction.
   - Verify that deduction warnings appear **BEFORE** the user commits an irreversible action.
   - Verify that AI-generated suggestions carry explicit visual provenance tags (e.g. *AI Suggestion* badge) and require explicit user acceptance.

---

## 2. Nielsen's 10 Usability Heuristics (Enterprise Probes)

| # | Heuristic | Enterprise Evaluation Probe |
|---|---|---|
| **1** | **Visibility of System Status** | Async operations (compilation, uploads, AI inference, sync) must show continuous progress indicators with cancellation affordances. |
| **2** | **Match Between System & Real World** | Use clear, authentic domain terminology. Avoid exposing internal database IDs, technical stack traces, or raw error codes to end users. |
| **3** | **User Control & Freedom** | Provide undo and back affordances. Display explicit confirmation dialogs before irreversible actions. |
| **4** | **Consistency & Standards** | Re-use standardized design tokens and components from `${SRC_DIR}/components/`. Bespoke, unstyled buttons or mismatched color palettes are findings. |
| **5** | **Error Prevention** | Disable submit buttons immediately upon click to prevent double-submits. Enforce input masks on dates, currency, and phone numbers. |
| **6** | **Recognition Rather Than Recall** | Pre-populate existing user data where applicable. Keep field labels visible above inputs rather than relying on vanishing placeholders. |
| **7** | **Flexibility & Efficiency of Use** | Support power users with keyboard shortcuts. Provide bulk screening, filtering, and export affordances for high-volume workflows. |
| **8** | **Aesthetic & Minimalist Design** | Enforce data minimization. Eliminate superfluous form fields that degrade completion rates and increase cognitive friction. |
| **9** | **Help Users Recognize & Recover from Errors** | Error messages must clearly explain what went wrong and provide an immediate corrective step. |
| **10** | **Help & Documentation** | Empty states must teach the first action rather than merely announcing absence (e.g. guide user to create their first item). |

---

## 3. WCAG 2.2 Level AA Accessibility Audit Checklist

Audit compliance across all 4 accessibility principles:

### 3.1 Perceivable
- [ ] Text contrast $\ge 4.5:1$ for standard text and $\ge 3:1$ for large headings ($>18\text{pt}$ or bold $>14\text{pt}$).
- [ ] UI controls and borders achieve $\ge 3:1$ contrast against adjacent backgrounds.
- [ ] Zero information conveyed solely by color (e.g. combine color with an icon or text label).
- [ ] Images carry meaningful `alt` text; purely decorative images set `alt=""`.

### 3.2 Operable
- [ ] 100% of interactive elements reachable and operatable via keyboard alone.
- [ ] Prominent, visible focus indicator on all focused elements ($\ge 3:1$ contrast).
- [ ] Zero keyboard traps.
- [ ] Modals trap focus inside while open and return focus to trigger button upon close.
- [ ] Interactive touch targets achieve minimum size of $44 \times 44\text{px}$.

### 3.3 Understandable
- [ ] Document language set correctly (e.g. `<html lang="en">` or matching locale).
- [ ] Input fields carry explicit `<label>` elements or accessible `aria-labelledby`.
- [ ] Form input errors bound to inputs using `aria-describedby` and marked with `aria-invalid="true"`.
- [ ] Predictable navigation: navigation menus and layouts maintain consistent positioning across pages.

### 3.4 Robust
- [ ] Clean semantic HTML: proper heading hierarchy (`h1` $\to$ `h2` $\to$ `h3`).
- [ ] Zero duplicate HTML element IDs on the same page.
- [ ] Dynamic updates announced via `aria-live="polite"` regions.
- [ ] Automated Axe scan in E2E suite reports 0 violations.

---

## 4. Microcopy & Terminology Standard

- Enforce consistent terminology across all product surfaces according to the project's glossary.
- Error copy formula:
  $$\text{[What happened]} + \text{[Why it occurred]} + \text{[Actionable step to recover]}$$
- Avoid passive-aggressive or blaming tone (e.g. "You entered an invalid email" $\to$ "Please enter a valid email address such as name@example.com").

---

## 5. Usability Defect Classification Standard (S1–S4)

- **`S1` (Critical Exclusion / Data Risk):** Critical user journey uncompletable by keyboard, focus trapped permanently in dialog, destructive/billing action executed without confirmation.
- **`S2` (High Usability Friction):** Unhandled error state with infinite spinner, form validation errors invisible to screen readers, touch target overlap blocking mobile taps.
- **`S3` (Medium Friction):** Inconsistent terminology between surfaces, sub-optimal tab order, missing empty state guidance, generic AI slop aesthetic.
- **`S4` (Low / Cosmetic):** Minor visual misalignment, non-standard padding, minor copy phrasing polish.

---

## Output Contract

STATUS: APPROVED / APPROVED_WITH_CONDITIONS / REJECTED
- **FLOWS & VIEWS AUDITED:** Screen paths in `${SRC_DIR}/components/` or `${SRC_DIR}/features/`.
- **ANTI-AI-SLOP AUDIT:** Verification of SVG icons, obsidian/slate color systems, and non-generic design.
- **HEURISTIC EVALUATION REPORT:** Findings mapped across Nielsen's 10 dimensions.
- **ACCESSIBILITY AUDIT EVIDENCE:** WCAG 2.2 AA evaluation and Axe automated scan results.
- **USABILITY DEFECTS FILED:** S1–S4 defects with proposed `TC-UX-NNN` regression test cases.
- **MICROCOPY & GLOSSARY AUDIT:** Status of domain terminology consistency.
- **NEXT ACTIONS:** Frontend engineer handoff or release manager sign-off.
