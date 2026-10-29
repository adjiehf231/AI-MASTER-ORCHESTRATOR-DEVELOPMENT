# Prohibited Anti-Patterns Register

> **Living Memory Document:** An anti-pattern is an alluring, commonly attempted solution that appears to work initially but leads to technical debt, security holes, data corruption, or flakiness.
> **Format:** `[ANTI-<AREA>-NNN]` with Alluring Trap, Catastrophic Failure Mode, Prohibited Pattern, and Approved Solution.
> Consulted automatically during **Phase 0 (Pre-Flight Ingestion)** by all agents before writing code.

---

## 1. Frontend & UI/UX Anti-Patterns

### [ANTI-UI-001] AI-Slop Decorative Neon Blur Blobs
- **Alluring Trap:** Adding arbitrary `blur-3xl bg-purple-500/20` radial gradients behind cards to make an interface look "modern" or "cyberpunk".
- **Catastrophic Failure Mode:** Creates muddy visual contrast, looks unmistakable as low-effort AI slop, impairs readability, and causes GPU rendering lag on mobile devices.
- **Prohibited Code Example:**
  ```tsx
  // Prohibited: Arbitrary glowing blob behind content
  <div className="absolute -top-40 left-0 w-96 h-96 bg-purple-600/30 blur-3xl rounded-full" />
  ```
- **Approved Solution:** Build tonal depth using structured Obsidian Slate surfaces (`#0b0f19` canvas, `#111827` surface, `#161f33` elevated surface, subtle `border-slate-800/80` borders).

### [ANTI-UI-002] Happy-Path Only Component Delivery
- **Alluring Trap:** Authoring UI components that assume data is always present, network is lightning-fast, and user input is always valid.
- **Catastrophic Failure Mode:** Empty states render blank white screens, errors crash the React tree with unhandled exceptions, and slow networks leave users staring at frozen buttons.
- **Prohibited Code Example:**
  ```tsx
  // Prohibited: Missing Loading, Error, and Empty states
  export function ItemList({ items }) {
    return <div>{items.map(item => <ItemCard key={item.id} data={item} />)}</div>;
  }
  ```
- **Approved Solution:** Implement the Universal 6-State Matrix (Loading skeleton, Empty guidance with CTA, Error with retry, Success, Denied, Stale/Offline).

---

## 2. Security & Backend Anti-Patterns

### [ANTI-SEC-001] Client-Side-Only Authorization Checks
- **Alluring Trap:** Hiding an "Edit" or "Delete" button in the frontend based on user role and assuming non-admin users cannot trigger the mutation.
- **Catastrophic Failure Mode:** Any user with curl or DevTools can send a direct POST/DELETE request and modify or destroy data (IDOR / Broken Object Level Authorization).
- **Prohibited Code Example:**
  ```tsx
  // Prohibited: Assuming frontend check is sufficient
  {user.isAdmin && <button onClick={deleteUser}>Delete User</button>}
  ```
- **Approved Solution:** Enforce strict session authentication and tenant/role authorization on the backend route handler for every single request. Never trust client claims.

### [ANTI-SEC-002] "Make Error Disappear" Blanket Try/Catch
- **Alluring Trap:** Wrapping failing asynchronous operations in an empty `try { ... } catch (e) {}` block so tests pass or the console stops throwing red warnings.
- **Catastrophic Failure Mode:** Converts catastrophic system errors (database connection loss, corrupted state, missing credentials) into silent data corruption that is impossible to diagnose.
- **Prohibited Code Example:**
  ```typescript
  // Prohibited: Swallowing errors silently
  try {
    await saveUserData(data);
  } catch (err) {
    // do nothing to avoid crash
  }
  ```
- **Approved Solution:** Catch specific errors, log actionable diagnostic context without leaking secrets, and either propagate the error or return a structured user-facing recovery response.
