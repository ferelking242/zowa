import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required (provided automatically by Replit PostgreSQL)');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ [DB] Unexpected PostgreSQL pool error:', err.message);
});

// Helper: run a query
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// Helper: run a query and return first row
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// Initialize schema — idempotent, safe to call on every startup
export async function initSchema(): Promise<void> {
  console.log('🗄️  [DB] Initializing schema…');
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       TEXT UNIQUE NOT NULL,
      username    TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      auto_validate_inbox BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT UNIQUE NOT NULL,
      name        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS link_validations (
      inbox_id    TEXT PRIMARY KEY,
      url         TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      method      TEXT NOT NULL DEFAULT 'playwright',
      validated_at BIGINT,
      link_type   JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS email_history (
      email       TEXT PRIMARY KEY,
      user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
      last_checked TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      message_count INT NOT NULL DEFAULT 0,
      has_validated_links BOOLEAN NOT NULL DEFAULT FALSE,
      validation_status TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS replit_accounts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      verified    BOOLEAN NOT NULL DEFAULT FALSE,
      verified_at TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cookies (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id  UUID NOT NULL REFERENCES replit_accounts(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      value       TEXT NOT NULL,
      domain      TEXT,
      path        TEXT,
      expires     BIGINT,
      http_only   BOOLEAN,
      secure      BOOLEAN,
      same_site   TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✅ [DB] Schema ready');
}
