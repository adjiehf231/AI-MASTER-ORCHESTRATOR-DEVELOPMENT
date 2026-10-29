---
name: API Design
description: Contract-first REST API engineering standards — Zod request/response contracts, per-role authorization matrix, server-side IDOR elimination, uniform error envelopes, idempotency for financial/credit transactions, deterministic pagination, and the mandatory 8-case test matrix. Use when designing, reviewing, or refactoring endpoints.
---

# API Design & Contract Engineering — ${PROJECT_NAME}

Authoritative sources: `docs/api/`, `docs/data/`, `docs/qa/API_TEST_STRATEGY.md`, and the Enterprise Engineering Constitution (§10).

APIs are permanent, public contracts. A poorly designed API leaks internal architecture, creates security vulnerabilities (IDOR), breaks client compatibility, and causes financial inconsistency. This skill provides the formal framework to engineer robust, version-stable, and secure REST APIs.

---

## 1. Statutory Invariants of ${PROJECT_NAME} APIs

1. **Contract-First Synchronization:** The API documentation in `docs/api/` and the route implementation in `src/modules/<module>/` must be written and updated in the exact same commit. Contract drift is an S3 defect.
2. **Strict Zod Boundary Validation:** Every route handler must validate input parameters (path, query, body) and response payloads using strict Zod schemas (`.strict()`) to eliminate mass-assignment risks.
3. **Server-Side Tenancy Guard on 100% of Entity IDs:** Any route accepting an entity ID must verify ownership or administrative authorization on the server. A missing IDOR guard is a **Severity S1 Critical Security Blocker**.
4. **Uniform Error Envelope:** All error responses must adhere strictly to the standardized error shape. Internal stack traces, raw SQL queries, and secrets must never cross the boundary.
5. **Idempotency on Credit & Financial Paths:** Retried or duplicate POST/PUT requests on payment or credit deduction routes must never result in duplicate debits.
6. **Data Minimization (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile)):** Return only the fields strictly required by the consuming view. PII must be masked or omitted when not essential.

---

## 2. Resource Naming & HTTP Method Semantics

Follow clean RESTful conventions:

- **Resource URIs:** Nouns in plural, kebab-case for multi-word paths:
  - `GET /api/v1/cvs` (List CVs)
  - `POST /api/v1/cvs` (Create CV draft)
  - `GET /api/v1/cvs/:id` (Fetch specific CV)
  - `PUT /api/v1/cvs/:id/sections/:sectionId` (Replace CV section)
  - `DELETE /api/v1/cvs/:id` (Delete CV)
- **Sub-Resource Actions:** When an operation represents an action rather than a CRUD mutation:
  - `POST /api/v1/cvs/:id/tailor` (Tailor CV keyword recommendations)
  - `POST /api/v1/ats/evaluate` (Evaluate ATS diagnostic rules)
- **HTTP Method Discipline:**
  - `GET`: Safe and idempotent. Must never mutate persistent state.
  - `POST`: Create non-idempotent resources or trigger credit-consuming processing actions.
  - `PUT`: Complete idempotent replacement of an existing resource.
  - `PATCH`: Partial atomic update of specified fields.
  - `DELETE`: Idempotent removal of a resource.

---

## 3. Strict Zod Contract Specifications

Every endpoint must define its schemas in `contracts/`:

```typescript
import { z } from 'zod';

// 1. Request Parameters Schema
export const UpdateCareerItemParamsSchema = z.object({
  id: z.string().uuid(),
}).strict();

// 2. Request Body Schema (Strict to prevent mass-assignment)
export const UpdateCareerItemBodySchema = z.object({
  title: z.string().min(1).max(100),
  employer: z.string().min(1).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isCurrent: z.boolean(),
  description: z.string().max(2000).optional(),
}).strict();

// 3. Response Schema
export const CareerItemResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  employer: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  isCurrent: z.boolean(),
  provenance: z.enum(['VERIFIED', 'INFERRED', 'SUGGESTED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// 4. Export Shared Types
export type UpdateCareerItemBody = z.infer<typeof UpdateCareerItemBodySchema>;
export type CareerItemResponse = z.infer<typeof CareerItemResponseSchema>;
```

---

## 4. Role Authorization Matrix & IDOR Elimination

For every endpoint, specify the explicit role access matrix:

| Endpoint | Jobseeker (Owner) | Jobseeker (Non-Owner) | Corporate Recruiter | Platform Admin | Anonymous |
|---|:---:|:---:|:---:|:---:|:---:|
| `GET /api/v1/cvs/:id` | 200 OK | 404 Not Found (IDOR Guard) | 403 Forbidden (Unless applicant) | 200 OK (Audited) | 401 Unauthorized |
| `PUT /api/v1/cvs/:id` | 200 OK | 404 Not Found (IDOR Guard) | 403 Forbidden | 403 Forbidden (Owner only) | 401 Unauthorized |
| `DELETE /api/v1/cvs/:id`| 200 OK | 404 Not Found (IDOR Guard) | 403 Forbidden | 403 Forbidden | 401 Unauthorized |

### The Existence Oracle Defense:
When a user attempts to access a resource ID they do not own, return `404 Not Found` rather than `403 Forbidden` unless the business context requires explicit permission disclosure. Returning `403` informs an attacker that a foreign resource ID exists (resource enumeration oracle).

---

## 5. Canonical Error Envelope Standard

All non-2xx responses must return the standard JSON envelope:

```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Saldo kredit tidak mencukupi untuk melakukan tailoring CV.",
    "details": {
      "requiredCredits": 1,
      "currentBalance": 0
    }
  }
}
```

### HTTP Status Code Catalog:
- `400 BAD_REQUEST`: Zod parsing failure or malformed JSON syntax.
- `401 UNAUTHORIZED`: Missing, expired, or invalid session cookie.
- `403 FORBIDDEN`: Authenticated user lacks required role permissions.
- `404 NOT_FOUND`: Resource does not exist or access is denied to prevent existence enumeration.
- `422 UNPROCESSABLE_ENTITY`: Business rule violations (e.g. BR-${PROJECT_ID}-006 NIK input, insufficient credit balance, invalid state transition).
- `429 TOO_MANY_REQUESTS`: Rate limit exceeded. Include `Retry-After` header.
- `500 INTERNAL_SERVER_ERROR`: Sanitized generic error. Log diagnostic stack trace exclusively to internal server logs.

---

## 6. List Endpoints & Deterministic Pagination

All list endpoints (`GET /api/v1/items`) must enforce pagination:
- **Cursor-Based Pagination (Preferred for High-Volume Feeds):**
  - Parameters: `?cursor=<base64_encoded_id>&limit=20`
  - Response: `{ data: [...], nextCursor: "...", hasMore: true }`
- **Offset Pagination (For Administrative Views):**
  - Parameters: `?page=1&limit=25` (Default limit: 20, Maximum ceiling: 100).
- **Deterministic Sort:** Always include a unique secondary sort tie-breaker (e.g. `ORDER BY created_at DESC, id DESC`) to prevent fluctuating list positions during concurrent inserts.

---

## 7. Mandatory 8-Case Test Matrix (per Endpoint)

Every endpoint implementation must be accompanied by automated Vitest tests executing these 8 test scenarios:

| # | Test Scenario | Input Condition | Expected Status Code & Body Contract |
|:---:|---|---|---|
| **1** | **Nominal Happy Path** | Valid request payload with authenticated owner session | `200 OK` or `201 Created` + valid `ResponseSchema` |
| **2** | **Malformed / Schema Failure** | Missing required fields, invalid types, unrecognized properties | `400 Bad Request` + field-level validation details |
| **3** | **Unauthenticated Access** | Request with missing or expired session cookie | `401 Unauthorized` |
| **4** | **Unauthorized Role** | Authenticated user possessing wrong role (e.g. Jobseeker accessing Admin) | `403 Forbidden` |
| **5** | **IDOR Probe (Foreign ID)** | Authenticated user passing an entity ID owned by another user | `404 Not Found` (Zero data leakage, zero existence oracle) |
| **6** | **Boundary & Extremes** | Maximum length strings, empty arrays, multi-byte Unicode characters | Handled cleanly per schema without truncation or crash |
| **7** | **Concurrent Idempotency** | Simultaneous duplicate requests on credit-consuming routes | Single atomic debit; duplicate returns cached response or 422 |
| **8** | **Rate Limit Trigger** | Exceeding allowed threshold within sliding time window | `429 Too Many Requests` + `Retry-After` header |

---

## Output Contract

STATUS: APPROVED / SPECIFICATION_INCOMPLETE / BLOCKED
- **API ROUTE IDENTIFIER:** Method, path, and owning module.
- **ZOD CONTRACTS DEFINED:** Request and response schema exports.
- **AUTHZ MATRIX & IDOR GUARDS:** Documented role permissions and ownership checks.
- **ERROR CATALOG:** Documented error codes and messages.
- **TEST MATRIX COVERAGE:** Vitest execution evidence across the 8 test scenarios.
- **NEXT ACTIONS:** Frontend contract consumption or QA test automation.
