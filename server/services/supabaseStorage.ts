import { supabase } from '../lib/supabase';
import { 
  type LinkValidation, 
  type InsertLinkValidation, 
  type User, 
  type InsertUser,
  type ReplitAccount,
  type InsertReplitAccount,
  type Cookie,
  type InsertCookie
} from '@shared/schema';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export class SupabaseStorage {
  async createLinkValidation(data: InsertLinkValidation): Promise<LinkValidation> {
    const validation = {
      inbox_id: data.inboxId,
      url: data.url,
      method: data.method,
      status: 'pending' as const,
      link_type: data.linkType || null,
    };

    const { data: result, error } = await supabase
      .from('link_validations')
      .insert(validation)
      .select()
      .single();

    if (error) {
      console.error('Error creating link validation:', error);
      throw new Error(`Failed to create link validation: ${error.message}`);
    }

    return this.mapDbToLinkValidation(result);
  }

  async getLinkValidation(inboxId: string): Promise<LinkValidation | null> {
    const { data, error } = await supabase
      .from('link_validations')
      .select('*')
      .eq('inbox_id', inboxId)
      .maybeSingle();

    if (error) {
      console.error('Error getting link validation:', error);
      return null;
    }

    return data ? this.mapDbToLinkValidation(data) : null;
  }

  async updateLinkValidation(
    inboxId: string,
    updates: Partial<LinkValidation>
  ): Promise<LinkValidation> {
    const existing = await this.getLinkValidation(inboxId);

    if (!existing) {
      console.error('Cannot update non-existent validation for inboxId:', inboxId);
      throw new Error('Validation record not found');
    }

    const dbUpdates: any = {};

    if (updates.status) dbUpdates.status = updates.status;
    if (updates.validatedAt !== undefined) dbUpdates.validated_at = updates.validatedAt;
    if (updates.linkType !== undefined) dbUpdates.link_type = updates.linkType;

    const { data, error } = await supabase
      .from('link_validations')
      .update(dbUpdates)
      .eq('inbox_id', inboxId)
      .select()
      .maybeSingle();

    if (error || !data) {
      console.error('Error updating link validation:', error);
      throw new Error(`Failed to update link validation: ${error?.message || 'No data returned'}`);
    }

    return this.mapDbToLinkValidation(data);
  }

  async saveEmailToHistory(email: string, userId?: string, messageCount?: number): Promise<void> {
    const { error } = await supabase
      .from('email_history')
      .upsert({
        email,
        user_id: userId || null,
        last_checked: new Date().toISOString(),
        message_count: messageCount || 0,
        has_validated_links: false
      }, {
        onConflict: 'email'
      });

    if (error) {
      console.error('Error saving email to history:', error);
    }
  }

  async getEmailHistory(userId?: string): Promise<Array<{
    email: string;
    lastChecked: string;
    messageCount: number;
    hasValidatedLinks: boolean;
    validationStatus: string | null;
    createdAt: string;
  }>> {
    let query = supabase
      .from('email_history')
      .select('email, last_checked, message_count, has_validated_links, validation_status, created_at')
      .order('last_checked', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error getting email history:', error);
      return [];
    }

    return (data || []).map(item => ({
      email: item.email,
      lastChecked: item.last_checked,
      messageCount: item.message_count || 0,
      hasValidatedLinks: item.has_validated_links || false,
      validationStatus: item.validation_status,
      createdAt: item.created_at,
    }));
  }

  async updateEmailHistoryMessageCount(email: string, messageCount: number): Promise<void> {
    const { error } = await supabase
      .from('email_history')
      .update({
        message_count: messageCount,
        last_checked: new Date().toISOString()
      })
      .eq('email', email);

    if (error) {
      console.error('Error updating email history:', error);
    }
  }

  async createUser(data: Omit<InsertUser, 'passwordHash'> & { password: string }): Promise<User> {
    console.log(`[AUTH] Creating user with email: ${data.email}`);
    const hashedPassword = await bcrypt.hash(data.password, 10);
    console.log(`[AUTH] Password hashed successfully`);

    const { data: result, error } = await supabase
      .from('users')
      .insert({
        email: data.email,
        username: data.username,
        password_hash: hashedPassword,
        auto_validate_inbox: true,
      })
      .select()
      .single();

    if (error) {
      console.error(`[AUTH] Error creating user:`, error);
      throw new Error(error.message);
    }

    console.log(`[AUTH] User created successfully: ${result.email}`);
    return this.mapDbToUser(result);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (error) {
      console.error('Error getting user by email:', error);
      return null;
    }

    return data ? this.mapDbToUser(data) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', username)
      .maybeSingle();

    if (error) {
      console.error('Error getting user by username:', error);
      return null;
    }

    return data ? this.mapDbToUser(data) : null;
  }

  async updateUserSettings(userId: string, autoValidateInbox: boolean): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .update({ auto_validate_inbox: autoValidateInbox })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user settings:', error);
      return null;
    }

    return this.mapDbToUser(data);
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error getting user by id:', error);
      return null;
    }

    return data ? this.mapDbToUser(data) : null;
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);

    if (!user) {
      console.error(`[AUTH] User not found for email: ${email}`);
      return null;
    }

    if (!user.passwordHash) {
      console.error(`[AUTH] No password stored for user: ${email}`);
      return null;
    }

    console.log(`[AUTH] Verifying password for user: ${email}`);
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      console.error(`[AUTH] Invalid password for user: ${email}`);
      return null;
    }

    console.log(`[AUTH] Password verified successfully for user: ${email}`);
    return this.mapDbToUser(user);
  }

  private mapDbToUser(dbData: any): User {
    return {
      id: dbData.id,
      email: dbData.email,
      username: dbData.username,
      passwordHash: dbData.password_hash,
      autoValidateInbox: dbData.auto_validate_inbox ?? true,
      createdAt: new Date(dbData.created_at).getTime(),
    };
  }

  private mapDbToLinkValidation(dbData: any): LinkValidation {
    return {
      inboxId: dbData.inbox_id,
      url: dbData.url,
      status: dbData.status,
      method: dbData.method,
      validatedAt: dbData.validated_at || undefined,
      linkType: dbData.link_type || undefined,
    };
  }

  async createApiToken(userId: string, name?: string): Promise<any> {
    const token = `tk_${crypto.randomBytes(32).toString('hex')}`;

    const { data, error } = await supabase
      .from('api_tokens')
      .insert({
        user_id: userId,
        token,
        name: name || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating API token:', error);
      throw new Error(error.message);
    }

    return {
      id: data.id,
      userId: data.user_id,
      token: data.token,
      name: data.name,
      createdAt: new Date(data.created_at).getTime(),
      lastUsedAt: data.last_used_at ? new Date(data.last_used_at).getTime() : undefined,
    };
  }

  async getApiTokensByUserId(userId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('api_tokens')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting API tokens:', error);
      return [];
    }

    return (data || []).map(item => ({
      id: item.id,
      userId: item.user_id,
      token: item.token,
      name: item.name,
      createdAt: new Date(item.created_at).getTime(),
      lastUsedAt: item.last_used_at ? new Date(item.last_used_at).getTime() : undefined,
    }));
  }

  async deleteApiToken(id: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('api_tokens')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error deleting API token:', error);
      return false;
    }

    return data !== null;
  }

  async updateTokenLastUsed(token: string): Promise<void> {
    const { error } = await supabase
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token);

    if (error) {
      console.error('Error updating token last used:', error);
    }
  }

  async createReplitAccount(data: InsertReplitAccount): Promise<ReplitAccount> {
    const { data: result, error } = await supabase
      .from('replit_accounts')
      .insert({
        email: data.email,
        password: data.password,
        verified: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating Replit account:', error);
      throw new Error(`Failed to create Replit account: ${error.message}`);
    }

    return this.mapDbToReplitAccount(result);
  }

  async getReplitAccountByEmail(email: string): Promise<ReplitAccount | null> {
    const { data, error } = await supabase
      .from('replit_accounts')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Error getting Replit account by email:', error);
      return null;
    }

    return data ? this.mapDbToReplitAccount(data) : null;
  }

  async getReplitAccountById(id: string): Promise<ReplitAccount | null> {
    const { data, error } = await supabase
      .from('replit_accounts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error getting Replit account by id:', error);
      return null;
    }

    return data ? this.mapDbToReplitAccount(data) : null;
  }

  async updateReplitAccount(id: string, updates: Partial<ReplitAccount>): Promise<ReplitAccount | null> {
    const dbUpdates: any = {};
    
    if (updates.verified !== undefined) dbUpdates.verified = updates.verified;
    if (updates.verified && updates.verifiedAt) dbUpdates.verified_at = new Date(updates.verifiedAt).toISOString();

    const { data, error } = await supabase
      .from('replit_accounts')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating Replit account:', error);
      return null;
    }

    return data ? this.mapDbToReplitAccount(data) : null;
  }

  async deleteReplitAccount(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('replit_accounts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting Replit account:', error);
      return false;
    }

    return true;
  }

  async getAllReplitAccounts(): Promise<ReplitAccount[]> {
    const { data, error } = await supabase
      .from('replit_accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting all Replit accounts:', error);
      return [];
    }

    return (data || []).map(item => this.mapDbToReplitAccount(item));
  }

  async createCookie(data: InsertCookie): Promise<Cookie> {
    const { data: result, error } = await supabase
      .from('cookies')
      .insert({
        account_id: data.accountId,
        name: data.name,
        value: data.value,
        domain: data.domain || null,
        path: data.path || null,
        expires: data.expires || null,
        http_only: data.httpOnly || null,
        secure: data.secure || null,
        same_site: data.sameSite || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating cookie:', error);
      throw new Error(`Failed to create cookie: ${error.message}`);
    }

    return this.mapDbToCookie(result);
  }

  async getCookiesByAccountId(accountId: string): Promise<Cookie[]> {
    const { data, error } = await supabase
      .from('cookies')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting cookies by account ID:', error);
      return [];
    }

    return (data || []).map(item => this.mapDbToCookie(item));
  }

  async deleteCookie(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('cookies')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting cookie:', error);
      return false;
    }

    return true;
  }

  async deleteCookiesByAccountId(accountId: string): Promise<boolean> {
    const { error } = await supabase
      .from('cookies')
      .delete()
      .eq('account_id', accountId);

    if (error) {
      console.error('Error deleting cookies by account ID:', error);
      return false;
    }

    return true;
  }

  private mapDbToReplitAccount(dbData: any): ReplitAccount {
    return {
      id: dbData.id,
      email: dbData.email,
      password: dbData.password,
      verified: dbData.verified ?? false,
      createdAt: new Date(dbData.created_at).getTime(),
      verifiedAt: dbData.verified_at ? new Date(dbData.verified_at).getTime() : undefined,
    };
  }

  private mapDbToCookie(dbData: any): Cookie {
    return {
      id: dbData.id,
      accountId: dbData.account_id,
      name: dbData.name,
      value: dbData.value,
      domain: dbData.domain || undefined,
      path: dbData.path || undefined,
      expires: dbData.expires || undefined,
      httpOnly: dbData.http_only ?? undefined,
      secure: dbData.secure ?? undefined,
      sameSite: dbData.same_site || undefined,
      createdAt: new Date(dbData.created_at).getTime(),
    };
  }
}

export const storage = new SupabaseStorage();