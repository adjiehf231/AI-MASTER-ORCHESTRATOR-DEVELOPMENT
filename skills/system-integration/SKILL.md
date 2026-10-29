---
name: System Integration & Webhook Architecture
description: Enterprise inter-system integration standards (Framework §10) — REST API contracts, webhook reliability, OAuth 2.0 token lifecycles, message queues, retry with exponential backoff & full jitter, dead-letter queues (DLQ), idempotency keys, data synchronization, and partial failure resilience.
---

# System Integration & Webhook Architecture — ${PROJECT_NAME}

Authoritative sources: Master Framework (§10), `docs/integrations/`, and the Enterprise Engineering Constitution (§6, §8 & §11).

In enterprise architecture, systems do not live in isolation. Seamless, secure, and resilient integration across internal modules and external third-party services is the bedrock of business continuity.

Networks are unreliable. Third-party providers experience downtime. Webhooks arrive duplicated or out-of-order. Enterprise integration engineering mandates **fail-safe communication patterns, cryptographic verification, idempotent processing, and automated reconciliation**.

---

## 1. Enterprise Integration Topology

```mermaid
flowchart LR
    External[External Provider / Partner] -->|1. Incoming Webhook| Gateway[API Gateway / Route Handler]
    Gateway -->|2. Verify HMAC SHA-256| IdempCheck{3. Idempotency Check}
    IdempCheck -->|Duplicate / Completed| CachedResp[Return Cached Ack in <500ms]
    IdempCheck -->|New Event| Outbox[4. Transactional Outbox / Event Queue]
    Outbox --> Worker[5. Asynchronous Worker]
    Worker -->|6. Execute Domain Mutation| Database[(PostgreSQL 16)]
    Worker -->|7. Retry with Backoff & Jitter| ExternalAPI[Outbound External Call]
    ExternalAPI -->|Max Retries Exceeded| DLQ[8. Dead-Letter Queue (DLQ)]
```

---

## 2. Protocol 1: Idempotency Key Architecture & Deduplication

Every mutating endpoint accepting webhooks, payments, or third-party actions must implement the Idempotency Engine:

```typescript
// Canonical Idempotent Transaction Pattern
export async function processIdempotentEvent<T>(
  idempotencyKey: string,
  actionName: string,
  execute: () => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    // 1. Pessimistic lock on idempotency record
    const existing = await tx
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.key, idempotencyKey))
      .for('update');

    if (existing.length > 0) {
      if (existing[0].status === 'COMPLETED') {
        return JSON.parse(existing[0].responsePayload) as T;
      }
      if (existing[0].status === 'IN_PROGRESS') {
        throw new ConflictError('Permintaan serupa sedang diproses secara bersamaan.');
      }
    }

    // 2. Mark IN_PROGRESS
    await tx.insert(idempotencyRecords).values({
      key: idempotencyKey,
      action: actionName,
      status: 'IN_PROGRESS',
      createdAt: new Date(),
    });

    // 3. Execute payload
    const result = await execute();

    // 4. Mark COMPLETED with serialized response
    await tx
      .update(idempotencyRecords)
      .set({
        status: 'COMPLETED',
        responsePayload: JSON.stringify(result),
        completedAt: new Date(),
      })
      .where(eq(idempotencyRecords.key, idempotencyKey));

    return result;
  });
}
```

---

## 3. Protocol 2: Webhook Reliability & Security Standards

1. **HMAC SHA-256 Signature Verification:**
   - Raw request byte body must be used to compute signature.
   - Use `crypto.timingSafeEqual()` to prevent timing attacks.
   - Reject missing or mismatched signatures with `401 Unauthorized`.
2. **Replay Window Enforcement:**
   - Reject incoming requests with timestamp drift $> 300\text{s}$ (5 minutes).
3. **Sub-500ms Acknowledgment:**
   - Always return `200 OK` or `202 Accepted` immediately after signature verification.
   - Offload heavy processing to background workers. Never hold open external webhook HTTP connections during heavy operations.

---

## 4. Protocol 3: Resilient Outbound Calls & Dead-Letter Queue (DLQ)

When calling third-party services (LLMs, Midtrans, SMTP, recruiters):
1. **Timeout Budget:** Set explicit timeouts on all HTTP requests (default: $5000\text{ms}$).
2. **Exponential Backoff with Full Jitter:**
   $$t_{wait} = \text{random}(0, \; \min(t_{max}, \; t_{base} \times 2^{\text{attempt}}))$$
   - $t_{base} = 500\text{ms}$, $t_{max} = 10000\text{ms}$, max attempts = 5.
3. **Dead-Letter Queue:**
   - When 5 attempts fail, persist the event into `integration_dead_letters` table.
   - Store: `id`, `provider`, `endpoint`, `requestPayload`, `lastError`, `attemptCount`, `status='FAILED'`.
   - Provide an operational CLI/dashboard command to replay dead-letter messages.

---

## 5. Protocol 4: Data Synchronization & Reconciliation

1. **Daily Financial Reconciliation Job:**
   - Query external payment gateway ledger via REST API.
   - Compare transaction IDs, status (`SETTLEMENT`), and amounts against local `credit_ledgers` table.
   - Auto-resolve transient discrepancies or alert SRE in case of unresolvable state drift.
2. **Data Consistency Audit Trail:**
   - Every reconciliation run outputs an immutable audit log in `docs/reports/reconciliation/`.

---

## 6. Verification Checklist

- [ ] All webhook routes verify signatures via `timingSafeEqual`.
- [ ] Mutating routes enforce `Idempotency-Key` headers.
- [ ] External HTTP clients have bounded timeout budgets ($< 5\text{s}$).
- [ ] No external HTTP requests are made inside database transaction blocks.
- [ ] DLQ exists for permanently failed outbound deliveries.
- [ ] Reconciliation scripts exist for financial and high-value transactional integrations.

