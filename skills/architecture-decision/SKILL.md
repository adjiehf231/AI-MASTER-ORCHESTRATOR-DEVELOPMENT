---
name: Architecture Decision
description: Comprehensive architecture decision-making and ADR authoring framework — reversal cost quantification, module boundary governance, statutory invariant enforcement, failure mode analysis, and dependency evaluation per Constitution §19. Use when designing cross-module systems, adopting dependencies, or authoring ADRs.
---

# Architecture Decision & System Governance — ${PROJECT_NAME}

Authoritative sources: `docs/architecture/`, `docs/governance/`, `docs/integrations/`, and the Enterprise Engineering Constitution (§7–§12 & §19).

An architectural decision is a structural commitment that is expensive or irreversible to change. This skill provides the formal framework to evaluate options, analyze reversal costs, defend statutory invariants, and document decisions as immutable Architecture Decision Records (ADRs).

---

## 1. Statutory Triggers: When an ADR is Mandatory

An ADR is **legally mandatory** in `docs/architecture/` whenever a proposed change:
1. Crosses or modifies module boundaries across the 22 capabilities in `${SRC_DIR}/modules/*` or 6 domains in `${SRC_DIR}/domains/*`.
2. Adopts, upgrades, or removes an external runtime dependency or third-party SDK.
3. Alters the persistent database schema architecture, transaction boundaries, or concurrency isolation levels.
4. Impacts core statutory invariants: Provenance pipeline (`VERIFIED / INFERRED / SUGGESTED`), Account Erasure cascade ($<30\text{s}$ SLA), or Credit Ledger atomicity.
5. Modifies authentication, session lifecycle, token generation, or authorization models.
6. Has a high reversal cost: would require $> 2$ engineer-weeks or data migrations to revert in the future.

---

## 2. Boundary Mapping & Placement Governance

When introducing new functionality, determine its exact architectural location using the ${PROJECT_NAME} Placement Rules:

```
+-----------------------------------------------------------------------------------------+
| src/domains/ (Presentation & Surface Adapters)                                          |
| - web-jobseeker, web-recruiter, web-admin, compro, ads-job, social                      |
| - Responsibility: Next.js 16 pages, route handlers, view components, surface UI state   |
| - PROHIBITION: Never implement core domain rules or direct DB queries here.             |
+-----------------------------------------------------------------------------------------+
                                      | calls via public APIs
+-----------------------------------------------------------------------------------------+
| src/modules/ (Core Business Capabilities)                                               |
| - identity, cv, ats, billing, agent, jobs, applications, notifications, etc. (22 total)  |
| - Responsibility: Domain entities, business rule enforcement, Zod contract validation    |
| - INVARIANT: One capability per module. Expose public API exclusively via index.ts.     |
+-----------------------------------------------------------------------------------------+
                                      | utilizes technical ports
+-----------------------------------------------------------------------------------------+
| src/infrastructure/ (Technical Infrastructure & Third-Party Adapters)                   |
| - database/ (Drizzle ORM, PostgreSQL connection pools, migrations)                      |
| - ai/ (MockAIProvider, external LLM provider adapters)                                  |
| - email/ (MailHog SMTP adapter, transactional emailer)                                   |
| - storage/ (Local file store, object storage adapters)                                  |
| - INVARIANT: Must support zero-cost development via local or mock adapters.             |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Reversal Cost & Decision Evaluation Framework

Evaluate every architectural candidate against the five-dimension scorecard:

1. **Reversal Cost (1 to 5):** How much effort, downtime, and data restructuring is required to undo this choice if it fails? (Scores $>3$ demand explicit human approval).
2. **Failure Mode Topology:** What happens when:
   - The primary database experiences high connection latency or lock contention?
   - The external AI service times out or returns malformed JSON?
   - An ongoing migration fails halfway through execution?
   - Network connectivity is dropped mid-transaction?
3. **Data Integrity & Concurrency:** Does the design guarantee ACID properties for financial/credit transactions? Are invariants enforced at the database level (`CHECK`, `UNIQUE`, `FOREIGN KEY`) rather than relying solely on transient memory?
4. **Security & Blast Radius:** Does the architecture enforce server-side tenancy checks on 100% of entity access? Does it minimize the blast radius if a single module is compromised?
5. **Zero-Cost-First Alignment:** Can the architecture run 100% locally in development and CI without paying for proprietary cloud resources?

---

## 4. Statutory Invariants Checklist

Any architecture design must affirmatively prove preservation of the 5 ${PROJECT_NAME} Invariants:

- [ ] **1. Provenance Integrity:** AI-derived facts maintain explicit `VERIFIED`, `INFERRED`, or `SUGGESTED` provenance tags through database columns, API response payloads, and frontend views. Coercion into `VERIFIED` without explicit user confirmation is architecturally impossible.
- [ ] **2. Account Erasure Parity (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile)):** Any new table containing user-identifiable data is wired into the transactional hard-deletion cascade (`DELETE /api/v1/user/account` completing in $< 30\text{s}$).
- [ ] **3. Credit Ledger Atomicity:** Credit deductions and ledger appends execute within a single atomic database transaction utilizing pessimistic row locking (`FOR UPDATE`). Overspending is mathematically prevented (`CHECK balance >= 0`).
- [ ] **4. Server-Side Multi-Tenancy:** Authorization checks are enforced on every entity ID. Client-side visibility controls are treated as pure UX sugar, never as access boundaries.
- [ ] **5. Provider Pluggability:** External infrastructure dependencies (AI, payment, storage, email) reside behind strict interface abstractions with default mock implementations for local testing (`AI_PROVIDER=mock`, MailHog).

---

## 5. Dependency Adoption Protocol (Constitution §19)

Before adopting any external NPM or Pub package:
1. **Source & Maintenance Audit:** Verify active maintenance, regular releases within the last 6 months, and absence of open critical CVEs.
2. **License Clearance:** Confirm permissive OSS license (MIT, Apache-2.0, BSD). Restrictive, copyleft, or commercial licenses (GPL, AGPL, SSPL) are strictly rejected.
3. **Zero-Cost Principle:** Reject packages that require mandatory paid SaaS subscriptions or proprietary API keys for basic functionality.
4. **Bundle & Performance Impact:** Analyze package size via Bundlephobia; verify ESM/tree-shaking support and absence of native C++ binary bindings that break Windows/Linux cross-platform portability.

---

## 6. Formal ADR Template (`docs/architecture/ADR-<NNN>_<TITLE>.md`)

```markdown
# ADR-NNN: [Concise Decision Title]
- **Status:** [Proposed | Accepted | Deprecated | Superseded by ADR-MMM]
- **Date:** [YYYY-MM-DD]
- **Deciders:** Principal Solution Architect, [Lead Engineers]
- **Tags:** [architecture, database, identity, billing, security]

## 1. Context & Business Drivers
- Describe the technical context, business requirements, and operational constraints.
- Reference relevant BR-${PROJECT_ID}-NNN rules and NFR performance budgets.

## 2. Reversal Cost & Forces
- Analyze the cost to revert this decision in 6–12 months.
- Detail the trade-offs between delivery speed, operational complexity, and long-term maintenance.

## 3. Evaluated Architecture Options
### Option 1: [Name]
- Structural overview and data flow.
- Pros & Cons.
- Estimated Reversal Cost (1–5).
### Option 2: [Name]
...

## 4. Decision & Invariant Defenses
- Explicitly state the accepted solution.
- Detail how this decision preserves Provenance, Erasure Cascade, and Ledger invariants.

## 5. Consequences & Trade-Offs
- Positive Consequences (capabilities, performance gains).
- Negative Consequences (technical debt accepted, operational overhead).
- Mitigations for negative consequences.

## 6. Rollback & Disaster Recovery Runbook
- Exact step-by-step procedures to roll back this architecture if critical defects occur.
```

---

## Output Contract

STATUS: APPROVED / APPROVED_WITH_CONDITIONS / REJECTED
- **ADR IDENTIFIER & TITLE:** Path to generated ADR in `docs/architecture/`.
- **SYSTEM MODULES TOUCHED:** Affected modules and boundary interfaces.
- **INVARIANTS AUDITED:** Status of Provenance, Erasure, Ledger, and Authz invariants.
- **REVERSAL COST ASSESSMENT:** Quantitative score and justification.
- **NEXT ACTIONS:** Technical specification handoff to System Analyst.
