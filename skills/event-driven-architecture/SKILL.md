---
name: event-driven-architecture
description: "Enterprise asynchronous event-driven architecture standards — transactional outbox pattern, idempotent event consumers, schema registry (Avro/Protobuf/JSON Schema), dead-letter queue (DLQ) retry topologies, and consumer lag monitoring."
---

# Enterprise Event-Driven Architecture Standards Playbook

## 1. Identity & Mandate

This playbook governs the design, implementation, and verification of asynchronous, event-driven, and message-oriented communication systems across ${PROJECT_NAME}.
The objective is to achieve **zero event loss**, guaranteed eventual consistency, idempotent consumer execution, and resilient failure recovery without distributed locks or 2-phase commits (2PC).

Authoritative references: Enterprise Engineering Constitution (§1–§20), `skills/system-integration/SKILL.md`, and `skills/observability-resilience/SKILL.md`.

---

## 2. Hard Architectural Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Dual-Writing Without Transactional Outbox:** Writing to a primary database table and publishing an event to a message broker (Kafka/RabbitMQ/Redis) in separate, non-atomic operations = **CRITICAL CONSISTENCY HAZARD -> REJECTED**.
2. **Non-Idempotent Event Consumers:** Any consumer handler that mutates system state without verifying an `eventId` or unique idempotency key against processed records = **DOUBLE-PROCESSING VULNERABILITY -> REJECTED**.
3. **Missing Dead-Letter Queue (DLQ):** Processing message queues without explicit retry limits (max 3–5 retries) and failure dead-letter routing, causing poison-pill messages to halt consumer partitions = **SEVERITY S1 RESILIENCE BLOCKER -> REJECTED**.
4. **Breaking Schema Changes:** Publishing event payload mutations that remove fields or alter data types without backward and forward compatibility guarantees = **REJECTED**.

---

## 3. The Transactional Outbox Pattern

To eliminate the Dual-Write problem, always record outbound events inside the same relational database transaction as the business state mutation:

```typescript
// Atomic Outbox Transaction
await db.transaction(async (tx) => {
  // 1. Mutate primary business entity
  const order = await tx.insert(orders).values(newOrderData).returning();

  // 2. Insert event record in the same atomic transaction
  await tx.insert(outboxEvents).values({
    id: generateId(),
    aggregateType: 'Order',
    aggregateId: order[0].id,
    eventType: 'order.created',
    payload: JSON.stringify(order[0]),
    status: 'PENDING',
    createdAt: new Date(),
  });
});
```

An asynchronous outbox relay worker (e.g. Debezium CDC or periodic polling worker with `SKIP LOCKED`) reads pending outbox events, dispatches them to the broker, and marks them `PUBLISHED`.

---

## 4. Consumer Idempotency & Deduplication

Every event message must carry a unique `eventId` and `timestamp`. Consumers must enforce deduplication:

```typescript
async function handleEventWithDeduplication(event: DomainEvent): Promise<void> {
  const isDuplicate = await redis.set(`processed_event:${event.eventId}`, '1', 'EX', 86400, 'NX');
  if (!isDuplicate) {
    logger.warn(`Duplicate event received and skipped: ${event.eventId}`);
    return;
  }

  try {
    await processEvent(event);
  } catch (error) {
    // Release idempotency lock on retryable transient error
    await redis.del(`processed_event:${event.eventId}`);
    throw error;
  }
}
```

---

## 5. Retry, Backoff, Poison-Pill Quarantine & Dead-Letter Queue (DLQ) Topologies

```
[Event Broker] ──► [Consumer Worker] ──► Successful Processing (ACK)
                         │
                         ├─► (Fatal Schema / Malformed JSON) ──► [Poison-Pill Quarantine]
                         │
                         ▼ (Transient Error)
                   [Retry Queue with Exponential Backoff + Jitter]
                         │
                         ▼ (Attempts > Max Limit)
                   [Dead-Letter Queue (DLQ)]
                         │
                         ▼
                   [Alerting + Operational Triage Runbook]
```

- **Retry Limit:** Maximum 3 to 5 retries.
- **Backoff Formula:** $T_{\text{backoff}} = \min(T_{\text{max}}, T_{\text{base}} \times 2^{\text{attempt}}) + \text{jitter}$.
- **Poison-Pill Quarantine Protocol:** If an incoming event cannot be parsed (malformed JSON or corrupted bytes), immediately divert it to `poison_pill_quarantine` with error metadata (`x-death-reason: "MALFORMED_PAYLOAD"`) and ACK the partition. Never retry a deterministic parsing failure in a loop that blocks partition progress.
- **DLQ Alarm:** Any message routed to DLQ or quarantine must trigger a high-priority operational alert.

---

## 6. Schema Evolution & Versioning Rules

1. **Additive Changes Only:** New fields must always be optional or have defaults.
2. **Deprecation Policy:** Never delete an existing field in an event schema until all downstream consumers have upgraded (minimum 2 minor release cycles).
3. **Payload Typing:** All events must validate against formal Zod, JSON Schema, or Protobuf definitions.

---

## 7. Consumer Lag Monitoring & Partition Health

Maintain real-time observability over message processing queues:
- **Consumer Lag Metric:**
  $$\Delta_{\text{lag}} = \text{Latest Produced Offset} - \text{Committed Consumer Offset}$$
- **Thresholds & Alerting:**
  - Warning: $\Delta_{\text{lag}} > 500$ messages or processing delay $> 30\text{s}$.
  - Critical S1: $\Delta_{\text{lag}} > 2000$ messages or processing delay $> 120\text{s}$.
- **Backpressure & Recovery:**
  - Autoscale consumer worker concurrency or trigger message throttling at the ingestion gateway when lag exceeds critical thresholds.

