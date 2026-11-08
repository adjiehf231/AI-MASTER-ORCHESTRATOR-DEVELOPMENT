---
name: threat-modeling
description: "Enterprise threat modeling methodology — STRIDE decomposition, DREAD risk scoring, attack trees, abuse cases, and automated vulnerability countermeasures."
---

# Enterprise Threat Modeling Playbook — ${PROJECT_NAME}

Authoritative sources: OWASP Threat Dragon, STRIDE framework, OWASP ASVS v4.0, and the Enterprise Engineering Constitution (§1–§20).

This playbook defines the standardized methodology for identifying, decomposing, scoring, and mitigating security threats across all ${PROJECT_NAME} software modules and network perimeters.

---

## 1. The STRIDE Threat Modeling Framework

Decompose every vertical slice and cross-module boundary against the 6 threat categories:

| STRIDE Category | Threat Description | Security Countermeasure Invariant | Gate Checklist |
|---|---|---|---|
| **S — Spoofing** | Adversary assumes the identity of a legitimate user or internal service. | Cryptographic session tokens, JWT with RS256/Ed25519, mTLS between microservices. | Strict signature verification; no unsigned tokens. |
| **T — Tampering** | Adversary alters request payloads, database rows, or transit data. | Message authentication codes (HMAC SHA-256), database row check constraints, TLS 1.3. | Idempotency keys & checksums verified. |
| **R — Repudiation** | User or service denies performing a sensitive or financial transaction. | Immutable, append-only audit ledgers recording timestamp, user ID hash, and action. | Audit log emitted synchronously within ACID tx. |
| **I — Information Disclosure** | Leaking sensitive user data, PII, internal stack traces, or credentials. | Data minimization, encrypted columns, sanitized logging envelopes (zero PII whitelist). | No stack traces or PII emitted to client or APM. |
| **D — Denial of Service** | Resource exhaustion (CPU, RAM, connection pool, bandwidth) via hostile inputs. | Distributed token-bucket rate limiting, payload size caps ($\le 10\text{MB}$), connection timeouts. | Rate limiter active; CPU-bound loops isolated. |
| **E — Elevation of Privilege** | User escalates permissions from standard user to admin or cross-tenant. | Server-side role & ownership verification on every protected handler; zero client trust. | IDOR penetration matrix verified (0 BOLA). |

---

## 2. DREAD Risk Scoring Methodology

Score every identified threat vector across 5 dimensions ($1 = \text{Low}, 3 = \text{Critical}$):
$$\text{Risk Score} = \frac{\text{Damage} + \text{Reproducibility} + \text{Exploitability} + \text{Affected Users} + \text{Discoverability}}{5}$$

- **High Severity ($\ge 2.5$):** Blocks Gate 2 and Gate 6. Must be remediated immediately.
- **Medium Severity ($1.8 - 2.4$):** Requires documented mitigation before Gate 7 (RC).
- **Low Severity ($< 1.8$):** Logged in Technical Debt Register (`docs/memory/TECHNICAL_DEBT.md`).

---

## 3. Threat Modeling Workflow per Feature

1. **Step 1 — Data Flow Diagram (DFD):** Map trust boundaries between Browser, API Route Handler, Database, and External Webhooks.
2. **Step 2 — STRIDE Analysis:** Interrogate each boundary crossing against the STRIDE table.
3. **Step 3 — Abuse Case Authoring:** Write testable Gherkin scenarios representing hostile attacks (e.g. attempting to submit oversized payloads, expired tokens, or foreign tenant IDs).
4. **Step 4 — Automated Regression Verification:** Bind abuse cases directly into integration test suites (`TC-${PROJECT_ID}-SEC-*`).

