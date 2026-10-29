---
name: Performance Testing
description: Enterprise performance and load testing methodology against ${PROJECT_NAME} NFR budgets — API P95 < 300ms (k6), PDF export < 3s, ATS eval < 1.5s, zero credit overspend under concurrency, Lighthouse Core Web Vitals, and EXPLAIN ANALYZE evidence. Use when executing load tests, benchmarking, or triaging latency regressions.
---

# Performance & Load Testing — ${PROJECT_NAME} (NFR Budgets & Verification)

Authoritative sources: `docs/product/NFR.md` (the statutory performance budgets) and `docs/qa/PERFORMANCE_TEST_STRATEGY.md` (the measurement methodology).

Performance is an architectural contract. Unmeasured performance claims, estimated latencies, and "vibes-based" speed assessments are strictly forbidden under the Zero-Hallucination Performance Policy. Every performance figure must be backed by executed, reproducible test evidence.

---

## 1. The Statutory Performance Budget Table

| Target Journey / Operation | SLA / Budget | Tool | Measurement Method & Conditions |
|---|---|---|---|
| **API Latency (Cached/Indexed CRUD)** | **P95 $< 300\text{ms}$** | k6 (OSS) | 50 concurrent virtual users, warm cache, representative dataset |
| **A4 PDF Export (CV Generation)** | **$< 3000\text{ms}$** | Playwright timer / k6 | Complex 2-page CV with profile picture and 10 sections |
| **17-Factor ATS Diagnostic Evaluation** | **$< 1500\text{ms}$** | Vitest bench | 10k-character candidate resume against 50 ATS rule evaluators |
| **Credit Concurrency Integrity** | **Zero Overspend** | k6 concurrency script | 10 concurrent requests from 5-credit balance (Final balance: 0) |
| **Production Smoke Test Suite** | **$< 30\text{s}$** | Playwright runner | Live production golden-path traversal |
| **Core Web Vitals: CLS** | **Strictly $0.0$** | Lighthouse | Skeleton loading reservation on all dynamic views |
| **Core Web Vitals: LCP** | **$< 2.5\text{s}$** | Lighthouse | Fast 4G mobile emulation profile |

---

## 2. The Zero-Hallucination Performance Policy

Every published performance number must include:
1. **Tool & Version:** Exact measurement harness (e.g. `k6 v0.49.0`, `Lighthouse v12.0.0`).
2. **Workload Configuration:** Virtual users (VUs), ramp-up duration, sustained test duration.
3. **Dataset Scale:** Total row counts in target database tables (e.g. 50,000 jobs, 200,000 applications).
4. **Environment Tier:** Benchmark tier name (`${DB_NAME}_test`, `${DB_NAME}_sit`, `${DB_NAME}_uat`).
5. **Execution Run ID & Timestamp:** Immutable execution metadata.
*Unexecuted targets remain classified as `PLANNED / TBD`.*

---

## 3. Workload Scenario Design in k6

Author load scripts in `tests/performance/` simulating realistic user behavior:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },  // Ramp-up
    { duration: '3m', target: 50 },  // Sustained nominal load
    { duration: '1m', target: 0 },   // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'], // 95% of requests must complete under 300ms
    http_req_failed: ['rate<0.01'],   // Error rate must stay below 1%
  },
};

export default function () {
  const res = http.get('http://localhost:3000/api/v1/jobs?limit=20');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body schema valid': (r) => JSON.parse(r.body).data.length > 0,
  });
  sleep(1); // Realistic user think-time
}
```

### Credit Concurrency Stress Scenario:
- Simulate 10 simultaneous HTTP `POST /api/v1/cv/tailor` requests from a user possessing exactly 5 credits using concurrent asynchronous workers.
- Assert that exactly 5 requests return HTTP 200 and 5 requests return HTTP 422.
- Query database: assert `balance === 0` and exactly 5 ledger rows exist. Any overspend is an S1 Critical Defect.

---

## 4. Multi-Layer Diagnostic Protocol

Isolate and measure bottlenecks at the appropriate layer before proposing code refactors:

1. **Browser Layer (Core Web Vitals):**
   - Execute `npm run perf:lighthouse`.
   - Measure CLS ($0.0$), LCP ($< 2.5\text{s}$), and INP ($< 200\text{ms}$).
2. **Server & Application Layer:**
   - Profile Node.js event loop lag and HTTP request processing breakdown.
   - Detect unneeded serial asynchronous waterfalls; convert to parallel `Promise.all` where safe.
3. **Database Layer (Query Plan Evidence):**
   - Execute `EXPLAIN (ANALYZE, BUFFERS)` on slow query endpoints.
   - Assert sequential scans are replaced by Index Scans on high-volume tables.
4. **Process & CPU Layer:**
   - Profile CPU-bound algorithms (ATS rule evaluation) using Node.js inspector or Vitest bench.

---

## 5. Performance Regression Ratchet

- Compare benchmark outputs against baseline runs from the previous release.
- **The 10% Rule:** Any change that degrades P95 latency by $> 10\%$ without documented architectural justification is flagged as an **S2 Performance Defect**.
- Performance bug fixes must present before-and-after benchmark evidence on identical dataset scales.

---

## Output Contract

STATUS: DONE / PARTIAL / BLOCKED
- **SCENARIO & TEST RUNNER:** Script path, VUs, and test duration.
- **DATASET SCALE & TIER:** Row counts and target environment.
- **MEASURED LATENCY & THROUGHPUT:** P50, P90, P95, and P99 response times and req/sec.
- **NFR BUDGET COMPARISON:** Pass/Fail evaluation against statutory SLAs.
- **LAYER BOTTLENECK ANALYSIS:** Browser, Server, Database, or Third-Party.
- **BEFORE / AFTER PROOF:** Comparative metrics for performance fixes.
