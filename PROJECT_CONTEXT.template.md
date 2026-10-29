# Project Context Configuration

> **Instructions:** Copy this file to `PROJECT_CONTEXT.md` in your project root and update the values below to match your application. The Universal AI Master Orchestrator, Agents, and Skills will automatically bind to these parameters.

---

## 1. Project Metadata
- **Project Name (`${PROJECT_NAME}`):** "Acme Cloud Platform"
- **Project Identifier (`${PROJECT_ID}`):** "ACME"
- **Primary Domain (`${PROJECT_DOMAIN}`):** "acme.com"
- **Target Audience / Personas:** Enterprise B2B Administrators, Operations Managers, Developers
- **Repository Type:** Monorepo / Polyrepo

---

## 2. Technology Stack Profile
- **Frontend Framework:** Next.js 15+ (App Router) / React 19 / Nuxt / Vue 3 / SvelteKit
- **Styling & Design System:** Tailwind CSS v4, Lucide SVG Icons, Radix Primitives
- **Backend Architecture:** Node.js / TypeScript / Go / Python FastAPI / Rust
- **API Protocol:** REST (OpenAPI) / GraphQL / gRPC
- **Database & ORM:** PostgreSQL 16+ / Drizzle ORM / Prisma
- **Cache & Queue:** Redis / BullMQ / RabbitMQ / Kafka
- **Unit & Integration Testing:** Vitest / Jest / pytest / go test
- **E2E & Accessibility Testing:** Playwright with `@axe-core/playwright`

---

## 3. Directory Structure Mapping
- **Source Root (`${SRC_DIR}`):** `src`
- **Component Primitives (`${COMPONENTS_DIR}`):** `src/components`
- **Domain/Feature Modules (`${MODULES_DIR}`):** `src/features` (or `src/modules`)
- **Documentation Root (`${DOCS_DIR}`):** `docs`
- **Living Memory Root:** `docs/memory` (`PROJECT_STATE.md`, `HEURISTICS.md`, `ANTI_PATTERNS.md`)
- **Test Suites Root:** `tests`

---

## 4. Change Request Governance
- **CR Prefix (`${CR_PREFIX}`):** `CR-ACME-` (e.g. `CR-ACME-2026-001`)
- **Requirement Prefix:** `BR-ACME-`
- **Test Case Prefix:** `TC-ACME-`

---

## 5. UI/UX & Craft Preferences (Anti-AI-Slop)
- **Design Aesthetic:** High-craft Dark Obsidian (`#0b0f19`) & Clean Slate (`#f8fafc`)
- **Icon Library:** Lucide Icons (Strictly NO emoji icons for UI controls)
- **Primary Accent Token:** Indigo (`#6366f1`) / Violet
- **Default Locale:** `en-US` (or `id-ID`)
- **Accessibility Gate:** WCAG 2.2 Level AA mandatory

---

## 6. Regulatory & Compliance Standards
- **Primary Data Privacy:** GDPR / CCPA / Statutory National Privacy (UU PDP)
- **Security Standard:** OWASP Top 10, Zero-Trust Multi-Tenancy, Sanitized Logging (Zero PII)
- **Financial / Transactional Invariant:** ACID Transactions with Pessimistic Row Locking for balance/quota deductions
