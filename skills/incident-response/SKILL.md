---
name: incident-response
description: "Production incident management lifecycle — SEV1–SEV4 triage, incident commander protocol, containment runbooks, blameless 5-Whys root cause analysis, and corrective action item tracking."
---

# Production Incident Response & Blameless RCA Playbook — ${PROJECT_NAME}

Authoritative sources: Google SRE Handbook, PagerDuty Incident Response Guidelines, and Master Framework §16.

This playbook governs the full lifecycle of unexpected production outages, performance degradations, data corruption events, and security anomalies.

---

## 1. Incident Severity Classification & SLAs

| Severity | Operational Definition | Response SLA | Mitigation SLA | Leadership Notification |
|---|---|---|---|---|
| **SEV1: Critical Outage** | Core product down for $> 10\%$ of active users; data corruption or financial balance integrity violated. | $< 5\text{ minutes}$ | $< 60\text{ minutes}$ | Executive Sponsor & CTO immediately |
| **SEV2: Major Impairment** | Critical feature degraded with significant user impact; no viable workaround available; API $p_{95} > 2\text{s}$. | $< 15\text{ minutes}$ | $< 4\text{ hours}$ | Engineering Council & Tech Director |
| **SEV3: Minor Degradation** | Non-critical component failing; workaround available; low customer blast radius. | $< 2\text{ hours}$ | $< 24\text{ hours}$ | Module Lead |
| **SEV4: Cosmetic / Low** | Minor anomaly, internal operational metric alert, no direct customer impact. | Next business day | Next sprint | Incident Channel |

---

## 2. Emergency Incident Response Protocol

```
[1. Detection & Alert] ──► [2. Triage & Commander Appointed] ──► [3. Containment & Mitigation]
                                                                                │
                                                                                ▼
[6. Memory & Post-Mortem] ◄── [5. Verification & All-Clear] ◄── [4. Rollback or Fix Applied]
```

### The Incident Commander (IC) Role
1. **Appointment:** The on-call Tech Lead automatically assumes the IC role.
2. **Singular Authority:** The IC owns triage, communication, assignment of investigative leads, and rollback authorization.
3. **Primary Directives:** Focus on **mitigation first**, forensic investigation second. If a recent deployment caused the regression, **rollback immediately** rather than attempting to debug in production.

---

## 3. Blameless Post-Mortem & 5-Whys Root Cause Analysis (RCA)

Within 48 hours of resolving any SEV1 or SEV2 incident, the team must conduct a Blameless Post-Mortem:

1. **Timeline:** Minute-by-minute reconstruction of events (T-0 to All-Clear).
2. **5-Whys Analysis:** Drill down to systemic and architectural root causes without assigning individual human blame:
   - *Why 1:* Why did the service fail? (Connection pool exhausted).
   - *Why 2:* Why was connection pool exhausted? (Query did not use index and ran for $45\text{s}$).
   - *Why 3:* Why was there no index? (Migration was not executed with `EXPLAIN` verification).
   - *Why 4:* Why was verification missed? (Gate 2 CI check did not validate index adoption).
   - *Why 5:* Systemic root cause: CI pipeline lacked automated query budget enforcement.
3. **Corrective Action Items (CAPA):** Every post-mortem must generate at least 2 immutable preventative actions:
   - An automated regression test reproducing the failure.
   - An architectural heuristic logged in `docs/memory/HEURISTICS.md` or prohibited trap in `docs/memory/ANTI_PATTERNS.md`.
