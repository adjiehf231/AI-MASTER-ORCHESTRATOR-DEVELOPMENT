---
name: penetration-testing-audit
description: "Enterprise penetration testing and security audit playbook — non-destructive reconnaissance, vulnerability verification, OWASP ASVS testing, attack surface analysis, and actionable remediation engineering."
---

# Enterprise Penetration Testing & Security Audit Playbook — ${PROJECT_NAME}

Authoritative sources: OWASP ASVS v4.0, NIST SP 800-115, MITRE ATT&CK v14, OWASP Top 10 for LLM Applications (2025), and the Enterprise Engineering Constitution (§1–§20).

This playbook defines the standardized methodology for conducting non-destructive penetration testing, vulnerability discovery, proof-of-concept verification, and defensive remediation across all ${PROJECT_NAME} endpoints and agent interfaces.

---

## 1. Ethical Rules of Engagement & Hard Invariants

1. **Strict Non-Destructive Invariant:** All penetration testing activities must use non-destructive payloads. Probing for SQL injection or command injection must rely on passive timing (`SLEEP` / `pg_sleep(1)`), mathematical expressions (`1+1=2`), or benign canary tokens. Never drop tables, alter states, or wipe data.
2. **Quarantine Containment:** Active exploitation PoCs must execute only within designated isolated test containers or local sandboxes.
3. **No Unbounded Flooding:** Automated endpoint fuzzing or rate-limit probing must be rate-capped to prevent degradation of shared services.

---

## 2. 5-Stage Penetration Testing Methodology

```
[01 Reconnaissance] ──► [02 Vulnerability Scanning] ──► [03 Contained Exploitation]
                                                                  │
                                                                  ▼
[05 Remediation Verification] ◄── [04 Impact Scoring & PoC Delivery]
```

### Stage 1: Reconnaissance & Attack Surface Mapping
- Inspect route definitions, reverse proxy configurations, and API declarations in `${SRC_DIR}`.
- Map all unauthenticated public endpoints vs protected authenticated handlers.
- Document all external third-party integration points (webhooks, OAuth callbacks, payment gateways).

### Stage 2: Static & Dynamic Vulnerability Probing
- **Access Control & Tenancy (BOLA/IDOR):**
  - Verify if request bodies or URL path parameters contain entity IDs that can be manipulated to access cross-tenant records.
  - Test if vertical privilege escalation is possible by tampering with role claims or session attributes.
- **Input Validation & Injection Vectors:**
  - Verify parameterization in database queries (ORM or parameterized SQL).
  - Verify sanitization of user-supplied strings before rendering in browser or passing to template engines.
- **Agentic & AI Red-Teaming:**
  - Probe system prompts with token-smuggling, multi-turn role reversal, and payload delimiter escapes.
  - Test tool execution bounds: verify that tools with file read or shell access reject paths outside workspace root.

### Stage 3: Contained Proof-of-Concept (PoC) Construction
- Build minimal, reproducible PoC packages demonstrating the flaw without executing destructive side-effects:
  ```bash
  # Example non-destructive IDOR verification request
  curl -X GET "https://${PROJECT_DOMAIN}/api/v1/resource/TENANT_B_ID" \
    -H "Authorization: Bearer <TENANT_A_TOKEN>" \
    -H "Accept: application/json"
  ```
- Capture full HTTP request, headers, response status code, and sanitized response body.

### Stage 4: DREAD & CVSS 3.1 Scoring
Score the finding to determine delivery priority:
- **Critical (CVSS $\ge 9.0$):** Immediate S1 blocker. Halts deployment and requires hotfix.
- **High (CVSS $7.0 - 8.9$):** Gate 2 / Gate 6 blocker.
- **Medium (CVSS $4.0 - 6.9$):** Requires remediation plan before release candidate sign-off.
- **Low (CVSS $< 4.0$):** Recorded in Technical Debt Register (`docs/memory/TECHNICAL_DEBT.md`).

### Stage 5: Remediation Engineering & Regression Trapping
- Provide exact code remediation diffs (e.g. adding tenant ownership filters, sanitizing inputs, restricting CORS).
- Bind regression tests into the automated test suite (`tests/` or Vitest) to ensure the flaw cannot reoccur in future commits.

