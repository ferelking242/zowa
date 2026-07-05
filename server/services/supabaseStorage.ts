/**
 * Storage service — backed by Replit PostgreSQL (via pg pool).
 * Drop-in replacement for the old Supabase-based storage.
 */
import { query, queryOne } from '../lib/db';
import {
  type LinkValidation,
  type InsertLinkValidation,
  type User,
  type InsertUser,
  type ReplitAccount,
  type InsertReplitAccount,
  type Cookie,
  type InsertCookie,
} from '@shared/schema';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export class SupabaseStorage {
  // ─── Link Validations ────────────────────────────────────────────────────
  async createLinkValidation(data: InsertLinkValidation): Promise<LinkValidation> {
    const row = await queryOne<any>(
      `INSERT INTO link_validations (inbox_id, url, method, status, link_type)
       VALUES ($1, $2, $3, 'pending', $4)
       ON CONFLICT (inbox_id) DO UPDATE SET url = EXCLUDED.url
       RETURNING *`,
      [data.inboxId, data.url, data.method, data.linkType ? JSON.stringify(data.linkType) : null]
    );
    if (!row) throw new Error('Failed to create link validation');
    return this.mapDbToLinkValidation(row);
  }

  async getLinkValidation(inboxId: string): Promise<LinkValidation | null> {
    const row = await queryOne<any>(
      `SELECT * FROM link_validations WHERE inbox_id = $1`,
      [inboxId]
    );
    return row ? this.mapDbToLinkValidation(row) : null;
  }

  async updateLinkValidation(inboxId: string, updates: Partial<LinkValidation>): Promise<LinkValidation> {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.status !== undefined)     { sets.push(`status = $${idx++}`);       params.push(updates.status); }
    if (updates.validatedAt !== undefined) { sets.push(`validated_at = $${idx++}`); params.push(updates.validatedAt); }
    if (updates.linkType !== undefined)   { sets.push(`link_type = $${idx++}`);    params.push(JSON.stringify(updates.linkType)); }

    if (sets.length === 0) return (await this.getLinkValidation(inboxId))!;

    params.push(inboxId);
    const row = await queryOne<any>(
      `UPDATE link_validations SET ${sets.join(', ')} WHERE inbox_id = $${idx} RETURNING *`,
      params
    );
    if (!row) throw new Error('Validation record not found');
    return this.mapDbToLinkValidation(row);
  }

  private mapDbToLinkValidation(r: any): LinkValidation {
    return {
      inboxId: r.inbox_id,
      url: r.url,
      status: r.status,
      method: r.method,
      validatedAt: r.validated_at ?? undefined,
      linkType: r.link_type ?? undefined,
    };
  }

  // ─── Email History ────────────────────────────────────────────────────────
  async saveEmailToHistory(email: string, userId?: string, messageCount?: number): Promise<void> {
    await query(
      `INSERT INTO email_history (email, user_id, last_checked, message_count, has_validated_links)
       VALUES ($1, $2, NOW(), $3, FALSE)
       ON CONFLICT (email) DO UPDATE
         SET last_checked = NOW(), message_count = EXCLUDED.message_count`,
      [email, userId ?? null, messageCount ?? 0]
    );
  }

  async getEmailHistory(userId?: string): Promise<Array<{
    email: string; lastChecked: string; messageCount: number;
    hasValidatedLinks: boolean; validationStatus: string | null; createdAt: string;
  }>> {
    const rows = userId
      ? await query(`SELECT * FROM email_history WHERE user_id = $1 ORDER BY last_checked DESC`, [userId])
      : await query(`SELECT * FROM email_history ORDER BY last_checked DESC`);

    return rows.map(r => ({
      email: r.email,
      lastChecked: r.last_checked instanceof Date ? r.last_checked.toISOString() : String(r.last_checked),
      messageCount: r.message_count ?? 0,
      hasValidatedLinks: r.has_validated_links ?? false,
      validationStatus: r.validation_status ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }

  async updateEmailHistoryMessageCount(email: string, messageCount: number): Promise<void> {
    await query(
      `UPDATE email_history SET message_count = $1, last_checked = NOW() WHERE email = $2`,
      [messageCount, email]
    );
  }

  // ─── Users ────────────────────────────────────────────────────────────────
  async createUser(data: Omit<InsertUser, 'passwordHash'> & { password: string }): Promise<User> {
    console.log(`[AUTH] Creating user: ${data.email}`);
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const row = await queryOne<any>(
      `INSERT INTO users (email, username, password_hash, auto_validate_inbox)
       VALUES ($1, $2, $3, TRUE) RETURNING *`,
      [data.email, data.username, hashedPassword]
    );
    if (!row) throw new Error('Failed to create user');
    console.log(`[AUTH] User created: ${row.email}`);
    return this.mapDbToUser(row);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = await queryOne<any>(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    return row ? this.mapDbToUser(row) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const row = await queryOne<any>(
      `SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username]
    );
    return row ? this.mapDbToUser(row) : null;
  }

  async getUserById(id: string): Promise<User | null> {
    const row = await queryOne<any>(`SELECT * FROM users WHERE id = $1`, [id]);
    return row ? this.mapDbToUser(row) : null;
  }

  async updateUserSettings(userId: string, autoValidateInbox: boolean): Promise<User | null> {
    const row = await queryOne<any>(
      `UPDATE users SET auto_validate_inbox = $1 WHERE id = $2 RETURNING *`,
      [autoValidateInbox, userId]
    );
    return row ? this.mapDbToUser(row) : null;
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user?.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  private mapDbToUser(r: any): User {
    return {
      id: r.id,
      email: r.email,
      username: r.username,
      passwordHash: r.password_hash,
      autoValidateInbox: r.auto_validate_inbox ?? true,
      createdAt: r.created_at instanceof Date ? r.created_at.getTime() : Number(r.created_at),
    };
  }

  // ─── API Tokens ────────────────────────────────────────────────────────────
  async createApiToken(userId: string, name?: string): Promise<any> {
    const token = `tk_${crypto.randomBytes(32).toString('hex')}`;
    const row = await queryOne<any>(
      `INSERT INTO api_tokens (user_id, token, name) VALUES ($1, $2, $3) RETURNING *`,
      [userId, token, name ?? null]
    );
    if (!row) throw new Error('Failed to create API token');
    return this.mapDbToToken(row);
  }

  async getApiTokensByUserId(userId: string): Promise<any[]> {
    const rows = await query(
      `SELECT * FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(r => this.mapDbToToken(r));
  }

  async deleteApiToken(id: string, userId: string): Promise<boolean> {
    const rows = await query(
      `DELETE FROM api_tokens WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    return rows.length > 0;
  }

  async updateTokenLastUsed(token: string): Promise<void> {
    await query(`UPDATE api_tokens SET last_used_at = NOW() WHERE token = $1`, [token]);
  }

  private mapDbToToken(r: any) {
    return {
      id: r.id,
      userId: r.user_id,
      token: r.token,
      name: r.name ?? undefined,
      createdAt: r.created_at instanceof Date ? r.created_at.getTime() : Number(r.created_at),
      lastUsedAt: r.last_used_at
        ? (r.last_used_at instanceof Date ? r.last_used_at.getTime() : Number(r.last_used_at))
        : undefined,
    };
  }

  // ─── Replit Accounts ──────────────────────────────────────────────────────
  async createReplitAccount(data: InsertReplitAccount): Promise<ReplitAccount> {
    const row = await queryOne<any>(
      `INSERT INTO replit_accounts (email, password, verified) VALUES ($1, $2, FALSE) RETURNING *`,
      [data.email, data.password]
    );
    if (!row) throw new Error('Failed to create Replit account');
    return this.mapDbToReplitAccount(row);
  }

  async getReplitAccountByEmail(email: string): Promise<ReplitAccount | null> {
    const row = await queryOne<any>(`SELECT * FROM replit_accounts WHERE email = $1`, [email]);
    return row ? this.mapDbToReplitAccount(row) : null;
  }

  async getReplitAccountById(id: string): Promise<ReplitAccount | null> {
    const row = await queryOne<any>(`SELECT * FROM replit_accounts WHERE id = $1`, [id]);
    return row ? this.mapDbToReplitAccount(row) : null;
  }

  async updateReplitAccount(id: string, updates: Partial<ReplitAccount>): Promise<ReplitAccount | null> {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.verified !== undefined) { sets.push(`verified = $${idx++}`);    params.push(updates.verified); }
    if (updates.verifiedAt !== undefined) { sets.push(`verified_at = $${idx++}`); params.push(new Date(updates.verifiedAt)); }

    if (sets.length === 0) return this.getReplitAccountById(id);
    params.push(id);
    const row = await queryOne<any>(
      `UPDATE replit_accounts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return row ? this.mapDbToReplitAccount(row) : null;
  }

  async deleteReplitAccount(id: string): Promise<boolean> {
    await query(`DELETE FROM replit_accounts WHERE id = $1`, [id]);
    return true;
  }

  async getAllReplitAccounts(): Promise<ReplitAccount[]> {
    const rows = await query(`SELECT * FROM replit_accounts ORDER BY created_at DESC`);
    return rows.map(r => this.mapDbToReplitAccount(r));
  }

  private mapDbToReplitAccount(r: any): ReplitAccount {
    return {
      id: r.id,
      email: r.email,
      password: r.password,
      verified: r.verified ?? false,
      createdAt: r.created_at instanceof Date ? r.created_at.getTime() : Number(r.created_at),
      verifiedAt: r.verified_at
        ? (r.verified_at instanceof Date ? r.verified_at.getTime() : Number(r.verified_at))
        : undefined,
    };
  }

  // ─── Cookies ──────────────────────────────────────────────────────────────
  async createCookie(data: InsertCookie): Promise<Cookie> {
    const row = await queryOne<any>(
      `INSERT INTO cookies
         (account_id, name, value, domain, path, expires, http_only, secure, same_site)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        data.accountId, data.name, data.value,
        data.domain ?? null, data.path ?? null, data.expires ?? null,
        data.httpOnly ?? null, data.secure ?? null, data.sameSite ?? null,
      ]
    );
    if (!row) throw new Error('Failed to create cookie');
    return this.mapDbToCookie(row);
  }

  async getCookiesByAccountId(accountId: string): Promise<Cookie[]> {
    const rows = await query(
      `SELECT * FROM cookies WHERE account_id = $1 ORDER BY created_at DESC`,
      [accountId]
    );
    return rows.map(r => this.mapDbToCookie(r));
  }

  async deleteCookie(id: string): Promise<boolean> {
    await query(`DELETE FROM cookies WHERE id = $1`, [id]);
    return true;
  }

  async deleteCookiesByAccountId(accountId: string): Promise<boolean> {
    await query(`DELETE FROM cookies WHERE account_id = $1`, [accountId]);
    return true;
  }

  private mapDbToCookie(r: any): Cookie {
    return {
      id: r.id,
      accountId: r.account_id,
      name: r.name,
      value: r.value,
      domain: r.domain ?? undefined,
      path: r.path ?? undefined,
      expires: r.expires ?? undefined,
      httpOnly: r.http_only ?? undefined,
      secure: r.secure ?? undefined,
      sameSite: r.same_site ?? undefined,
      createdAt: r.created_at instanceof Date ? r.created_at.getTime() : Number(r.created_at),
    };
  }
}

export const storage = new SupabaseStorage();
