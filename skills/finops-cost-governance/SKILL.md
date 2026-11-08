---
name: finops-cost-governance
description: "Cloud infrastructure and LLM inference cost governance playbook — unit economics modeling, token budgeting, prompt caching, container rightsizing, egress minimization, cost alerting thresholds, and billing anomaly detection."
---

# Enterprise Cloud & LLM FinOps Cost Governance Playbook

## 1. Identity & Mandate

This playbook governs the financial engineering, cost observability, and resource utilization efficiency across all compute, database, network, and AI/LLM infrastructure for ${PROJECT_NAME}.
The objective is to establish predictable unit economics, eliminate cloud and AI waste, and maintain a sustainable gross margin.

Authoritative references: Enterprise Engineering Constitution (§1–§20), `agents/finops-engineer.md`, and `skills/nfr-governance/SKILL.md`.

---

## 2. Hard Cost Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Unbudgeted Token Escalation:** Any new AI capability introduced without an explicit Token Budget Table and per-session cost model = **GATE FAILURE -> REJECTED**.
2. **Missing Daily Spend Alerting:** Any production environment without automated anomaly alerting triggers on daily cloud and LLM spend exceeding 125% of baseline = **BLOCKER -> REJECTED**.
3. **Provisioning Without Auto-Shutdown in Non-Prod:** Any test, sandbox, or preview environment left running 24/7 without automated sleep/shutdown policies outside working hours = **WASTE INADMISSIBLE -> REJECTED**.
4. **Uncompressed Cross-Region Egress:** Transporting bulk payloads (> 1MB) across cloud regions or public internet without compression and CDN caching = **REJECTED**.

---

## 3. LLM Token Economics & Cost Optimization

### A. The 4-Tier LLM Model Routing Architecture

Route requests to the lowest-cost model that satisfies quality and latency requirements:

```
[Incoming Request]
         │
         ▼
[Classifier / Fast Guard] ──► Simple Lookup / Formatting ──► Tier 1: Small/Fast Model (e.g. Flash / 8B)
         │                                                    (Cost: ~$0.05 / 1M tokens)
         ▼
[Complex Domain Evaluation / Reasoning] ──────────────────► Tier 2: Mid-Tier Model (e.g. Sonnet / 70B)
         │                                                    (Cost: ~$3.00 / 1M tokens)
         ▼
[High-Stakes Architecture / Medical / Legal] ─────────────► Tier 3: High-Reasoning Model (e.g. Opus / R1)
                                                              (Cost: ~$15.00 / 1M tokens)
```

### B. Prompt Caching & Prefix Optimization
- **Static Prefix Invariant:** Place system rules, tool definitions, and standard schema definitions at the very beginning of the prompt.
- **Dynamic Context Suffix:** Place user-specific query, session memory, and changing data at the end of the prompt.
- **Caching Threshold:** Ensure static prefix exceeds the minimum platform threshold (e.g. 1,024 tokens for Anthropic/DeepSeek) to trigger prompt prefix caching discounts (reducing input token costs by up to 80%).

### C. Semantic Caching Implementation
For repetitive queries, store embeddings in Redis/pgvector with cosine similarity threshold:
```typescript
async function queryWithSemanticCache(query: string, tenantId: string): Promise<string> {
  const queryEmbedding = await getEmbedding(query);
  const cached = await vectorCache.findNearest(queryEmbedding, { tenantId, threshold: 0.96 });
  
  if (cached) {
    metrics.increment('finops.cache.semantic_hit');
    return cached.response;
  }
  
  metrics.increment('finops.cache.semantic_miss');
  const response = await callLLM(query);
  await vectorCache.store(queryEmbedding, response, { tenantId, ttl: 86400 });
  return response;
}
```

---

## 4. Cloud Infrastructure Rightsizing Guidelines

### A. Container Sizing (Kubernetes / Docker)
- **CPU Request:** Set to p75 observed usage.
- **CPU Limit:** Set to 2x CPU request (or leave unthrottled with proper cgroup v2 prioritization).
- **Memory Request:** Set to p95 observed usage + 20% safety margin.
- **Memory Limit:** Set equal to Memory Request to prevent memory fragmentation and node overcommit eviction.

### B. PostgreSQL & Database Cost Safeguards
- **Connection Pooling:** Always utilize a connection pooler (e.g. PgBouncer) to prevent excessive memory overhead per PostgreSQL backend connection (~10MB RAM per direct connection).
- **Idle Query Termination:** Enforce `statement_timeout = '15s'` and `idle_in_transaction_session_timeout = '30s'` to prevent rogue locking transactions that spike CPU/IOPS.

---

## 5. FinOps Operational KPI Matrix

| Metric | Target SLA | Alert Threshold | Remediation Action |
| :--- | :--- | :--- | :--- |
| **LLM Cost per Active User** | $< \$0.15$ / month | $> \$0.25$ / month | Audit model routing, enforce semantic cache, truncate conversation history. |
| **Cache Hit Ratio (Semantic)** | $\ge 25\%$ | $< 15\%$ | Review embedding threshold and prompt variability. |
| **Prompt Caching Read Ratio** | $\ge 60\%$ | $< 40\%$ | Reorder prompt components to stabilize prefix. |
| **Non-Prod Cloud Spend Ratio** | $\le 20\%$ of total spend | $> 30\%$ of total spend | Audit idle sandbox environments, enable auto-sleep schedules. |
| **Egress Cost Percentage** | $\le 5\%$ of cloud bill | $> 10\%$ of cloud bill | Inspect CDN caching, VPC endpoints, and uncompressed API payloads. |

