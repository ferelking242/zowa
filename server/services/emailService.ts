import axios from 'axios';
import crypto from 'crypto';
import { type Message } from '@shared/schema';
import { cacheService } from './cacheService';
import { getProviderByDomain } from '@shared/email-providers';

export class EmailService {
  private devtaiBaseUrl = 'https://orifymail.com/api';
  private cacheTTL = 10000; // 10 seconds

  // ── mail.tm credential store ── email → JWT token ──────────────────────────
  private mailTmTokens: Map<string, string> = new Map();

  // ── Guerrilla Mail session store ── username → { sidToken, expiresAt } ─────
  private guerrillaSessions: Map<string, { sidToken: string; expiresAt: number }> = new Map();

  // ── Guerrilla message ID lookup ── msgId → username (for detail fetch) ──────
  private guerrillaMsgOwner: Map<string, string> = new Map();

  // ── Helpers ────────────────────────────────────────────────────────────────
  private getDomain(email: string): string {
    return email.split('@')[1] || '';
  }

  private getApiType(email: string): string {
    const provider = getProviderByDomain(this.getDomain(email));
    return provider?.apiType || 'devtai';
  }

  /**
   * Deterministic password for a mail.tm address — derived from the address
   * itself so we always produce the same token even after server restart.
   */
  private mailTmPassword(email: string): string {
    return crypto
      .createHash('sha256')
      .update(`mailtm:zowa2025:${email}`)
      .digest('hex')
      .slice(0, 24);
  }

  // ── DevTai ─────────────────────────────────────────────────────────────────
  private async getDevtaiMessages(email: string): Promise<Message[]> {
    const response = await axios.get(`${this.devtaiBaseUrl}/email/${email}`, { timeout: 10000 });
    const raw: any[] = response.data;
    if (!Array.isArray(raw)) return [];
    return raw.map((msg: any) => this.normalizeDevtai(msg));
  }

  private async getDevtaiMessageDetails(inboxId: string): Promise<Message | null> {
    try {
      const response = await axios.get(`${this.devtaiBaseUrl}/inbox/${inboxId}`, { timeout: 10000 });
      return this.normalizeDevtai(response.data);
    } catch {
      return null;
    }
  }

  private normalizeDevtai(msg: any): Message {
    return {
      id: String(msg.id),
      subject: msg.subject || '(no subject)',
      fromAddress: msg.fromAddress ?? msg.from ?? '',
      toAddress: msg.toAddress ?? msg.to ?? '',
      htmlContent: msg.htmlContent ?? msg.html ?? msg.body?.html ?? null,
      textContent: msg.textContent ?? msg.text ?? msg.body?.text ?? null,
      createdAt: msg.createdAt ?? msg.created_at ?? Date.now(),
      expiresAt: msg.expiresAt ?? msg.expires_at ?? (Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  // ── Guerrilla Mail ─────────────────────────────────────────────────────────
  private async getOrCreateGuerrillaSession(username: string): Promise<string | null> {
    const existing = this.guerrillaSessions.get(username);
    if (existing && Date.now() < existing.expiresAt) {
      return existing.sidToken;
    }

    try {
      const initResp = await axios.get(
        'https://api.guerrillamail.com/ajax.php?f=get_email_address&lang=en',
        { timeout: 12000 }
      );
      const sidToken: string = initResp.data.sid_token;
      if (!sidToken) return null;

      await axios.get(
        `https://api.guerrillamail.com/ajax.php?f=set_email_user&email_user=${encodeURIComponent(username)}&lang=en&sid_token=${sidToken}`,
        { timeout: 12000 }
      );

      this.guerrillaSessions.set(username, { sidToken, expiresAt: Date.now() + 55 * 60 * 1000 });
      console.log(`✅ [GUERRILLA] Session created for ${username}`);
      return sidToken;
    } catch (error: any) {
      console.error(`❌ [GUERRILLA] Session error for ${username}:`, error?.message);
      return null;
    }
  }

  private async getGuerrillaMessages(email: string): Promise<Message[]> {
    const [username] = email.split('@');
    if (!username) return [];

    const sidToken = await this.getOrCreateGuerrillaSession(username);
    if (!sidToken) return [];

    const doFetch = async (token: string): Promise<Message[]> => {
      const response = await axios.get(
        `https://api.guerrillamail.com/ajax.php?f=check_email&seq=0&sid_token=${token}`,
        { timeout: 10000 }
      );
      const list: any[] = response.data.list || [];
      return list.map((msg: any) => {
        const id = String(msg.mail_id);
        this.guerrillaMsgOwner.set(id, username); // remember who owns this msg
        return {
          id,
          subject: msg.mail_subject || '(no subject)',
          fromAddress: msg.mail_from || '',
          toAddress: email,
          htmlContent: null,
          textContent: msg.mail_excerpt || null,
          createdAt: Number(msg.mail_timestamp) * 1000,
          expiresAt: Date.now() + 60 * 60 * 1000,
        };
      });
    };

    try {
      return await doFetch(sidToken);
    } catch (error: any) {
      if (error?.response?.status === 403) {
        this.guerrillaSessions.delete(username);
        const newToken = await this.getOrCreateGuerrillaSession(username);
        if (!newToken) return [];
        try { return await doFetch(newToken); } catch { return []; }
      }
      console.error(`❌ [GUERRILLA] Failed for ${email}:`, error?.message);
      return [];
    }
  }

  private async getGuerrillaMessageDetails(messageId: string): Promise<Message | null> {
    const username = this.guerrillaMsgOwner.get(messageId);
    if (!username) return null;

    const existing = this.guerrillaSessions.get(username);
    if (!existing) return null;

    try {
      const response = await axios.get(
        `https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${messageId}&sid_token=${existing.sidToken}`,
        { timeout: 10000 }
      );
      const msg = response.data;
      return {
        id: String(msg.mail_id || messageId),
        subject: msg.mail_subject || '(no subject)',
        fromAddress: msg.mail_from || '',
        toAddress: `${username}@guerrillamail.com`,
        htmlContent: msg.mail_body || null,
        textContent: msg.mail_text_only || msg.mail_excerpt || null,
        createdAt: Number(msg.mail_timestamp) * 1000,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
    } catch {
      return null;
    }
  }

  // ── Mail.tm ────────────────────────────────────────────────────────────────
  private async getMailTmToken(email: string): Promise<string | null> {
    const cached = this.mailTmTokens.get(email);
    if (cached) return cached;

    const password = this.mailTmPassword(email);

    // Try to create the account (may return 422 if it already exists — that's fine)
    try {
      await axios.post('https://api.mail.tm/accounts', { address: email, password }, { timeout: 15000 });
    } catch (err: any) {
      if (err?.response?.status !== 422) {
        console.error(`❌ [MAILTM] Account create failed for ${email}:`, err?.message);
        // Don't return null yet — maybe the account exists with the same password
      }
    }

    // Get JWT token (works whether we just created or account already existed)
    try {
      const tokenResp = await axios.post(
        'https://api.mail.tm/token',
        { address: email, password },
        { timeout: 10000 }
      );
      const token: string = tokenResp.data.token;
      this.mailTmTokens.set(email, token);
      console.log(`✅ [MAILTM] Token obtained for ${email}`);
      return token;
    } catch (err: any) {
      console.error(`❌ [MAILTM] Token failed for ${email}:`, err?.message);
      return null;
    }
  }

  private async getMailTmMessages(email: string): Promise<Message[]> {
    const token = await this.getMailTmToken(email);
    if (!token) return [];

    const doFetch = async (jwt: string): Promise<Message[]> => {
      const response = await axios.get('https://api.mail.tm/messages', {
        headers: { Authorization: `Bearer ${jwt}` },
        timeout: 10000,
      });
      const items: any[] = response.data['hydra:member'] || [];
      return items.map((msg: any) => ({
        id: String(msg.id),
        subject: msg.subject || '(no subject)',
        fromAddress: msg.from?.address || '',
        toAddress: email,
        htmlContent: null,
        textContent: msg.intro || null,
        createdAt: new Date(msg.createdAt).getTime(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }));
    };

    try {
      return await doFetch(token);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        // Token expired — clear and retry (same password, fresh token)
        this.mailTmTokens.delete(email);
        const newToken = await this.getMailTmToken(email);
        if (!newToken) return [];
        try { return await doFetch(newToken); } catch { return []; }
      }
      console.error(`❌ [MAILTM] Failed for ${email}:`, error?.message);
      return [];
    }
  }

  private async getMailTmMessageDetails(messageId: string): Promise<Message | null> {
    // Try every stored mail.tm token until one works for this message
    const entries = Array.from(this.mailTmTokens.entries());
    for (let i = 0; i < entries.length; i++) {
      const [email, token] = entries[i];
      try {
        const response = await axios.get(`https://api.mail.tm/messages/${messageId}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        });
        const msg = response.data;
        return {
          id: String(msg.id),
          subject: msg.subject || '(no subject)',
          fromAddress: msg.from?.address || '',
          toAddress: msg.to?.[0]?.address || email,
          htmlContent: Array.isArray(msg.html) ? msg.html[0] : (msg.html || null),
          textContent: msg.text || null,
          createdAt: new Date(msg.createdAt).getTime(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };
      } catch {
        // Not owned by this token — try next
      }
    }
    return null;
  }

  // ── Pre-register ───────────────────────────────────────────────────────────
  async preRegisterEmail(email: string): Promise<void> {
    const apiType = this.getApiType(email);
    if (apiType === 'mailtm') {
      await this.getMailTmToken(email);
    } else if (apiType === 'guerrilla') {
      const [username] = email.split('@');
      if (username) await this.getOrCreateGuerrillaSession(username);
    }
    // devtai: no pre-registration needed
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  async getMessages(email: string, bypassCache: boolean = false): Promise<Message[]> {
    if (!email) return [];

    const cacheKey = `messages:${email}`;

    if (!bypassCache) {
      const cached = cacheService.get<Message[]>(cacheKey);
      if (cached !== null) {
        console.log(`⚡ [EMAIL] Cache hit for ${email} (${cached.length} msgs)`);
        return cached;
      }
    } else {
      console.log(`🔄 [EMAIL] Bypass cache for ${email}`);
    }

    console.log(`📧 [EMAIL] Fetching: ${email}`);
    const start = Date.now();
    let messages: Message[] = [];

    try {
      const apiType = this.getApiType(email);

      if (apiType === 'guerrilla') {
        messages = await this.getGuerrillaMessages(email);
      } else if (apiType === 'mailtm') {
        messages = await this.getMailTmMessages(email);
      } else {
        // DevTai (default for all devtai domains)
        messages = await this.getDevtaiMessages(email);
      }

      cacheService.set(cacheKey, messages, this.cacheTTL);
      console.log(`✅ [EMAIL] ${messages.length} msgs for ${email} in ${Date.now() - start}ms`);
      return messages;
    } catch (error: any) {
      console.error(`❌ [EMAIL] Failed for ${email}:`, error?.message);
      return [];
    }
  }

  async getMessageDetails(inboxId: string): Promise<Message | null> {
    // 1. Check if it's a Guerrilla message (we track the owner)
    if (this.guerrillaMsgOwner.has(inboxId)) {
      const guerrillaResult = await this.getGuerrillaMessageDetails(inboxId);
      if (guerrillaResult) return guerrillaResult;
    }

    // 2. Try mail.tm (IDs look like MongoDB ObjectIDs)
    if (this.mailTmTokens.size > 0) {
      const mailTmResult = await this.getMailTmMessageDetails(inboxId);
      if (mailTmResult) return mailTmResult;
    }

    // 3. Fall back to DevTai
    return await this.getDevtaiMessageDetails(inboxId);
  }

  async deleteMessage(inboxId: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.devtaiBaseUrl}/delete/${inboxId}`, { timeout: 10000 });
      return response.data === true;
    } catch {
      return false;
    }
  }

  invalidateCache(email: string): void {
    cacheService.invalidate(`messages:${email}`);
  }

  invalidateAllCaches(): void {
    cacheService.invalidatePattern('messages:');
  }

  // ── Link extraction ────────────────────────────────────────────────────────
  extractLinksFromMessage(message: Message): string[] {
    const links: string[] = [];
    if (message.htmlContent) links.push(...this.extractLinksFromHtml(message.htmlContent));
    if (message.textContent) links.push(...this.extractLinksFromText(message.textContent));
    const unique = Array.from(new Set(links));
    return unique.filter(url => this.isValidationLink(url));
  }

  private isValidationLink(url: string): boolean {
    try {
      const decoded = this.decodeHtmlEntities(url);
      const urlObj = new URL(decoded);
      const params = urlObj.searchParams;
      const path = urlObj.pathname.toLowerCase();
      const hasOobCode = params.has('oobCode');
      const mode = params.get('mode') || '';
      const hasVerifyMode = mode.includes('verify');
      const hasVerifyPath = path.includes('verify') || path.includes('confirm') ||
        path.includes('activate') || path.includes('action-code');
      const isTracking = urlObj.hostname.includes('email.mg') ||
        path.includes('/o/') || path.includes('unsubscribe') ||
        path.includes('/account') || path.includes('settings') ||
        path.includes('preferences');
      return (hasOobCode && (hasVerifyMode || hasVerifyPath) && !isTracking) ||
        (!hasOobCode && hasVerifyPath && !isTracking);
    } catch {
      return false;
    }
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  private extractLinksFromHtml(html: string): string[] {
    const links: string[] = [];
    const re = /<a[^>]+href="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) links.push(this.decodeHtmlEntities(m[1]));
    return links;
  }

  private extractLinksFromText(text: string): string[] {
    return (text.match(/https?:\/\/[^\s\]]+/g) || []).map(u => this.decodeHtmlEntities(u));
  }

  isFirebaseLink(url: string): boolean {
    try {
      const decoded = this.decodeHtmlEntities(url);
      const urlObj = new URL(decoded);
      return urlObj.searchParams.has('oobCode') &&
        (urlObj.searchParams.has('apiKey') || urlObj.hostname.includes('firebase') ||
          urlObj.hostname.includes('google'));
    } catch { return false; }
  }

  detectLinkType(url: string): {
    provider: string;
    type: 'verification' | 'reset' | 'confirmation' | 'action' | 'unknown';
    icon: string;
    color: string;
  } {
    try {
      const decoded = this.decodeHtmlEntities(url);
      const urlObj = new URL(decoded);
      const hostname = urlObj.hostname.toLowerCase();
      const path = urlObj.pathname.toLowerCase();
      const params = urlObj.searchParams;
      if (params.has('oobCode') && (params.has('apiKey') || hostname.includes('firebase') || hostname.includes('google'))) {
        const mode = params.get('mode') || '';
        const type = mode.includes('verify') ? 'verification' : mode.includes('reset') ? 'reset' : 'action';
        return { provider: 'Google/Firebase', type, icon: 'SiGoogle', color: 'text-red-500' };
      }
      if (hostname.includes('replit.com') || hostname.includes('repl.it')) {
        return { provider: 'Replit', type: path.includes('verify') || path.includes('confirm') || params.has('token') ? 'verification' : 'action', icon: 'SiReplit', color: 'text-orange-500' };
      }
      if (hostname.includes('telegram') || hostname.includes('t.me')) return { provider: 'Telegram', type: 'verification', icon: 'SiTelegram', color: 'text-blue-400' };
      if (hostname.includes('github.com')) return { provider: 'GitHub', type: path.includes('verify') || path.includes('confirm') ? 'verification' : 'action', icon: 'SiGithub', color: 'text-gray-700 dark:text-gray-300' };
      if (hostname.includes('discord.com')) return { provider: 'Discord', type: path.includes('verify') || path.includes('confirm') ? 'verification' : 'action', icon: 'SiDiscord', color: 'text-indigo-500' };
      if (hostname.includes('linkedin.com')) return { provider: 'LinkedIn', type: path.includes('verify') ? 'verification' : 'action', icon: 'SiLinkedin', color: 'text-blue-600' };
      if (hostname.includes('twitter.com') || hostname.includes('x.com')) return { provider: 'Twitter/X', type: path.includes('verify') ? 'verification' : 'action', icon: 'SiX', color: 'text-black dark:text-white' };
      if (hostname.includes('microsoft.com') || hostname.includes('outlook.com')) return { provider: 'Microsoft', type: path.includes('verify') ? 'verification' : 'action', icon: 'SiMicrosoft', color: 'text-blue-500' };
      if (hostname.includes('stripe.com')) return { provider: 'Stripe', type: 'verification', icon: 'SiStripe', color: 'text-purple-600' };
      if (path.includes('verify') || path.includes('confirm') || path.includes('activate')) return { provider: hostname, type: 'verification', icon: 'Mail', color: 'text-primary' };
      if (path.includes('reset') || params.has('reset')) return { provider: hostname, type: 'reset', icon: 'Key', color: 'text-amber-500' };
      return { provider: hostname, type: 'unknown', icon: 'Link', color: 'text-muted-foreground' };
    } catch {
      return { provider: 'Unknown', type: 'unknown', icon: 'Link', color: 'text-muted-foreground' };
    }
  }
}

export const emailService = new EmailService();
