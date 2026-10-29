---
name: Code Review
description: Adversarial code review methodology to merge-gate standards — blast-radius mapping, mutation thinking on tests, contract-consistency checks, security/privacy regression sweeps, Next.js 16 App Router discipline, and severity-ranked findings (🔴 BLOCKING / 🟡 SHOULD FIX / 🔵 NIT). Use when reviewing pull requests or diffs.
---

# Adversarial Code Review — ${PROJECT_NAME} (Merge-Gate Standard)

Authoritative sources: `docs/qa/RELEASE_QUALITY_GATES.md` (Gate 2), `docs/qa/SECURITY_TEST_STRATEGY.md`, and the Enterprise Engineering Constitution (§15).

The primary objective of code review is to **DISPROVE correctness**. A review that merely says "looks good to me (LGTM)" is an operational failure. Every pull request must be subjected to hostile inspection to identify edge-case failures, security vulnerabilities, requirement drift, and performance regressions before merging.

---

## Step 0 — Blast Radius & Context Formulation (10-Minute Pre-Flight)

Never review a `git diff` in isolation:
1. **Map the Blast Radius:** Identify not only the modified files, but all files that import from or export to the changed modules. Read the neighboring functions and modules before judging.
2. **Review Against Intent:** Cross-reference the diff against the linked User Stories, Gherkin Acceptance Criteria, and PRD specifications. Review against **INTENT**, not personal stylistic preferences.
3. **Classify the Risk Profile:**
   - *Schema Migration:* Highest blast radius (data loss, table lock risks).
   - *Bug Fix:* Regression risk (did it break surrounding behavior?).
   - *Feature Delivery:* Boundary validation and state matrix completeness.
   - *Refactoring:* Inadvertent behavioral mutations.

---

## Step 1 — Correctness & Algorithmic Flaws (🔴 BLOCKING Candidates)

- **Boundary Logic:** Check array indexing (off-by-one errors), null/undefined handling, empty collections, and multi-byte Unicode handling.
- **Asynchronous Pitfalls:**
  - Verify every Promise is properly awaited or returned.
  - Check for unhandled Promise rejections and race conditions in concurrent operations.
  - Verify that React hooks do not capture stale state in closures.
- **Transactional Integrity:**
  - Multi-step database mutations must execute inside atomic transactions (`db.transaction`).
  - Credit deduction paths must utilize pessimistic row locking (`FOR UPDATE`) to prevent concurrent double-spends.
- **Error Handling:**
  - Identify swallowed errors (`catch (e) {}`).
  - Ensure exceptions are either logged with diagnostic context or transformed into standardized error envelopes.

---

## Step 2 — Requirement Drift & Scope Creep

- **Undeclared Features (Scope Creep):** Does the diff introduce unapproved capabilities not requested in the acceptance criteria? Block immediately.
- **Missing Acceptance Criteria:** Does the diff fully satisfy all Given/When/Then scenarios? Unimplemented criteria must block the merge.
- **Spec Contradictions:** Check if code changes violate established `BR-${PROJECT_ID}-NNN` rules.

---

## Step 3 — Contracts & Type Synchronization

Verify mutual consistency across all four architectural tiers:
$$\text{Zod Request/Response Schemas} \iff \text{API Route Handlers} \iff \text{Drizzle Database Models} \iff \text{UI Component Models}$$
- **Zero `any` Policy:** Reject any usage of `any`, `@ts-ignore`, or unsafe type casting (`as unknown as T`) that bypasses type safety at boundary interfaces.
- **Error Envelopes:** Ensure all errors conform to `{ error: { code, message, details? } }`.

---

## Step 4 — Security & Privacy Regression Sweep (Diff-Introduced)

- **IDOR Guards:** Does every route handler receiving an entity ID verify server-side ownership before returning or mutating data?
- **Privacy Telemetry Whitelist (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile)):** Verify that no personal data (names, emails, phones, CV text) is leaked into analytics or logs. Whitelist: `event_id`, `timestamp`, `template_id`, `user_id_hash`.
- **Secrets Hygiene:** Verify that no private keys, passwords, or tokens are committed into source code or serialized into client bundles.
- **AI Prompt Delimiters:** Ensure user CV text is wrapped in untrusted data tags and isolated from system prompt instructions.

---

## Step 5 — Test Quality & Mutation Thinking

Evaluate test quality through intentional mutation thinking:
- **Mental Mutation:** Invert a conditional check (`if (balance >= 1)` $\to$ `if (balance > 1)`). Do the submitted tests **FAIL**?
- If the tests still pass when business logic is broken, the tests are superficial snapshots rather than behavioral assertions.
- **Mandatory Bug Fix Regression Test:** Any pull request fixing a defect must include an automated test that fails before the fix and passes after it (Constitution §13). Missing regression tests are automatic **🔴 BLOCKING FINDINGS**.

---

## Step 6 — Database & Migration Safety

If the diff includes database schema modifications:
- Review the generated DDL in `drizzle/` line by line.
- Verify that column renames or replacements follow expand/contract staging.
- Confirm that any new user-data table is added to the statutory account erasure cascade ($< 30\text{s}$ SLA).
- Verify that `npm run db:verify` passes against the target tier.

---

## Step 7 — Next.js 16 App Router Discipline

- **Server-First Boundary:** Are Server Components the default? Is `'use client'` restricted strictly to leaf nodes with interactive requirements?
- **Server Secret Isolation:** Are server-only environment variables or database models kept out of client components?
- **Bundled Docs Rule:** Do the Next.js patterns conform to the official documentation in `node_modules/next/dist/docs/`?
- **Layout Stability:** Does the UI implement skeleton loading states guaranteeing `CLS = 0`?

---

## Output Contract & Review Verdict

Findings must be classified strictly by severity:
- **🔴 BLOCKING:** Must be resolved before merging.
- **🟡 SHOULD FIX:** Maintainability, edge-case coverage, or structural improvements.
- **🔵 NIT:** Minor stylistic suggestions or comment improvements.

### Finding Format:
`[🔴/🟡/🔵] [file:///path/to/file.ts#L42-L56]`
- **Failure Scenario:** Concrete explanation of how the code breaks in production.
- **Remediation:** Concrete code fix.

```markdown
### CODE REVIEW VERDICT
- **STATUS:** [APPROVED / REQUEST_CHANGES]
- **TOTAL FINDINGS:** 🔴 N Blocking | 🟡 N Should Fix | 🔵 N Nits
- **TEST EXECUTION STATUS:** [Verified executed / Tests not executed by reviewer]
```
