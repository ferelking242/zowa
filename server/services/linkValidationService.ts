import { emailService } from './emailService';
import { playwrightService } from './playwrightService';
import { storage } from './supabaseStorage';
import { type LinkValidation } from '@shared/schema';

export class LinkValidationService {
  async validateLinksInMessage(inboxId: string): Promise<LinkValidation[]> {
    try {
      console.log('🔍 [VALIDATION DEBUG] Starting validation for inboxId:', inboxId);
      
      // Check if validation already exists - never re-validate if it exists
      const existingValidation = await storage.getLinkValidation(inboxId);
      if (existingValidation) {
        console.log('✅ [VALIDATION DEBUG] Found existing validation, returning it:', existingValidation);
        return [existingValidation];
      }

      const message = await emailService.getMessageDetails(inboxId);
      if (!message) {
        console.error('❌ [VALIDATION DEBUG] Message not found for inboxId:', inboxId);
        throw new Error('Message not found');
      }

      console.log('📧 [VALIDATION DEBUG] Message received:');
      console.log('  From:', message.fromAddress);
      console.log('  Subject:', message.subject);
      console.log('  Has HTML Content:', !!message.htmlContent);
      console.log('  Has Text Content:', !!message.textContent);

      const links = emailService.extractLinksFromMessage(message);
      console.log('🔗 [VALIDATION DEBUG] Extracted links:', links);
      
      if (links.length === 0) {
        console.log('⚠️ [VALIDATION DEBUG] No links found in message');
        return [];
      }

      const validations: LinkValidation[] = [];
      
      // Process first link only (as per the design reference)
      const firstLink = links[0];
      const isFirebase = emailService.isFirebaseLink(firstLink);
      
      console.log('🎯 [VALIDATION DEBUG] First link:', firstLink);
      console.log('🔥 [VALIDATION DEBUG] Is Firebase link:', isFirebase);
      
      // Detect link type
      const linkType = emailService.detectLinkType(firstLink);
      console.log('🔍 [VALIDATION DEBUG] Link type:', linkType);

      // Only create new validation if it doesn't exist
      const validation = existingValidation || await storage.createLinkValidation({
        inboxId,
        url: firstLink,
        method: 'playwright',
        linkType,
      });

      console.log('🎭 [VALIDATION DEBUG] Starting Playwright stealth validation...');
      const result = await this.validateWithPlaywright(inboxId, firstLink);
      console.log('🎭 [VALIDATION DEBUG] Playwright validation result:', result ? 'SUCCESS' : 'FAILED');

      validations.push(validation);
      return validations;
    } catch (error) {
      console.error('❌ [VALIDATION DEBUG] Failed to validate links:', error);
      return [];
    }
  }

  private async validateWithPlaywright(inboxId: string, url: string): Promise<boolean> {
    try {
      const decodedUrl = url
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      
      const result = await playwrightService.validateLink(decodedUrl);
      await storage.updateLinkValidation(inboxId, {
        status: result.success ? 'success' : 'failed',
        validatedAt: Date.now(),
      });
      return result.success;
    } catch (error) {
      console.error('Playwright validation failed:', error);
      await storage.updateLinkValidation(inboxId, {
        status: 'failed',
        validatedAt: Date.now(),
      });
      return false;
    }
  }

  async getValidationStatus(inboxId: string): Promise<LinkValidation | null> {
    const validation = await storage.getLinkValidation(inboxId);
    return validation || null;
  }

  async getActiveBrowserCount(): Promise<number> {
    return playwrightService.getActiveBrowserCount();
  }
}

export const linkValidationService = new LinkValidationService();
