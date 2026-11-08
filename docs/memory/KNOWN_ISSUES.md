# Known Issues & Workarounds Register

> **Living Memory Document:** Known operational quirks, environmental workarounds, and non-blocking defects.
> **Rule:** Every item must define the exact trigger condition, symptom, and verified workaround until permanently resolved.

---

## 1. Active Known Issues

| Issue ID | Component / Area | Trigger Condition | Symptom | Verified Workaround | Tracking / Resolution Plan |
|---|---|---|---|---|---|
| **`ISS-001`** | Antigravity Plugin | Direct filesystem writes to `~/.gemini/config/plugins/` on Windows without UTF-8 encoding. | Unicode symbols (`§`, `—`, `──►`) get mangled into ANSI artifacts (`Â§`, `â€”`). | Always use `utf8` encoding when reading and writing files in deployment scripts. | Solved via `scripts/deploy-antigravity.js`. |
| **`ISS-002`** | Node.js Scripts | Running raw node commands without npm script wrappers. | Inconsistent developer invocation. | Standardized via `package.json` lifecycle scripts. | Solved via root `package.json`. |
