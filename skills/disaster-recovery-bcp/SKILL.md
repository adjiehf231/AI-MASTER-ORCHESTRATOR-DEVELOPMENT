---
name: disaster-recovery-bcp
description: "Disaster Recovery (DR) and Business Continuity Planning (BCP) engineering playbook — Recovery Time Objective (RTO) and Recovery Point Objective (RPO) verification, automated snapshot restoration drills, multi-region failover playbooks, and split-brain resolution."
---

# Enterprise Disaster Recovery & Business Continuity Playbook

## 1. Identity & Mandate

This playbook governs the resilience, emergency failover, data restoration, and business continuity architecture for ${PROJECT_NAME}.
The objective is to guarantee system survivability against datacenter outages, regional cloud failures, catastrophic database corruption, and ransomware scenarios with verified Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO).

Authoritative references: Enterprise Engineering Constitution (§1–§20), `agents/devops-engineer.md`, and `skills/observability-resilience/SKILL.md`.

---

## 2. Hard Disaster Recovery Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Untested Backup Restorations:** Relying on scheduled database backups without automated, regular restoration verification drills onto an isolated verification tier = **SEVERITY S1 RESILIENCE BLOCKER -> REJECTED**.
2. **Missing Tier-Classified RTO/RPO SLAs:** Any production service operating without formally committed and measurable RTO and RPO metrics = **GATE FAILURE -> REJECTED**.
3. **Single Point of Failure (SPOF) in Core Traffic:** Routing ingress production traffic through single-AZ components or unhedged DNS providers without secondary health-check failover = **CRITICAL RISK -> REJECTED**.
4. **Untested Failback Procedures:** Planning failover to a disaster recovery region without documented and tested procedures for restoring state to the primary region without data loss = **REJECTED**.

---

## 3. The Enterprise RTO & RPO Tier Matrix

Every system component must belong to one of four resilience tiers:

| Tier | Classification | Target RTO (Max Downtime) | Target RPO (Max Data Loss) | Architecture Pattern |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 0** | Core Auth & Transaction Ledger | $< 5$ minutes | $< 1$ minute | Multi-AZ Synchronous Replication + Cross-Region Read Replica |
| **Tier 1** | Customer API & Primary App | $< 15$ minutes | $< 5$ minutes | Active-Passive Multi-Region with Automated DNS Cutover |
| **Tier 2** | Background Workers & Reports | $< 2$ hours | $< 1$ hour | Containerized Auto-Scaling with Persistent State in Cloud Storage |
| **Tier 3** | Internal Tools & Telemetry | $< 8$ hours | $< 24$ hours | Daily Encrypted Snapshots with Automated Terraform Rebuild |

---

## 4. Automated Database Backup & Restoration Drills

Backups are meaningless unless restoration is empirically verified. The automated pipeline must execute weekly:

```
[Production Primary DB]
         │ (Continuous WAL Archiving + Daily Snapshot)
         ▼
[Encrypted Cloud Storage]
         │
         ▼ (Weekly Automated Drill Trigger)
[Isolated Sandbox Environment] ──► Restore Snapshot ──► Replay WAL to Point-in-Time
                                                               │
                                                               ▼
                                                  [Integrity Verification Queries]
                                                  - Row counts match production baseline
                                                  - Latest transaction timestamp within RPO
                                                  - Cryptographic checksums pass
                                                               │
                                                               ▼
                                                  [Tear Down Sandbox & Publish Drill Report]
```

---

## 5. Multi-Region Failover Protocol & Split-Brain Defense

In the event of an unrecoverable primary region outage:

1. **Failure Confirmation:** Minimum 3 independent health-check probes confirm primary region outage for $> 120$ seconds.
2. **Promotion of Secondary Database:**
   - Terminate replication link from primary.
   - Execute `SELECT pg_promote();` on secondary PostgreSQL replica.
   - Verify secondary is in read-write mode.
3. **DNS / Anycast Traffic Cutover:**
   - Update global traffic manager / Cloudflare DNS routing to target secondary region load balancer (TTL: 60s).
4. **Split-Brain Prevention:**
   - If primary region recovers, strictly prohibit opening primary to traffic until it is reconfigured as a replica of the newly promoted primary.

---

## 6. Disaster Recovery Incident Post-Mortem

Following any failover event or drill, the team must produce a formal **Disaster Recovery Post-Mortem Report**:
- Actual vs Target RTO and RPO.
- Any observed data lag or loss.
- Bottlenecks during failover and cutover.
- Action items added to `docs/memory/TECHNICAL_DEBT.md`.

