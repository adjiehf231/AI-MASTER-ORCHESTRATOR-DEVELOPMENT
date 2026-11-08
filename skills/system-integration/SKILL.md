---
name: system-integration
description: "Enterprise inter-system integration standards (Framework §10) — REST API contracts, webhook reliability, OAuth 2.0 token lifecycles, message queues, retry with exponential backoff & full jitter, dead-letter queues (DLQ), idempotency keys, data synchronization, and partial failure resilience."
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

## 2. Protocol 1: Idempotency Key Engine & Payload Fingerprinting (Stripe Standard)

Every mutating endpoint accepting webhooks, payments, or third-party actions must implement the Idempotency Engine:

```typescript
// Canonical Idempotent Transaction Pattern with Cryptographic Fingerprinting
export async function processIdempotentEvent<T>(
  idempotencyKey: string,
  rawPayload: string | Buffer,
  actionName: string,
  execute: () => Promise<T>
): Promise<{ result: T; replayed: boolean }> {
  const crypto = await import('crypto');
  const payloadHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

  return await db.transaction(async (tx) => {
    // 1. Pessimistic lock on idempotency record
    const existing = await tx
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.key, idempotencyKey))
      .for('update');

    if (existing.length > 0) {
      // 2. Cryptographic Mismatch Guard
      if (existing[0].payloadHash !== payloadHash) {
        throw new UnprocessableEntityError(
          'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
          'Idempotency key telah digunakan dengan payload yang berbeda.'
        );
      }

      if (existing[0].status === 'COMPLETED') {
        return {
          result: JSON.parse(existing[0].responsePayload) as T,
          replayed: true, // Signals HTTP layer to set header Idempotent-Replayed: true
        };
      }
      if (existing[0].status === 'IN_PROGRESS') {
        throw new ConflictError('Permintaan serupa sedang diproses secara bersamaan.');
      }
    }

    // 3. Mark IN_PROGRESS with payload hash
    await tx.insert(idempotencyRecords).values({
      key: idempotencyKey,
      action: actionName,
      payloadHash: payloadHash,
      status: 'IN_PROGRESS',
      createdAt: new Date(),
    });

    // 4. Execute domain mutation
    const result = await execute();

    // 5. Mark COMPLETED with serialized response
    await tx
      .update(idempotencyRecords)
      .set({
        status: 'COMPLETED',
        responsePayload: JSON.stringify(result),
        completedAt: new Date(),
      })
      .where(eq(idempotencyRecords.key, idempotencyKey));

    return { result, replayed: false };
  });
}
```

---

## 3. Protocol 2: Webhook Reliability & Zero-Downtime Secret Rollover

1. **HMAC SHA-256 Signature Verification:**
   - Raw request byte body must be used to compute signature.
   - Use `crypto.timingSafeEqual()` to prevent timing attacks.
   - Reject missing or mismatched signatures with `401 Unauthorized`.
2. **Dual-Secret Key Rollover (Zero-Downtime Rotation):**
   - Webhook verifier checks signature against `WEBHOOK_SECRET_PRIMARY`.
   - If invalid and `WEBHOOK_SECRET_SECONDARY` is configured, attempt fallback check before rejecting.
3. **Replay Window Enforcement:**
   - Reject incoming requests with timestamp drift $> 300\text{s}$ (5 minutes).
4. **Sub-500ms Acknowledgment:**
   - Always return `200 OK` or `202 Accepted` immediately after signature verification.
   - Offload heavy processing to background workers. Never hold open external webhook HTTP connections during heavy operations.

---

## 4. Protocol 3: Resilient Outbound Calls, Bulkhead Isolation & Dead-Letter Queue (DLQ)

When calling third-party services (LLMs, Payment Gateway (Stripe/Midtrans/PayPal), SMTP, recruiters):
1. **Bulkhead Pattern (Concurrency Throttling):**
   - Isolate downstream connection pools via semaphores (e.g. max 10 concurrent requests to AI provider, max 20 to payment gateway) so slow upstream services cannot exhaust the application server thread pool.
2. **Timeout Budget:** Set explicit timeouts on all HTTP requests (default: $5000\text{ms}$).
3. **Exponential Backoff with Full Jitter:**
   $$t_{wait} = \text{random}(0, \; \min(t_{max}, \; t_{base} \times 2^{\text{attempt}}))$$
   - $t_{base} = 500\text{ms}$, $t_{max} = 10000\text{ms}$, max attempts = 5.
4. **Dead-Letter Queue:**
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

