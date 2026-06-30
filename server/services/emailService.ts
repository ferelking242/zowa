import axios from 'axios';
import { type Message } from '@shared/schema';
import { cacheService } from './cacheService';

export class EmailService {
  private baseUrl = 'https://email.devtai.net/api';
  private cacheTTL = 10000; // 10 seconds cache

  async getMessages(email: string, bypassCache: boolean = false): Promise<Message[]> {
    const cacheKey = `messages:${email}`;
    
    // Check cache first (unless bypass requested)
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
    
    try {
      const response = await axios.get(`${this.baseUrl}/email/${email}`);
      const duration = Date.now() - startTime;
      const rawMessages = response.data;
      
      // Normalize API response: map html/text fields to htmlContent/textContent
      const messages = rawMessages.map((msg: any) => this.normalizeMessage(msg));
      
      // Store in cache
      cacheService.set(cacheKey, messages, this.cacheTTL);
      
      console.log(`✅ [EMAIL API] Fetched ${messages.length} messages for ${email} in ${duration}ms (cached for ${this.cacheTTL}ms)`);
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
      const response = await axios.get(`${this.baseUrl}/inbox/${inboxId}`);
      const rawMessage = response.data;
      
      return this.normalizeMessage(rawMessage);
    } catch (error) {
      console.error('Failed to fetch message details:', error);
      return null;
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
    
    // Extract from HTML content
    if (message.htmlContent) {
      const htmlLinks = this.extractLinksFromHtml(message.htmlContent);
      console.log('🔗 [LINK EXTRACTION] Found', htmlLinks.length, 'links in HTML');
      links.push(...htmlLinks);
    }
    
    // Extract from text content
    if (message.textContent) {
      const textLinks = this.extractLinksFromText(message.textContent);
      console.log('🔗 [LINK EXTRACTION] Found', textLinks.length, 'links in text');
      links.push(...textLinks);
    }
    
    const uniqueLinks = Array.from(new Set(links));
    
    // Filter to keep only VALIDATION links (with oobCode and mode=verify/verifyEmail)
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
      
      // Must have oobCode (Firebase/Google style verification)
      const hasOobCode = params.has('oobCode');
      
      // Must have mode=verify or mode=verifyEmail OR path contains verify/confirm/activate
      const mode = params.get('mode') || '';
      const hasVerifyMode = mode.includes('verify') || mode.includes('Verify');
      const hasVerifyPath = path.includes('verify') || path.includes('confirm') || path.includes('activate') || path.includes('action-code');
      
      // Exclude tracking links (email.mg, tracking, unsubscribe, account settings)
      const isTrackingLink = urlObj.hostname.includes('email.mg') || 
                            path.includes('/o/') || 
                            path.includes('unsubscribe') || 
                            path.includes('/account') ||
                            path.includes('settings') ||
                            path.includes('preferences');
      
      // Validation link: has oobCode AND (verify mode OR verify path) AND NOT a tracking link
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
      // Decode HTML entities (handle &amp; -> &, &lt; -> <, etc.)
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
    // Decode HTML entities in URLs found in text
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

      // Firebase/Google
      if (params.has('oobCode') && (params.has('apiKey') || hostname.includes('firebase') || hostname.includes('google'))) {
        const mode = params.get('mode') || '';
        let type: 'verification' | 'reset' | 'confirmation' | 'action' | 'unknown' = 'unknown';
        if (mode.includes('verify')) type = 'verification';
        else if (mode.includes('reset')) type = 'reset';
        else type = 'action';
        
        return { 
          provider: 'Google/Firebase', 
          type, 
          icon: 'SiGoogle',
          color: 'text-red-500'
        };
      }

      // Replit
      if (hostname.includes('replit.com') || hostname.includes('repl.it')) {
        if (path.includes('verify') || path.includes('confirm') || params.has('token')) {
          return { 
            provider: 'Replit', 
            type: 'verification',
            icon: 'SiReplit',
            color: 'text-orange-500'
          };
        }
        return { 
          provider: 'Replit', 
          type: 'action',
          icon: 'SiReplit',
          color: 'text-orange-500'
        };
      }

      // Telegram
      if (hostname.includes('telegram') || hostname.includes('t.me')) {
        return { 
          provider: 'Telegram', 
          type: 'verification',
          icon: 'SiTelegram',
          color: 'text-blue-400'
        };
      }

      // GitHub
      if (hostname.includes('github.com')) {
        if (path.includes('verify') || path.includes('confirm')) {
          return { 
            provider: 'GitHub', 
            type: 'verification',
            icon: 'SiGithub',
            color: 'text-gray-700 dark:text-gray-300'
          };
        }
        return { 
          provider: 'GitHub', 
          type: 'action',
          icon: 'SiGithub',
          color: 'text-gray-700 dark:text-gray-300'
        };
      }

      // Discord
      if (hostname.includes('discord.com')) {
        if (path.includes('verify') || path.includes('confirm')) {
          return { 
            provider: 'Discord', 
            type: 'verification',
            icon: 'SiDiscord',
            color: 'text-indigo-500'
          };
        }
        return { 
          provider: 'Discord', 
          type: 'action',
          icon: 'SiDiscord',
          color: 'text-indigo-500'
        };
      }

      // LinkedIn
      if (hostname.includes('linkedin.com')) {
        return { 
          provider: 'LinkedIn', 
          type: path.includes('verify') ? 'verification' : 'action',
          icon: 'SiLinkedin',
          color: 'text-blue-600'
        };
      }

      // Twitter/X
      if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
        return { 
          provider: 'Twitter/X', 
          type: path.includes('verify') ? 'verification' : 'action',
          icon: 'SiX',
          color: 'text-black dark:text-white'
        };
      }

      // Microsoft
      if (hostname.includes('microsoft.com') || hostname.includes('outlook.com') || hostname.includes('live.com')) {
        return { 
          provider: 'Microsoft', 
          type: path.includes('verify') ? 'verification' : 'action',
          icon: 'SiMicrosoft',
          color: 'text-blue-500'
        };
      }

      // Stripe
      if (hostname.includes('stripe.com')) {
        return { 
          provider: 'Stripe', 
          type: 'verification',
          icon: 'SiStripe',
          color: 'text-purple-600'
        };
      }

      // Vercel
      if (hostname.includes('vercel.com')) {
        return { 
          provider: 'Vercel', 
          type: path.includes('verify') ? 'verification' : 'action',
          icon: 'SiVercel',
          color: 'text-black dark:text-white'
        };
      }

      // Generic verification patterns
      if (path.includes('verify') || path.includes('confirm') || path.includes('activate')) {
        return { 
          provider: hostname, 
          type: 'verification',
          icon: 'Mail',
          color: 'text-primary'
        };
      }

      if (path.includes('reset') || params.has('reset')) {
        return { 
          provider: hostname, 
          type: 'reset',
          icon: 'Key',
          color: 'text-amber-500'
        };
      }

      return { 
        provider: hostname, 
        type: 'unknown',
        icon: 'Link',
        color: 'text-muted-foreground'
      };
    } catch {
      return { 
        provider: 'Unknown', 
        type: 'unknown',
        icon: 'Link',
        color: 'text-muted-foreground'
      };
    }
  }
}

export const emailService = new EmailService();
