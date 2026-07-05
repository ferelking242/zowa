import axios from 'axios';
import crypto from 'crypto';
import { type Message } from '@shared/schema';
import { cacheService } from './cacheService';
import { getProviderByDomain } from '@shared/email-providers';

export class EmailService {
  private baseUrl = 'https://email.devtai.net/api';
  private cacheTTL = 10000; // 10 seconds cache

  // ──────────────────────────────────────────────
  // Multi-provider routing helpers
  // ──────────────────────────────────────────────
  private getDomainFromEmail(email: string): string {
    return email.split('@')[1] || '';
  }

  private getApiTypeForEmail(email: string): string {
    const domain = this.getDomainFromEmail(email);
    const provider = getProviderByDomain(domain);
    return provider?.apiType || 'devtai';
  }

  // MD5 hash helper for TempMail API
  private md5(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
  }

  // ──────────────────────────────────────────────
  // 1SecMail API — 1secmail.com / .org / .net
  // ──────────────────────────────────────────────
  private async getOneSecMailMessages(email: string): Promise<Message[]> {
    const [login, domain] = email.split('@');
    if (!login || !domain) return [];
    const url = `https://www.1secmail.com/api/v1/?action=getMessages&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}`;
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const raw: any[] = response.data;
      if (!Array.isArray(raw)) return [];
      return raw.map((msg: any) => ({
        id: String(msg.id),
        subject: msg.subject || '(no subject)',
        fromAddress: msg.from || '',
        toAddress: email,
        htmlContent: null,
        textContent: null,
        createdAt: msg.date ? new Date(msg.date).getTime() : Date.now(),
        expiresAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
      }));
    } catch (error: any) {
      if (error?.response?.status === 404) return [];
      console.error(`❌ [1SECMAIL] Failed for ${email}:`, error?.message);
      return [];
    }
  }

  private async getOneSecMailMessageDetails(login: string, domain: string, id: string): Promise<Message | null> {
    try {
      const url = `https://www.1secmail.com/api/v1/?action=readMessage&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}&id=${id}`;
      const response = await axios.get(url, { timeout: 10000 });
      const msg = response.data;
      return {
        id: String(msg.id),
        subject: msg.subject || '(no subject)',
        fromAddress: msg.from || '',
        toAddress: `${login}@${domain}`,
        htmlContent: msg.htmlBody || null,
        textContent: msg.textBody || null,
        createdAt: msg.date ? new Date(msg.date).getTime() : Date.now(),
        expiresAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
      };
    } catch (error) {
      console.error('Failed to fetch 1SecMail message details:', error);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // TempMail (temp-mail.org) API — homephit.com
  // ──────────────────────────────────────────────
  private async getTempMailMessages(email: string): Promise<Message[]> {
    const hash = this.md5(email);
    const url = `https://api.temp-mail.org/request/mail/id/${hash}/format/json`;
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const raw = response.data;

      if (!Array.isArray(raw)) return [];

      return raw.map((msg: any) => ({
        id: String(msg.mail_id || msg.id || Math.random()),
        subject: msg.mail_subject || msg.subject || '(no subject)',
        fromAddress: msg.mail_from || msg.from || '',
        toAddress: email,
        htmlContent: msg.mail_html || msg.html || null,
        textContent: msg.mail_text || msg.text || null,
        createdAt: msg.mail_timestamp ? Number(msg.mail_timestamp) * 1000 : Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }));
    } catch (error: any) {
      // 404 = no messages yet — treat as empty inbox, not an error
      if (error?.response?.status === 404) return [];
      console.error(`❌ [TEMPMAIL API] Failed for ${email}:`, error?.message || error);
      return [];
    }
  }

  private async getTempMailMessageDetails(messageId: string): Promise<Message | null> {
    try {
      const url = `https://api.temp-mail.org/request/one_mail/id/${messageId}/format/json`;
      const response = await axios.get(url, { timeout: 10000 });
      const msg = response.data;
      return {
        id: String(msg.mail_id || messageId),
        subject: msg.mail_subject || '(no subject)',
        fromAddress: msg.mail_from || '',
        toAddress: msg.mail_to || '',
        htmlContent: msg.mail_html || null,
        textContent: msg.mail_text || null,
        createdAt: msg.mail_timestamp ? Number(msg.mail_timestamp) * 1000 : Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
    } catch (error) {
      console.error('Failed to fetch TempMail message details:', error);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────
  async getMessages(email: string, bypassCache: boolean = false): Promise<Message[]> {
    const cacheKey = `messages:${email}`;

    if (!bypassCache) {
      const cached = cacheService.get<Message[]>(cacheKey);
      if (cached !== null) {
        console.log(`⚡ [EMAIL API] Using cached messages for ${email} (${cached.length} messages)`);
        return cached;
      }
    } else {
      console.log(`🔄 [EMAIL API] Bypassing cache for ${email} (forced refresh)`);
    }

    const startTime = Date.now();
    console.log(`📧 [EMAIL API] Starting fetch for: ${email}`);

    let messages: Message[] = [];

    try {
      const apiType = this.getApiTypeForEmail(email);

      if (apiType === 'tempmail') {
        messages = await this.getTempMailMessages(email);
      } else if (apiType === 'onesecmail') {
        messages = await this.getOneSecMailMessages(email);
      } else {
        // DevTai (default for devtai / guerrilla / maildrop fallback)
        const response = await axios.get(`${this.baseUrl}/email/${email}`);
        const rawMessages = response.data;
        messages = rawMessages.map((msg: any) => this.normalizeMessage(msg));
      }

      const duration = Date.now() - startTime;
      cacheService.set(cacheKey, messages, this.cacheTTL);
      console.log(`✅ [EMAIL API] Fetched ${messages.length} messages for ${email} in ${duration}ms`);
      return messages;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [EMAIL API] Failed to fetch messages for ${email} after ${duration}ms:`, error);
      return [];
    }
  }

  invalidateCache(email: string): void {
    const cacheKey = `messages:${email}`;
    cacheService.invalidate(cacheKey);
    console.log(`🗑️ [EMAIL API] Invalidated cache for ${email}`);
  }

  invalidateAllCaches(): void {
    cacheService.invalidatePattern('messages:');
    console.log(`🗑️ [EMAIL API] Invalidated all message caches`);
  }

  async getMessageDetails(inboxId: string): Promise<Message | null> {
    try {
      // Try TempMail API first if inboxId looks like a TempMail ID (numeric)
      // Otherwise fall back to DevTai
      const response = await axios.get(`${this.baseUrl}/inbox/${inboxId}`);
      const rawMessage = response.data;
      return this.normalizeMessage(rawMessage);
    } catch (error) {
      // Try TempMail API
      try {
        return await this.getTempMailMessageDetails(inboxId);
      } catch {
        console.error('Failed to fetch message details:', error);
        return null;
      }
    }
  }

  private normalizeMessage(msg: any): Message {
    const htmlContent = msg.htmlContent ?? msg.html ?? msg.body?.html ?? null;
    const textContent = msg.textContent ?? msg.text ?? msg.body?.text ?? null;

    return {
      id: msg.id,
      subject: msg.subject,
      fromAddress: msg.fromAddress ?? msg.from,
      toAddress: msg.toAddress ?? msg.to,
      htmlContent,
      textContent,
      createdAt: msg.createdAt ?? msg.created_at ?? Date.now(),
      expiresAt: msg.expiresAt ?? msg.expires_at ?? (Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  async deleteMessage(inboxId: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/delete/${inboxId}`);
      return response.data === true;
    } catch (error) {
      console.error('Failed to delete message:', error);
      return false;
    }
  }

  extractLinksFromMessage(message: Message): string[] {
    const links: string[] = [];

    if (message.htmlContent) {
      const htmlLinks = this.extractLinksFromHtml(message.htmlContent);
      console.log('🔗 [LINK EXTRACTION] Found', htmlLinks.length, 'links in HTML');
      links.push(...htmlLinks);
    }

    if (message.textContent) {
      const textLinks = this.extractLinksFromText(message.textContent);
      console.log('🔗 [LINK EXTRACTION] Found', textLinks.length, 'links in text');
      links.push(...textLinks);
    }

    const uniqueLinks = Array.from(new Set(links));
    const validationLinks = uniqueLinks.filter(url => this.isValidationLink(url));

    console.log('🔗 [LINK EXTRACTION] Total unique links:', uniqueLinks.length);
    console.log('✅ [LINK EXTRACTION] Validation links only:', validationLinks.length);

    return validationLinks;
  }

  private isValidationLink(url: string): boolean {
    try {
      const decodedUrl = url
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      const urlObj = new URL(decodedUrl);
      const params = urlObj.searchParams;
      const path = urlObj.pathname.toLowerCase();

      const hasOobCode = params.has('oobCode');
      const mode = params.get('mode') || '';
      const hasVerifyMode = mode.includes('verify') || mode.includes('Verify');
      const hasVerifyPath = path.includes('verify') || path.includes('confirm') || path.includes('activate') || path.includes('action-code');

      const isTrackingLink = urlObj.hostname.includes('email.mg') ||
                            path.includes('/o/') ||
                            path.includes('unsubscribe') ||
                            path.includes('/account') ||
                            path.includes('settings') ||
                            path.includes('preferences');

      return (hasOobCode && (hasVerifyMode || hasVerifyPath) && !isTrackingLink) ||
             (!hasOobCode && hasVerifyPath && !isTrackingLink);
    } catch {
      return false;
    }
  }

  private extractLinksFromHtml(html: string): string[] {
    const links: string[] = [];
    const linkRegex = /<a[^>]+href="([^"]+)"/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      let decodedLink = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      links.push(decodedLink);
    }

    return links;
  }

  private extractLinksFromText(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s\]]+/g;
    const matches = text.match(urlRegex) || [];
    return matches.map(url =>
      url.replace(/&amp;/g, '&')
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>')
         .replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'")
    );
  }

  isFirebaseLink(url: string): boolean {
    try {
      const decodedUrl = url
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      const urlObj = new URL(decodedUrl);
      const hasOobCode = urlObj.searchParams.has('oobCode');
      const hasApiKey = urlObj.searchParams.has('apiKey');
      const isFirebaseDomain = urlObj.hostname.includes('firebase') || urlObj.hostname.includes('google');

      return hasOobCode && (hasApiKey || isFirebaseDomain);
    } catch {
      return false;
    }
  }

  detectLinkType(url: string): {
    provider: string;
    type: 'verification' | 'reset' | 'confirmation' | 'action' | 'unknown';
    icon: string;
    color: string;
  } {
    try {
      const decodedUrl = url
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      const urlObj = new URL(decodedUrl);
      const hostname = urlObj.hostname.toLowerCase();
      const path = urlObj.pathname.toLowerCase();
      const params = urlObj.searchParams;

      if (params.has('oobCode') && (params.has('apiKey') || hostname.includes('firebase') || hostname.includes('google'))) {
        const mode = params.get('mode') || '';
        let type: 'verification' | 'reset' | 'confirmation' | 'action' | 'unknown' = 'unknown';
        if (mode.includes('verify')) type = 'verification';
        else if (mode.includes('reset')) type = 'reset';
        else type = 'action';
        return { provider: 'Google/Firebase', type, icon: 'SiGoogle', color: 'text-red-500' };
      }

      if (hostname.includes('replit.com') || hostname.includes('repl.it')) {
        if (path.includes('verify') || path.includes('confirm') || params.has('token')) {
          return { provider: 'Replit', type: 'verification', icon: 'SiReplit', color: 'text-orange-500' };
        }
        return { provider: 'Replit', type: 'action', icon: 'SiReplit', color: 'text-orange-500' };
      }

      if (hostname.includes('telegram') || hostname.includes('t.me')) {
        return { provider: 'Telegram', type: 'verification', icon: 'SiTelegram', color: 'text-blue-400' };
      }

      if (hostname.includes('github.com')) {
        if (path.includes('verify') || path.includes('confirm')) {
          return { provider: 'GitHub', type: 'verification', icon: 'SiGithub', color: 'text-gray-700 dark:text-gray-300' };
        }
        return { provider: 'GitHub', type: 'action', icon: 'SiGithub', color: 'text-gray-700 dark:text-gray-300' };
      }

      if (hostname.includes('discord.com')) {
        if (path.includes('verify') || path.includes('confirm')) {
          return { provider: 'Discord', type: 'verification', icon: 'SiDiscord', color: 'text-indigo-500' };
        }
        return { provider: 'Discord', type: 'action', icon: 'SiDiscord', color: 'text-indigo-500' };
      }

      if (hostname.includes('linkedin.com')) {
        return { provider: 'LinkedIn', type: path.includes('verify') ? 'verification' : 'action', icon: 'SiLinkedin', color: 'text-blue-600' };
      }

      if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
        return { provider: 'Twitter/X', type: path.includes('verify') ? 'verification' : 'action', icon: 'SiX', color: 'text-black dark:text-white' };
      }

      if (hostname.includes('microsoft.com') || hostname.includes('outlook.com') || hostname.includes('live.com')) {
        return { provider: 'Microsoft', type: path.includes('verify') ? 'verification' : 'action', icon: 'SiMicrosoft', color: 'text-blue-500' };
      }

      if (hostname.includes('stripe.com')) {
        return { provider: 'Stripe', type: 'verification', icon: 'SiStripe', color: 'text-purple-600' };
      }

      if (hostname.includes('vercel.com')) {
        return { provider: 'Vercel', type: path.includes('verify') ? 'verification' : 'action', icon: 'SiVercel', color: 'text-black dark:text-white' };
      }

      if (path.includes('verify') || path.includes('confirm') || path.includes('activate')) {
        return { provider: hostname, type: 'verification', icon: 'Mail', color: 'text-primary' };
      }

      if (path.includes('reset') || params.has('reset')) {
        return { provider: hostname, type: 'reset', icon: 'Key', color: 'text-amber-500' };
      }

      return { provider: hostname, type: 'unknown', icon: 'Link', color: 'text-muted-foreground' };
    } catch {
      return { provider: 'Unknown', type: 'unknown', icon: 'Link', color: 'text-muted-foreground' };
    }
  }
}

export const emailService = new EmailService();
