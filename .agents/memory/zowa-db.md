---
name: Zowa DB migration
description: Supabase replaced with Replit PostgreSQL; schema auto-inits on startup.
---

## Rule
Use `server/lib/db.ts` (pg Pool + `query`/`queryOne` helpers) for all DB access.
`server/services/supabaseStorage.ts` is the storage abstraction layer — keep the same interface.
`server/lib/supabase.ts` and `client/src/lib/supabase.ts` are stubs that export `null`.

**Why:** Supabase credentials were unavailable; Replit provides PostgreSQL via `DATABASE_URL` at runtime.

**How to apply:** Never import `supabase` client directly. Always use `storage` from `supabaseStorage.ts` or `query`/`queryOne` from `db.ts`.
Schema is created by `initSchema()` called in `server/index.ts` on startup — idempotent, no migrations needed.
