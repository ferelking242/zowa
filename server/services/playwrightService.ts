import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export class PlaywrightService {
  private activeValidations = 0;

  async initialize(): Promise<void> {
    try {
      console.log('🎭 [PLAYWRIGHT] Initializing with stealth mode (2025 anti-detection)...');
      // Browsers are created on-demand with anti-detection flags
      console.log('🎭 [PLAYWRIGHT] Ready (headless + stealth scripts + anti-automation flags)');
    } catch (error: any) {
      console.error('❌ [PLAYWRIGHT] Failed to initialize:', error.message);
    }
  }

  async validateLink(url: string): Promise<{
    success: boolean;
    finalUrl?: string;
    pageTitle?: string;
    pageText?: string;
    screenshot?: string;
  }> {
    let browser: Browser | null = null;
    let page: Page | null = null;
    
    try {
      this.activeValidations++;
      
      // Decode HTML entities in URL
      const decodedUrl = url
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      
      console.log('🎭 [PLAYWRIGHT] Launching stealth browser...');
      
      // Launch with best 2025 anti-detection flags
      browser = await chromium.launch({ 
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
        ]
      });
      
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        }
      });
      
      page = await context.newPage();
      
      // CRITICAL: Remove webdriver flag and add stealth scripts
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
        (window as any).chrome = { runtime: {} };
      });
      
      console.log('🌐 [PLAYWRIGHT] Navigating to:', decodedUrl);
      
      // Navigate with optimized strategy
      await page.goto(decodedUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      // Wait for page to be interactive
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('⚠️ [PLAYWRIGHT] Network not idle, continuing anyway...');
      });
      
      // Simulate human behavior - shorter wait
      const humanDelay = 1000 + Math.random() * 1000;
      console.log(`⏳ [PLAYWRIGHT] Waiting ${Math.round(humanDelay/1000)}s for page to process...`);
      await page.waitForTimeout(humanDelay);
      
      // Simulate mouse movement
      await page.mouse.move(100 + Math.random() * 200, 100 + Math.random() * 200);
      await page.waitForTimeout(300);
      
      // Get page info
      const finalUrl = page.url();
      const pageTitle = await page.title();
      const pageText = await page.evaluate(() => document.body.innerText);
      
      // Check for success
      const success = await this.checkValidationSuccess(page);
      
      if (success) {
        console.log('✅ [PLAYWRIGHT] Validation successful!');
        return {
          success: true,
          finalUrl,
          pageTitle,
          pageText: pageText.substring(0, 500)
        };
      } else {
        console.log('❌ [PLAYWRIGHT] Validation failed or inconclusive');
        
        // Take screenshot for debugging
        const screenshotPath = `validation-debug-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('📸 [PLAYWRIGHT] Debug screenshot saved:', screenshotPath);
        
        return {
          success: false,
          finalUrl,
          pageTitle,
          pageText: pageText.substring(0, 500),
          screenshot: screenshotPath
        };
      }
    } catch (error: any) {
      console.error('❌ [PLAYWRIGHT] Validation error:', error.message);
      return { success: false };
    } finally {
      if (page) {
        await page.close();
      }
      if (browser) {
        await browser.close();
      }
      this.activeValidations--;
    }
  }

  private async checkValidationSuccess(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url();
      const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
      
      console.log('🔍 [PLAYWRIGHT] Current URL:', currentUrl);
      console.log('📄 [PLAYWRIGHT] Page text (first 200 chars):', pageText.substring(0, 200));
      
      // Replit-specific success indicators
      const successIndicators = {
        hasSuccessText: pageText.includes('success') || 
                        pageText.includes('verified') ||
                        pageText.includes('confirmed') ||
                        pageText.includes('complete') ||
                        pageText.includes('you can now close'),
        hasErrorText: pageText.includes('error') ||
                      pageText.includes('expired') ||
                      pageText.includes('invalid') ||
                      pageText.includes('failed'),
        urlChanged: !currentUrl.includes('action-code'),
        urlHasSuccess: /success|verified|confirmed|complete/i.test(currentUrl)
      };
      
      console.log('📊 [PLAYWRIGHT] Indicators:', JSON.stringify(successIndicators, null, 2));
      
      // Success if we have success text and no errors
      const isSuccess = successIndicators.hasSuccessText && !successIndicators.hasErrorText;
      
      return isSuccess;
    } catch (error) {
      console.error('❌ [PLAYWRIGHT] Error checking success:', error);
      return false;
    }
  }


  getActiveBrowserCount(): number {
    return this.activeValidations;
  }

  async cleanup(): Promise<void> {
    this.activeValidations = 0;
  }
}

export const playwrightService = new PlaywrightService();

// Initialize on startup
playwrightService.initialize().catch(console.error);
