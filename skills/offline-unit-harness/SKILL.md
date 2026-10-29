---
name: Offline Unit Harness & Air-Gapped Testing
description: Architecture, operation, and maintenance of ${PROJECT_NAME}'s T1 Air-Gapped Zero-DB Unit Test Harness (vitest.unit-no-db.config.ts) — fail-closed application network guard, environment sanitization, pure algorithmic domain isolation, and sub-10-second fast-path verification.
---

# Offline Unit Harness & Air-Gapped Testing — ${PROJECT_NAME}

Authoritative sources: `vitest.unit-no-db.config.ts`, `scripts/qa-unit-offline.cjs`, `tests/qa-unit-offline-guard.test.cjs`, and `docs/qa/TEST_ARCHITECTURE.md`.

True testing efficiency and developer velocity rely on a **lightning-fast, deterministic, air-gapped unit testing tier**. Waiting minutes for database containers, network initialization, and browser instances to verify pure business algorithms is an anti-pattern. 

${PROJECT_NAME} establishes the **T1 Offline Fast-Path**: an air-gapped test execution environment running 18 critical domain suites (130+ assertions) in $< 10\text{seconds}$ with zero database and zero external network access.

---

## 1. The Multi-Tier Testing Ladder (Fail-Fast Hierarchy)

```mermaid
flowchart TD
    Code[Code Committed / Diff Ready] --> Lint[Tier 0: Lint & Typecheck (<5s)]
    Lint --> T1[Tier 1: T1 Air-Gapped Zero-DB Unit Suites (<10s) <br/> vitest.unit-no-db.config.ts]
    T1 -->|Fail Fast (<10s)| Fix[Trigger Autonomous Self-Healing / Developer Fix]
    T1 -->|Pass| T2[Tier 2: PostgreSQL Isolated Integration Suites (<2m) <br/> tests/setup-test-db.ts]
    T2 -->|Pass| T3[Tier 3: Playwright E2E & Axe Accessibility (<5m) <br/> playwright.config.ts]
```

### Why the T1 Fast-Path is Essential:
1. **Sub-10s Feedback Loop:** Identifies algorithmic regressions, state-machine breaks, and contract violations in ~9.4 seconds.
2. **Zero Infrastructure Overhead:** Requires no running Docker daemon, PostgreSQL container, or Redis instance.
3. **Air-Gapped Security Defense:** Guarantees that unit test suites do not make accidental egress calls, leak credentials, or contact third-party APIs.

---

## 2. Technical Architecture (`vitest.unit-no-db.config.ts`)

The T1 configuration is engineered for strict determinism and zero side-effects:

```typescript
// vitest.unit-no-db.config.ts
export default defineConfig({
  server: {
    host: "127.0.0.1", // Prevents ambient DNS lookups that trigger network interceptors
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // Prevents race conditions and port/resource collision
      },
    },
    isolate: true,
    retry: 0,          // Zero tolerance for flaky test passes
    setupFiles: [],    // Pure in-memory: ZERO database setup, ZERO network mocks
    include: [ ... ],  // 18 pure domain suites
  },
});
```

---

## 3. The Fail-Closed Network Guard & Environment Sanitizer (`scripts/qa-unit-offline.cjs`)

The offline runner wraps Vitest in a double-layer defense:

### 3.1 Network Guard (Fail-Closed Interceptor)
Intercepts and throws `ERR_NETWORK_FORBIDDEN_OFFLINE` on 10 Node.js interfaces:
- `net.Socket.prototype.connect`, `net.createServer`
- `tls.connect`
- `http.request`, `http.get`
- `https.request`, `https.get`
- `http2.connect`
- `dgram.createSocket`
- `dns.lookup`, `dns.resolve*`
- Global `fetch`, `WebSocket`, and `undici` HTTP clients.

*The guard is preloaded into all spawned worker forks via `NODE_OPTIONS="--require scripts/qa-unit-offline.cjs"`.*

### 3.2 Environment Sanitizer (Credential Stripping)
Before spawning worker processes, the runner scrubs all sensitive keys from `process.env`:
- Strips any environment variable matching: `/DATABASE/`, `/POSTGRES/`, `/REDIS/`, `/AI_/`, `/OPENAI/`, `/ANTHROPIC/`, `/GEMINI/`, `/STRIPE/`, `/MIDTRANS/`, `/SECRET/`, `/KEY/`, `/TOKEN/`, `/PASSWORD/`, `/SMTP/`.
- Passes only an allowlist of harmless system variables (`PATH`, `TEMP`, `HOME`, `NODE_ENV=test`).

---

## 4. Current T1 Suite Inventory (The 18 Canonical Suites)

The 18 pure algorithmic suites included in `vitest.unit-no-db.config.ts` represent ${PROJECT_NAME}'s core computational engines:

| Area | Suite Path | Assertions Verified |
|---|---|---|
| **Provenance** | `src/modules/career/provenance.test.ts` | State machine: `VERIFIED`, `INFERRED`, `SUGGESTED` lifecycle & idempotency |
| **Security** | `src/shared/security/ownership.test.ts` | Universal IDOR / BOLA defense & role boundary matrix |
| **ATS Engine** | `tests/ats/engine.unit.test.ts` | 17-factor scoring engine calculations & weight distribution |
| **ATS Rules** | `tests/ats/rules.unit.test.ts` | Formatting, keyword, experience, skills, structure, and contact rules |
| **CV Engine** | `tests/cv/cv.unit.test.ts` | CV data extraction, section structuring, and sanitization |
| **CV Templates** | `tests/cv/template.unit.test.ts` | HTML rendering across all 20 Phase 4 templates |
| **Job Engine** | `tests/jobs/engine.unit.test.ts` | Vacancy matching scoring, relevance ranking, and filters |
| **Job Staleness**| `tests/jobs/staleness.unit.test.ts` | Expiration and freshness state transitions |
| **Agent AI** | `tests/unit/agent-intent.unit.test.ts` | Career AI intent classification |
| **Agent CTA** | `tests/unit/agent-cta.unit.test.ts` | Suggested action creation and URL protocol sanitization |
| **Career Roles** | `tests/unit/career-recommendation-roles.unit.test.ts` | Completeness of 10 canonical profession catalogs |
| **Career Map** | `tests/unit/career-recommendation-transferability.unit.test.ts` | Cross-role skill transferability mappings |
| **Skill Gap (6)**| `tests/unit/skill-gap-*.unit.test.ts` | Engine, difficulty, normalization, priority, project ideas, roadmap |

---

## 5. Execution Protocols

### Fast Verification Command:
```bash
# Execute T1 Air-Gapped Unit Suites with Active Network Guard (Fast-Path)
node scripts/qa-unit-offline.cjs

# Verify the offline guard and environment sanitizer without running tests
node scripts/qa-unit-offline.cjs --verify

# Run directly with Vitest CLI (local developer mode)
npx vitest run --config vitest.unit-no-db.config.ts
```

---

## 6. Rules for Adding New Suites to the T1 Harness

When creating a new unit test suite, evaluate whether it belongs in `vitest.unit-no-db.config.ts`:

### Inclusion Criteria (Belongs in T1):
- [ ] Tests pure functions, mathematical algorithms, state machines, or Zod schemas.
- [ ] Requires ZERO database connection (does not import `db` from `@/infrastructure/database`).
- [ ] Requires ZERO network calls (all dependencies are mocked with pure in-memory functions).
- [ ] Executes in $< 20\text{ms}$ per test case.

### Procedure to Add:
1. Write the colocated unit test (e.g. `tests/unit/new-algorithm.unit.test.ts`).
2. Add the path to `test.include` in `vitest.unit-no-db.config.ts`.
3. Run `node scripts/qa-unit-offline.cjs` to verify that the suite passes with the active network guard.
4. If the test triggers `[OFFLINE_GUARD]`, locate and eliminate the accidental I/O or network import.

