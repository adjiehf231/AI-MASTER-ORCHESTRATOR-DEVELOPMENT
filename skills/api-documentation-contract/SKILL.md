---
name: api-documentation-contract
description: "Enterprise Doc-as-Code and API documentation standards — OpenAPI 3.1 specification generation, Diátaxis framework structuring, automated schema linting (Spectral), versioning lifecycle, and interactive developer documentation."
---

# Enterprise Doc-as-Code & API Documentation Standards Playbook

## 1. Identity & Mandate

This playbook governs the authoring, automated validation, and continuous maintenance of technical documentation, REST API contracts, and developer guides across ${PROJECT_NAME}.
The objective is to achieve **100% documentation-code parity**, eliminate ambiguity, and deliver world-class developer experience (DX) via Doc-as-Code pipelines.

Authoritative references: Enterprise Engineering Constitution (§1–§20), `agents/technical-writer.md`, and `skills/api-design/SKILL.md`.

---

## 2. Hard Documentation Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Drift Between Zod/OpenAPI Schemas:** Any route handler whose runtime request/response validation schema differs from the published OpenAPI 3.1 contract = **CONTRACT DRIFT -> REJECTED**.
2. **Missing HTTP Status Code Documentation:** Documenting only the 200 OK success response while omitting negative status codes (`400`, `401`, `403`, `404`, `409`, `422`, `500`) = **INCOMPLETE SPECIFICATION -> REJECTED**.
3. **Missing Copy-Pasteable Examples:** Any endpoint specification lacking concrete, valid JSON request and response payloads = **USABILITY DEFECT -> REJECTED**.
4. **Undocumented Breaking Changes:** Introducing breaking modifications to existing APIs without a major version bump or explicit deprecation headers = **REJECTED**.

---

## 3. OpenAPI 3.1 Contract Requirements

Every route specification in `docs/api/` or auto-generated specs must satisfy:

```yaml
openapi: 3.1.0
info:
  title: ${PROJECT_NAME} Core API
  version: 1.0.0
  description: Authoritative REST API specifications for ${PROJECT_NAME}.
paths:
  /api/v1/resources:
    post:
      summary: Create new resource
      operationId: createResource
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateResourceRequest'
      responses:
        '201':
          description: Resource created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ResourceResponse'
        '400':
          $ref: '#/components/responses/BadRequestError'
        '401':
          $ref: '#/components/responses/UnauthorizedError'
        '409':
          $ref: '#/components/responses/ConflictError'
```

---

## 4. The Diátaxis Knowledge Architecture Standard

All documentation under `docs/` must be categorized into the 4 distinct Diátaxis modes:

```
                      PRACTICAL
                         │
        How-To Guides    │    Tutorials
      (Problem-oriented) │ (Learning-oriented)
                         │
─────────────────────────┼─────────────────────────
                         │
        Reference        │   Explanation
  (Information-oriented) │ (Understanding-oriented)
                         │
                     THEORETICAL
```

- **`docs/tutorials/`**: Guided end-to-end paths for first-time onboarding.
- **`docs/how-to/`**: Focused operational solutions (e.g. disaster recovery cutover, key rotation).
- **`docs/reference/`**: Exhaustive, definitive technical tables, schemas, and configurations.
- **`docs/architecture/`**: High-level system concepts, ADRs, and invariant justifications.

---

## 5. Automated Doc-as-Code Linting (Spectral & Vale)

Enforce documentation quality in the CI pipeline:
1. **Spectral OpenAPI Linter:**
   - Enforce snake_case or camelCase property naming consistency.
   - Enforce descriptions on all parameters and response schemas.
   - Enforce tagged operations and unique `operationId`s.
2. **Markdown Validation:**
   - Zero broken hyperlinks or dead relative file references.
   - 100% valid code block language specifiers (e.g. ````typescript`, ````json`, ````bash`).
