---
name: Release Management
description: Execution of ${PROJECT_NAME} release governance, environment promotion matrix, Change Advisory Board (CAB) reviews, zero-downtime deployment, automated smoke tests (<30s), and rollback runbooks. Use when preparing, executing, or rolling back releases.
---

# Release Management & Delivery Governance — ${PROJECT_NAME}

Authoritative sources: `docs/process/RELEASE_GOVERNANCE.md`, `docs/process/CHANGE_MANAGEMENT.md`, `docs/operations/ENVIRONMENT_TOPOLOGY.md`, and `docs/qa/RELEASE_QUALITY_GATES.md`.

No release enters production on hope or haste. Every release is governed by immutable invariants, verified quality gates, and pre-tested rollback mechanisms.

---

## 1. Statutory Release Invariants (Non-Negotiable)

1. **Zero Open S1 / S2 Defects:** A production release candidate is strictly rejected if any open Critical (`S1`) or High (`S2`) defect exists.
2. **Deterministic Rollback Strategy:** Every release package must include verified Drizzle down-migration scripts and container rollback triggers.
3. **Continuous Observability:** Error tracking, health probes, and audit logs are monitored continuously post-launch.
4. **Environment Isolation:** Sandbox, UAT, and Production must use distinct databases (`${DB_NAME}_sit`, `${DB_NAME}_uat`, `${DB_NAME}_prod`), distinct session secrets, and distinct third-party credentials.

---

## 2. Environment Promotion Playbook

```mermaid
flowchart TD
    Candidate[Release Candidate Branch] --> SIT[1. Deploy to Sandbox/SIT ${DB_NAME}_sit]
    SIT --> SITCheck{Automated SIT Suite & ATS Engine Pass?}
    SITCheck -->|Yes| UAT[2. Deploy to UAT ${DB_NAME}_uat]
    SITCheck -->|No| HaltSIT[Halt & File S1 Defect]
    UAT --> UATSync[Run Data Mirroring & Sanitization: npm run sync:uat]
    UATSync --> UATSignOff{Human PO Sign-Off Approved?}
    UATSignOff -->|Yes| ProdDeploy[3. Zero-Downtime Deploy to ${DB_NAME}_prod]
    UATSignOff -->|No| HaltUAT[Halt Release]
    ProdDeploy --> Smoke{Automated Smoke < 30s Pass?}
    Smoke -->|Pass| Canary[4. Monitor Canary Telemetry]
    Smoke -->|Fail| Rollback[5. Immediate Automated Rollback]
```

### Stage 1: Sandbox / SIT Promotion (`${DB_NAME}_sit`)
- Deploy target: `${DB_NAME}_sit` (`APP_ENV=sandbox`).
- Pre-flight: Execute `npm run verify:tiers` and seed synthetic fixtures via `npm run seed:sit`.
- Verification: Execute automated integration suite covering 17-factor ATS diagnostic rules, Job Matcher, and Admin portal with mock external dependencies (`AI_PROVIDER=mock`, MailHog).

### Stage 2: UAT Promotion (`${DB_NAME}_uat`)
- Deploy target: `${DB_NAME}_uat` (`APP_ENV=uat`).
- Data Mirroring: Execute `npm run sync:uat` to populate a 1:1 production volume snapshot with deterministic PII masking per Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile).
- Stakeholder Sign-Off: Facilitate end-to-end business acceptance with the Human Product Owner and archive the signed package in `docs/governance/PROMPT_50_UAT_PRODUCT_OWNER_SIGNOFF.md`.

### Stage 3: Production Deployment (`${DB_NAME}_prod`)
- Deploy target: `${DB_NAME}_prod` (`APP_ENV=production`).
- Database Sequencing:
  1. Apply non-destructive forward migrations: `npm run db:migrate`.
  2. Verify migration baseline parity: `npm run db:verify` (12 canonical migrations baseline).
- Application Sequencing: Blue/Green container swap or zero-downtime rolling restart.

---

## 3. Post-Deployment Verification & Smoke Protocol

Immediately upon traffic routing to the new production build:
1. **Automated Smoke Suite:** Execute production smoke tests targeting:
   - Health probe endpoint (`GET /api/health` -> HTTP 200).
   - Core identity authentication check (session cookie validation).
   - Read-only master career profile fetch.
   - Non-destructive test ping.
   - **Threshold:** The entire smoke suite MUST complete in `< 30s`.
2. **Canary Telemetry Watch (First 60 Minutes):**
   - Error Rate Budget: HTTP 5xx responses must stay `< 0.1%`.
   - Latency Budget: P95 API response times must stay `< 300ms`.
   - Credit Deduction Audit: Zero concurrency overspends or negative balance events.

---

## 4. Rollback Runbook & Trigger Criteria

### Rollback Triggers (Immediate Execution Required)
- Production smoke test fails or exceeds 30 seconds.
- 5xx error rate spikes above 0.5% over a 5-minute rolling window.
- Unhandled database deadlock or connection pool exhaustion detected.
- Any S1 data-corruption, privacy leak, or credit double-spend reported.

### Rollback Step-by-Step Runbook
1. **Traffic Reversion:** Instantly switch reverse proxy / load balancer traffic back to the previous stable blue container.
2. **Database Reversion (if migration was applied):**
   - If change followed expand/contract staging: leave additive columns in place (previous code version is forward-compatible).
   - If destructive change occurred: execute pre-tested Drizzle down-migration script.
3. **Notification & Incident Freeze:** Log incident in `docs/operations/INCIDENT_LOG.md` and trigger emergency team notification.
4. **Post-Mortem Requirement:** Convene blameless post-mortem within 24 hours to identify root causes and generate corrective actions.

---

## Output Contract

STATUS: READY_FOR_DEPLOY / PROMOTED / ROLLED_BACK
- **RELEASE VERSION & COMMIT:** Target semantic version and Git SHA.
- **GATE VERIFICATION STATUS:** Audit results for Gates 1–7.
- **ENVIRONMENT PROMOTION LOG:** Results of SIT, UAT, and Prod execution.
- **SMOKE & CANARY EVIDENCE:** Verbatim smoke duration (<30s) and telemetry metrics.
- **ROLLBACK READINESS:** Status of down-migration script and rollback triggers.
- **NEXT ACTIONS:** Post-release monitoring or incident review.
