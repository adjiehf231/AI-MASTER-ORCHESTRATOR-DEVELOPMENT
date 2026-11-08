---
name: zero-downtime-database
description: "Zero-downtime database migration patterns — Expand/Contract staging, non-blocking DDL (CREATE INDEX CONCURRENTLY), online backfill workers, and dual-writing state synchronization."
---

# Zero-Downtime Database Migration Playbook — ${PROJECT_NAME}

Authoritative sources: PostgreSQL 16 Documentation, Drizzle ORM Migration Guide, and the Enterprise Engineering Constitution (§1–§20).

This playbook enforces zero-downtime schema evolution across all environments without table locks, read/write outages, or data loss.

---

## 1. The Expand / Contract Migration Pattern

Never rename, delete, or alter column constraints in a single destructive step. Always stage changes across 4 phased releases:

```
[Phase 1: Expand] ──► [Phase 2: Dual-Writing] ──► [Phase 3: Backfill] ──► [Phase 4: Contract]
(Add new nullable/    (Application writes to      (Background worker fills (Drop old unused
 default column)       both old & new columns)     historical records)      columns/tables)
```

### Staged Evolution Matrix

| Operation | ❌ Prohibited Destructive DDL | ✅ Approved Zero-Downtime Pattern |
|---|---|---|
| **Renaming Column** | `ALTER TABLE t RENAME COLUMN a TO b;` (Breaks running app versions) | Add column `b` as nullable $\to$ dual-write to `a` & `b` $\to$ backfill `b` $\to$ switch reads to `b` $\to$ drop `a`. |
| **Adding NOT NULL** | `ALTER TABLE t ALTER COLUMN a SET NOT NULL;` (Table lock on millions of rows) | Add column with default $\to$ add `CHECK (a IS NOT NULL) NOT VALID` $\to$ validate constraint asynchronously. |
| **Creating Index** | `CREATE INDEX idx ON t (col);` (Locks writes to table `t`) | Always execute `CREATE INDEX CONCURRENTLY idx ON t (col);` |
| **Dropping Column** | `ALTER TABLE t DROP COLUMN a;` (Breaks previous app instances) | Deprecate in code $\to$ stop writing $\to$ verify zero reads $\to$ drop in subsequent release. |

---

## 2. Non-Blocking Index Creation Invariants

In PostgreSQL 16:
```sql
-- Mandatory non-blocking index creation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tenant_created 
ON users (tenant_id, created_at DESC);
```
- In Drizzle ORM: Run DDL migrations via SQL scripts with `CONCURRENTLY` outside of transaction wrappers when required by PostgreSQL.
- Monitor `pg_stat_activity` to verify locks before executing DDL on large tables ($\ge 100\text{k}$ rows).

---

## 3. Pre-Migration Verification Checklist (Gate 4 & Gate 7)

- [ ] Migration script tested on `${DB_NAME}_sit` sandbox with representative data volume.
- [ ] DDL statements contain zero `DROP TABLE` or `DROP COLUMN` in Phase 1 Expand releases.
- [ ] Rollback down-migration script authored and verified.
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` evidence captured for new queries to prove index adoption.
- [ ] Account erasure cascade parity verified (hard-delete cascade completes in $< 30\text{s}$).
