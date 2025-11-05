import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page, BrowserContext } from 'playwright';
import { nanoid } from 'nanoid';
import { emailService } from './emailService';
import { supabase } from '../lib/supabase';
import type { ReplitAccount, Cookie, AutomationTask, AutomationStep } from '@shared/schema';
import Captcha from '2captcha';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

type UpdateCallback = (task: AutomationTask) => void;

class WorkerPool {
  private maxWorkers: number;
  private activeWorkers = 0;
  private queue: (() => Promise<void>)[] = [];

  constructor(maxWorkers: number) {
    this.maxWorkers = maxWorkers;
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    while (this.activeWorkers >= this.maxWorkers) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.activeWorkers++;
    try {
      return await task();
    } finally {
      this.activeWorkers--;
      this.processQueue();
    }
  }

  private processQueue() {
    if (this.queue.length > 0 && this.activeWorkers < this.maxWorkers) {
      const nextTask = this.queue.shift();
      if (nextTask) nextTask();
    }
  }

  getActiveCount(): number {
    return this.activeWorkers;
  }
}

export class AccountAutomationService {
  private tasks: Map<string, AutomationTask> = new Map();
  private updateCallbacks: Map<string, UpdateCallback[]> = new Map();
  private workerPool: WorkerPool;
  private readonly MAX_RETRIES = 3;
  private readonly MAX_WORKERS = 3;
  private debugMode: boolean = false;
  private captchaSolver: any = null;
  private readonly COOKIES_DIR = path.join(process.cwd(), '.browser-data/cookies');
  private readonly USER_DATA_DIR = path.join(process.cwd(), '.browser-data/profiles');

  constructor() {
    this.workerPool = new WorkerPool(this.MAX_WORKERS);
    const apiKey = process.env.CAPTCHA_API_KEY;
    if (apiKey) {
      this.captchaSolver = new Captcha.Solver(apiKey);
      console.log('✅ [2CAPTCHA] Service initialized');
    } else {
      console.log('⚠️  [2CAPTCHA] No API key found (set CAPTCHA_API_KEY for automatic CAPTCHA solving)');
    }
    
    if (!fs.existsSync(this.COOKIES_DIR)) {
      fs.mkdirSync(this.COOKIES_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.USER_DATA_DIR)) {
      fs.mkdirSync(this.USER_DATA_DIR, { recursive: true });
    }
  }

  private async saveCookies(context: BrowserContext, taskId: string): Promise<void> {
    try {
      const cookies = await context.cookies();
      const cookiesPath = path.join(this.COOKIES_DIR, `${taskId}.json`);
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
      console.log('🍪 [COOKIES] Cookies saved:', cookiesPath);
    } catch (error: any) {
      console.error('❌ [COOKIES] Failed to save cookies:', error.message);
    }
  }

  private async loadCookies(context: BrowserContext, taskId: string): Promise<boolean> {
    try {
      const cookiesPath = path.join(this.COOKIES_DIR, `${taskId}.json`);
      if (fs.existsSync(cookiesPath)) {
        const cookiesData = fs.readFileSync(cookiesPath, 'utf-8');
        const cookies = JSON.parse(cookiesData);
        await context.addCookies(cookies);
        console.log('🍪 [COOKIES] Cookies loaded:', cookiesPath);
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('❌ [COOKIES] Failed to load cookies:', error.message);
      return false;
    }
  }

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
  }

  private async solveCaptcha(page: Page, task: AutomationTask): Promise<string | null> {
    if (!this.captchaSolver) {
      this.addDebugLog(task, '⚠️  2Captcha non configuré - définir CAPTCHA_API_KEY');
      return null;
    }

    try {
      this.addDebugLog(task, '🔍 Recherche du sitekey reCAPTCHA...');
      
      const sitekey = await page.evaluate(() => {
        const recaptchaElements = document.querySelectorAll('[data-sitekey]');
        if (recaptchaElements.length > 0) {
          return (recaptchaElements[0] as HTMLElement).getAttribute('data-sitekey');
        }
        
        const scriptTags = Array.from(document.getElementsByTagName('script'));
        for (const script of scriptTags) {
          const match = script.textContent?.match(/sitekey["\s:]+["']([^"']+)["']/);
          if (match) return match[1];
        }
        return null;
      });

      if (!sitekey) {
        this.addDebugLog(task, '❌ Sitekey reCAPTCHA introuvable');
        return null;
      }

      this.addDebugLog(task, `🔑 Sitekey trouvé: ${sitekey.substring(0, 20)}...`);
      this.addDebugLog(task, '🤖 Résolution du reCAPTCHA avec 2Captcha...');
      
      const result = await this.captchaSolver.recaptcha({
        googlekey: sitekey,
        pageurl: page.url(),
      });

      this.addDebugLog(task, '✅ reCAPTCHA résolu avec succès!');
      return result.data;
    } catch (error: any) {
      this.addDebugLog(task, `❌ Erreur 2Captcha: ${error.message}`);
      return null;
    }
  }

  private async injectCaptchaSolution(page: Page, token: string, task: AutomationTask): Promise<void> {
    try {
      this.addDebugLog(task, '💉 Injection du token reCAPTCHA...');
      
      await page.evaluate((captchaToken) => {
        const responseField = document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement;
        if (responseField) {
          responseField.value = captchaToken;
        }

        if (typeof (window as any).___grecaptcha_cfg !== 'undefined') {
          const clients = (window as any).___grecaptcha_cfg.clients;
          Object.keys(clients).forEach(key => {
            const client = clients[key];
            if (client && client.callback) {
              client.callback(captchaToken);
            }
          });
        }

        if (typeof (window as any).grecaptcha !== 'undefined' && (window as any).grecaptcha.getResponse) {
          const originalGetResponse = (window as any).grecaptcha.getResponse;
          (window as any).grecaptcha.getResponse = function() {
            return captchaToken || originalGetResponse.apply(this, arguments);
          };
        }
      }, token);

      this.addDebugLog(task, '✅ Token reCAPTCHA injecté');
    } catch (error: any) {
      this.addDebugLog(task, `❌ Erreur injection: ${error.message}`);
    }
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }

  async initialize(): Promise<void> {
    console.log('🤖 [AUTOMATION] Service initialized with Stealth Plugin');
  }

  private async humanScroll(page: Page) {
    const scrollSteps = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < scrollSteps; i++) {
      await page.evaluate(() => {
        window.scrollBy({
          top: Math.floor(Math.random() * 300) + 100,
          behavior: 'smooth'
        });
      });
      await page.waitForTimeout(Math.floor(Math.random() * 500) + 300);
    }
  }

  private async humanMouseMove(page: Page, viewport: { width: number; height: number }, targetX?: number, targetY?: number) {
    const currentPos = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
    const startX = currentPos.x;
    const startY = currentPos.y;
    const endX = targetX ?? Math.floor(Math.random() * viewport.width);
    const endY = targetY ?? Math.floor(Math.random() * viewport.height);
    
    const steps = Math.floor(Math.random() * 50) + 50;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      
      const controlX = startX + (endX - startX) * 0.5 + (Math.random() - 0.5) * 100;
      const controlY = startY + (endY - startY) * 0.5 + (Math.random() - 0.5) * 100;
      
      const x = Math.pow(1 - t, 2) * startX + 
                2 * (1 - t) * t * controlX + 
                Math.pow(t, 2) * endX;
      const y = Math.pow(1 - t, 2) * startY + 
                2 * (1 - t) * t * controlY + 
                Math.pow(t, 2) * endY;
      
      const jitterX = (Math.random() - 0.5) * 3;
      const jitterY = (Math.random() - 0.5) * 3;
      
      await page.mouse.move(x + jitterX, y + jitterY);
      await page.waitForTimeout(Math.random() * 5 + 2);
    }
  }

  onTaskUpdate(taskId: string, callback: UpdateCallback) {
    if (!this.updateCallbacks.has(taskId)) {
      this.updateCallbacks.set(taskId, []);
    }
    this.updateCallbacks.get(taskId)!.push(callback);
  }

  private notifyUpdate(task: AutomationTask) {
    const callbacks = this.updateCallbacks.get(task.id) || [];
    callbacks.forEach(cb => cb(task));
  }

  private addLog(task: AutomationTask, log: string) {
    task.logs.push(log);
    this.notifyUpdate(task);
  }

  private addDebugLog(task: AutomationTask, log: string) {
    if (this.debugMode) {
      task.debugLogs.push(log);
    }
  }

  private updateStep(task: AutomationTask, stepId: string, status: 'running' | 'completed' | 'failed', log?: string) {
    const step = task.steps.find(s => s.id === stepId);
    if (step) {
      step.status = status;
    }
    
    if (log) {
      task.logs.push(log);
    }
  }

  async createReplitAccount(email: string): Promise<{ taskId: string; task: AutomationTask }> {
    const taskId = nanoid();
    const task: AutomationTask = {
      id: taskId,
      provider: 'replit',
      email,
      password: email,
      status: 'pending',
      steps: [
        { id: 'load', label: 'Chargement de la page', status: 'pending' },
        { id: 'form', label: 'Saisie email et mot de passe', status: 'pending' },
        { id: 'submit', label: 'Création du compte', status: 'pending' },
        { id: 'redirect', label: 'Redirection réussie', status: 'pending' },
        { id: 'email_verify', label: 'Validation de l\'email', status: 'pending' },
      ],
      logs: [],
      debugLogs: [],
      screenshots: [],
      errorMessages: [],
      createdAt: Date.now(),
    };

    this.tasks.set(taskId, task);
    
    this.addDebugLog(task, '🚀 Démarrage de l\'automatisation Replit');
    this.addDebugLog(task, `📧 Email: ${email}`);
    this.addDebugLog(task, '⏳ Initialisation...');

    this.runAutomation(taskId).catch(error => {
      console.error('❌ [AUTOMATION] Fatal error:', error);
      task.status = 'failed';
      task.errorMessages.push(`Erreur fatale: ${error.message}`);
      task.completedAt = Date.now();
      this.notifyUpdate(task);
    });

    return { taskId, task };
  }

  async createMultipleAccounts(count: number, statusCallback: (completed: number, total: number) => void): Promise<string[]> {
    const taskIds: string[] = [];
    let completed = 0;

    const promises = Array.from({ length: count }, async (_, i) => {
      return this.workerPool.execute(async () => {
        const randomNum = Math.floor(Math.random() * 1000000);
        const email = `autouser${randomNum}@antdev.org`;
        
        const { taskId, task } = await this.createReplitAccount(email);
        taskIds.push(taskId);
        
        return new Promise<void>((resolve) => {
          this.onTaskUpdate(taskId, (updatedTask) => {
            if (updatedTask.status === 'completed' || updatedTask.status === 'failed') {
              completed++;
              statusCallback(completed, count);
              resolve();
            }
          });
        });
      });
    });

    await Promise.all(promises);
    return taskIds;
  }

  private async runAutomation(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'running';
    this.notifyUpdate(task);
    
    this.addDebugLog(task, '▶️ Démarrage de l\'automatisation...');

    const notifyInterval = setInterval(() => {
      this.notifyUpdate(task);
    }, 1000);

    try {
      for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
        if (attempt > 1) {
          this.addDebugLog(task, `\n🔄 Tentative ${attempt}/${this.MAX_RETRIES}`);
          
          task.steps.forEach(step => {
            if (step.status === 'failed') step.status = 'pending';
          });
          
          const delay = Math.floor(Math.random() * 8000) + 5000;
          this.addDebugLog(task, `⏳ Pause de ${Math.floor(delay/1000)}s...`);
          this.notifyUpdate(task);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          task.errorMessages = [];
          task.screenshots = [];
          task.debugLogs = task.debugLogs.filter(log => 
            log.includes('🚀 Démarrage') || 
            log.includes('📧 Email:') || 
            log.includes('⏳ Initialisation') ||
            log.includes('▶️ Démarrage') ||
            log.includes('🔄 Tentative') ||
            log.includes('⏳ Pause')
          );
        }

        const success = await this.attemptSignup(task, attempt);
        
        if (success) {
          task.status = 'completed';
          task.completedAt = Date.now();
          this.notifyUpdate(task);
          clearInterval(notifyInterval);
          return;
        }
      }

      task.status = 'failed';
      task.completedAt = Date.now();
      this.addDebugLog(task, `❌ Échec définitif après ${this.MAX_RETRIES} tentatives`);
      this.notifyUpdate(task);
    } finally {
      clearInterval(notifyInterval);
    }
  }

  private getRandomFingerprint() {
    const profiles = [
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        platform: 'Win32',
        vendor: 'Google Inc.',
        locale: 'en-US',
        languages: ['en-US', 'en'],
        timezone: 'America/New_York',
        geolocation: { latitude: 40.7128, longitude: -74.0060 },
        deviceScaleFactor: 1,
        maxTouchPoints: 0,
      },
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        platform: 'Win32',
        vendor: 'Google Inc.',
        locale: 'en-US',
        languages: ['en-US', 'en'],
        timezone: 'America/Chicago',
        geolocation: { latitude: 41.8781, longitude: -87.6298 },
        deviceScaleFactor: 1,
        maxTouchPoints: 0,
      },
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        vendor: 'Apple Computer, Inc.',
        locale: 'en-US',
        languages: ['en-US', 'en'],
        timezone: 'America/Los_Angeles',
        geolocation: { latitude: 34.0522, longitude: -118.2437 },
        deviceScaleFactor: 2,
        maxTouchPoints: 0,
      },
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        vendor: 'Apple Computer, Inc.',
        locale: 'en-GB',
        languages: ['en-GB', 'en'],
        timezone: 'Europe/London',
        geolocation: { latitude: 51.5074, longitude: -0.1278 },
        deviceScaleFactor: 2,
        maxTouchPoints: 0,
      },
      {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        platform: 'Linux x86_64',
        vendor: 'Google Inc.',
        locale: 'en-US',
        languages: ['en-US', 'en'],
        timezone: 'America/New_York',
        geolocation: { latitude: 40.7128, longitude: -74.0060 },
        deviceScaleFactor: 1,
        maxTouchPoints: 0,
      },
    ];
    
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 1600, height: 900 },
    ];
    
    const profile = profiles[Math.floor(Math.random() * profiles.length)];
    const viewport = viewports[Math.floor(Math.random() * viewports.length)];
    
    return {
      ...profile,
      viewport,
    };
  }

  private async attemptSignup(task: AutomationTask, attemptNumber: number): Promise<boolean> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      if (attemptNumber > 1) {
        this.addDebugLog(task, `🔄 Tentative ${attemptNumber}/${this.MAX_RETRIES} avec nouveau contexte propre`);
        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 5000) + 5000));
      }
      
      const fingerprint = this.getRandomFingerprint();
      
      this.updateStep(task, 'load', 'running', `🎭 Browser: ${fingerprint.viewport.width}x${fingerprint.viewport.height} (Tentative ${attemptNumber})`);

      this.addDebugLog(task, '🌐 Configuration navigateur avec anti-détection 2025...');
      
      browser = await chromium.launch({ 
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--allow-running-insecure-content',
          '--disable-notifications',
          '--disable-popup-blocking',
          '--start-maximized',
          '--disable-infobars',
          '--disable-automation',
          '--disable-extensions-except=/dev/null',
          '--disable-extensions',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-client-side-phishing-detection',
          '--disable-component-extensions-with-background-pages',
          '--disable-default-apps',
          '--disable-domain-reliability',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--safebrowsing-disable-auto-update',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          `--window-size=${fingerprint.viewport.width},${fingerprint.viewport.height}`,
          `--user-agent=${fingerprint.userAgent}`,
        ]
      });
      
      this.addDebugLog(task, '🍪 Création du contexte avec cookies persistants...');
      
      context = await browser.newContext({
        viewport: fingerprint.viewport,
        userAgent: fingerprint.userAgent,
        locale: fingerprint.locale,
        timezoneId: fingerprint.timezone,
        permissions: ['notifications', 'geolocation'],
        geolocation: { 
          latitude: fingerprint.geolocation.latitude + (Math.random() - 0.5) * 0.02, 
          longitude: fingerprint.geolocation.longitude + (Math.random() - 0.5) * 0.02 
        },
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': `${fingerprint.locale},en;q=0.9`,
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Connection': 'keep-alive',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
          'DNT': '1',
          'sec-ch-ua': '"Chromium";v="120", "Not(A:Brand";v="24", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        deviceScaleFactor: fingerprint.deviceScaleFactor,
        hasTouch: false,
        isMobile: false,
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        forcedColors: 'none',
      });
      
      await this.loadCookies(context, task.id);
      
      page = await context.newPage();
      
      await page.addInitScript((fingerprintData) => {
        delete (Object as any).getPrototypeOf(navigator).webdriver;
        
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });
        
        Object.defineProperty(navigator, 'languages', { 
          get: () => fingerprintData.languages,
          configurable: true
        });
        
        Object.defineProperty(navigator, 'hardwareConcurrency', { 
          get: () => Math.floor(Math.random() * 4) + 8,
          configurable: true
        });
        
        Object.defineProperty(navigator, 'platform', { 
          get: () => fingerprintData.platform,
          configurable: true
        });
        
        Object.defineProperty(navigator, 'vendor', { 
          get: () => fingerprintData.vendor,
          configurable: true
        });
        
        Object.defineProperty(navigator, 'maxTouchPoints', { 
          get: () => fingerprintData.maxTouchPoints,
          configurable: true
        });
        
        Object.defineProperty(navigator, 'deviceMemory', { 
          get: () => 8,
          configurable: true
        });
        
        const mockPlugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        
        Object.defineProperty(navigator, 'plugins', { 
          get: () => mockPlugins,
          configurable: true
        });
        
        (window as any).chrome = {
          runtime: {},
          loadTimes: () => {},
          csi: () => {},
          app: {},
        };

        Object.defineProperty(window, 'Notification', {
          get: () => function Notification() {},
          configurable: true
        });

        delete (window as any).__nightmare;
        delete (window as any)._Selenium_IDE_Recorder;
        delete (window as any).callPhantom;
        delete (window as any)._phantom;
        delete (window as any).__webdriver_script_fn;

        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          const renderers = ['Intel Inc.', 'NVIDIA Corporation', 'AMD'];
          const gpus = ['Intel Iris OpenGL Engine', 'NVIDIA GeForce GTX 1060', 'AMD Radeon RX 580'];
          if (parameter === 37445) return renderers[Math.floor(Math.random() * renderers.length)];
          if (parameter === 37446) return gpus[Math.floor(Math.random() * gpus.length)];
          return getParameter.call(this, parameter);
        };

        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
          const context = this.getContext('2d');
          if (context) {
            const imageData = context.getImageData(0, 0, this.width, this.height);
            const noise = Math.floor(Math.random() * 5);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] += Math.floor(Math.random() * noise) - Math.floor(noise / 2);
              imageData.data[i + 1] += Math.floor(Math.random() * noise) - Math.floor(noise / 2);
              imageData.data[i + 2] += Math.floor(Math.random() * noise) - Math.floor(noise / 2);
            }
            context.putImageData(imageData, 0, 0);
          }
          return originalToDataURL.apply(this, args);
        };

        const audioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (audioContext) {
          const originalGetChannelData = audioContext.prototype.getChannelData;
          audioContext.prototype.getChannelData = function(...args: any[]) {
            const data = originalGetChannelData.apply(this, args);
            const noise = Math.random() * 0.0001;
            for (let i = 0; i < data.length; i++) {
              data[i] += (Math.random() - 0.5) * noise;
            }
            return data;
          };
        }

        Object.defineProperty(navigator, 'getBattery', {
          get: () => async () => ({
            charging: Math.random() > 0.5,
            chargingTime: Math.floor(Math.random() * 3600),
            dischargingTime: Math.floor(Math.random() * 7200) + 3600,
            level: Math.random() * 0.4 + 0.5
          }),
          configurable: true
        });

        if ((window as any).RTCPeerConnection) {
          const originalCreateDataChannel = (window as any).RTCPeerConnection.prototype.createDataChannel;
          (window as any).RTCPeerConnection.prototype.createDataChannel = function(...args: any[]) {
            const channel = originalCreateDataChannel.apply(this, args);
            return channel;
          };
        }

        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 50,
            downlink: 10,
            saveData: false
          }),
          configurable: true
        });

        Object.defineProperty(screen, 'availTop', {
          get: () => 0,
          configurable: true
        });

        Object.defineProperty(screen, 'availLeft', {
          get: () => 0,
          configurable: true
        });
      }, {
        platform: fingerprint.platform,
        vendor: fingerprint.vendor,
        languages: fingerprint.languages,
        maxTouchPoints: fingerprint.maxTouchPoints,
      });

      this.updateStep(task, 'load', 'running', '🌐 Navigation vers replit.com/signup...');
      
      await page.goto('https://replit.com/signup', { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      const initialDelay = this.debugMode ? 
        Math.floor(Math.random() * 500) + 500 : 
        Math.floor(Math.random() * 3000) + 5000;
      this.addDebugLog(task, `⏳ Attente initiale: ${initialDelay}ms (simulation comportement humain)`);
      await page.waitForTimeout(initialDelay);

      await this.humanScroll(page);
      await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
      
      for (let i = 0; i < 3; i++) {
        await page.mouse.move(
          Math.floor(Math.random() * fingerprint.viewport.width * 0.8),
          Math.floor(Math.random() * fingerprint.viewport.height * 0.8),
          { steps: Math.floor(Math.random() * 20) + 10 }
        );
        await page.waitForTimeout(Math.floor(Math.random() * 500) + 200);
      }
      
      await this.humanScroll(page);
      await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);

      const screenshot1 = await page.screenshot({ fullPage: true });
      task.screenshots.push(`data:image/png;base64,${screenshot1.toString('base64')}`);

      this.updateStep(task, 'load', 'completed');
      this.addDebugLog(task, '✅ Page chargée');
      this.updateStep(task, 'form', 'running');

      const delay1 = this.debugMode ? 
        Math.floor(Math.random() * 100) + 50 : 
        Math.floor(Math.random() * 800) + 700;
      await page.waitForTimeout(delay1);

      const emailPasswordButton = await page.locator('button:has-text("Email"), button:has-text("email"), button:has-text("password")').first();
      
      if (await emailPasswordButton.count()) {
        await this.humanMouseMove(page, fingerprint.viewport);
        await page.waitForTimeout(Math.floor(Math.random() * 300) + 200);
        await emailPasswordButton.click();
        const delay2 = this.debugMode ? 
          Math.floor(Math.random() * 800) + 500 : 
          Math.floor(Math.random() * 2000) + 1500;
        await page.waitForTimeout(delay2);
        this.addDebugLog(task, '✅ Bouton Email & Password cliqué');
      }

      const emailInput = page.locator('input[name="email"], input[type="email"], input[autocomplete="email"]').first();
      
      if (!(await emailInput.count())) {
        throw new Error('Champ email introuvable');
      }

      await this.humanMouseMove(page, fingerprint.viewport);
      await emailInput.click();
      await page.waitForTimeout(this.debugMode ? 100 : 400);
      
      const typeDelay = this.debugMode ? 
        () => Math.floor(Math.random() * 30) + 20 :
        () => Math.floor(Math.random() * 150) + 100;
      
      for (const char of task.email) {
        await emailInput.type(char, { delay: typeDelay() });
        if (Math.random() > 0.9) {
          await page.waitForTimeout(Math.floor(Math.random() * 200) + 100);
        }
      }
      
      this.addDebugLog(task, `📝 Email saisi:\n   ${task.email}`);
      
      await page.waitForTimeout(this.debugMode ? 200 : Math.floor(Math.random() * 1000) + 800);

      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      
      if (!(await passwordInput.count())) {
        throw new Error('Champ password introuvable');
      }

      await this.humanMouseMove(page, fingerprint.viewport);
      await passwordInput.click();
      await page.waitForTimeout(this.debugMode ? 100 : 400);
      
      for (const char of task.password!) {
        await passwordInput.type(char, { delay: typeDelay() });
        if (Math.random() > 0.85) {
          await page.waitForTimeout(Math.floor(Math.random() * 300) + 100);
        }
      }
      
      this.updateStep(task, 'form', 'completed');
      this.addDebugLog(task, `🔒 Mot de passe saisi:\n   ${task.password!}`);
      
      await page.waitForTimeout(this.debugMode ? 300 : Math.floor(Math.random() * 1500) + 1000);
      await this.humanScroll(page);
      await page.waitForTimeout(Math.floor(Math.random() * 800) + 500);
      
      this.updateStep(task, 'submit', 'running');

      await page.waitForTimeout(this.debugMode ? 200 : Math.floor(Math.random() * 1500) + 1500);

      const createButton = page.locator('button[data-cy="signup-create-account"], button[type="submit"], button:has-text("Create"), button:has-text("Sign up")').first();
      
      if (!(await createButton.count())) {
        const screenshot = await page.screenshot({ fullPage: true });
        task.screenshots.push(`data:image/png;base64,${screenshot.toString('base64')}`);
        throw new Error('Bouton Create Account introuvable');
      }

      await this.humanMouseMove(page, fingerprint.viewport);
      await page.waitForTimeout(this.debugMode ? 100 : Math.floor(Math.random() * 800) + 800);
      
      await page.mouse.move(
        Math.floor(Math.random() * 100) + 100,
        Math.floor(Math.random() * 100) + 100,
        { steps: 15 }
      );
      await page.waitForTimeout(Math.floor(Math.random() * 300) + 200);
      
      await createButton.click({ force: true });
      this.addDebugLog(task, '🖱️ Bouton Create Account cliqué - Analyse en cours...');

      const waitTime = this.debugMode ? 2000 : Math.floor(Math.random() * 3000) + 8000;
      this.addDebugLog(task, `⏳ Attente réponse serveur: ${waitTime}ms`);
      await page.waitForTimeout(waitTime);

      const screenshot2 = await page.screenshot({ fullPage: true });
      task.screenshots.push(`data:image/png;base64,${screenshot2.toString('base64')}`);
      
      const pageContent = await page.content();
      const currentUrl = page.url();
      
      const captchaPatterns = [
        /captcha token is invalid/i,
        /captcha.*expired/i,
        /captcha/i,
      ];

      const otherErrorPatterns = [
        { pattern: /doing it too much/i, message: 'Trop de tentatives (rate limit)' },
        { pattern: /try again/i, message: 'Réessayer demandé' },
        { pattern: /email.*already.*taken/i, message: 'Email déjà utilisé' },
        { pattern: /email.*exists/i, message: 'Email déjà existant' },
        { pattern: /invalid.*email/i, message: 'Email invalide' },
        { pattern: /password.*short/i, message: 'Mot de passe trop court' },
      ];

      let captchaDetected = false;
      for (const pattern of captchaPatterns) {
        if (pattern.test(pageContent)) {
          captchaDetected = true;
          break;
        }
      }

      if (captchaDetected && this.captchaSolver) {
        this.addLog(task, '🤖 reCAPTCHA détecté - tentative de résolution automatique...');
        
        const token = await this.solveCaptcha(page, task);
        if (token) {
          await this.injectCaptchaSolution(page, token, task);
          
          await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000);
          
          const createButton = page.locator('button[data-cy="signup-create-account"], button[type="submit"], button:has-text("Create"), button:has-text("Sign up")').first();
          if (await createButton.count()) {
            await createButton.click({ force: true });
            this.addDebugLog(task, '🔄 Nouvelle soumission avec token 2Captcha...');
            
            const retryWait = Math.floor(Math.random() * 3000) + 5000;
            await page.waitForTimeout(retryWait);
            
            const newUrl = page.url();
            if (!newUrl.includes('/signup') && newUrl.includes('replit.com')) {
              this.updateStep(task, 'submit', 'completed');
              this.addDebugLog(task, '✅ Succès avec 2Captcha!');
              this.updateStep(task, 'redirect', 'completed');
              
              const cookies = await context.cookies();
              await this.saveCookies(context, task.id);
              await this.verifyEmail(task, page, browser, context, cookies);
              return true;
            }
          }
        }
        
        this.addLog(task, '❌ Échec résolution CAPTCHA - retry nécessaire');
        this.addDebugLog(task, '⚠️ Fermeture du contexte empoisonné...');
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        return false;
      } else if (captchaDetected && !this.captchaSolver) {
        this.addLog(task, '❌ reCAPTCHA détecté - Configurez CAPTCHA_API_KEY pour résolution auto');
        this.addDebugLog(task, '⚠️ Fermeture du contexte empoisonné...');
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        return false;
      }

      let otherErrorDetected = false;
      for (const { pattern, message } of otherErrorPatterns) {
        if (pattern.test(pageContent)) {
          otherErrorDetected = true;
          task.errorMessages.push(message);
          this.updateStep(task, 'submit', 'failed');
          this.addLog(task, `❌ ${message}`);
        }
      }

      if (otherErrorDetected) {
        this.addDebugLog(task, '⚠️ Fermeture du contexte empoisonné avant retry...');
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        return false;
      }

      if (!currentUrl.includes('/signup') && currentUrl.includes('replit.com')) {
        this.updateStep(task, 'submit', 'completed');
        this.addDebugLog(task, '✅ Soumission réussie');
        this.updateStep(task, 'redirect', 'completed');
        this.addDebugLog(task, `✅ Redirigé vers: ${currentUrl}`);

        const cookies = await context.cookies();
        await this.verifyEmail(task, page, browser, context, cookies);
        
        return true;
      } else {
        this.addDebugLog(task, `⚠️ Toujours sur la page signup - détection probable`);
        
        const errorElements = await page.locator('[role="alert"], .error, .alert-error, [class*="error"]').all();
        if (errorElements.length > 0) {
          for (const el of errorElements) {
            const text = await el.textContent();
            if (text && text.trim()) {
              this.addLog(task, `🚨 ${text.trim()}`);
              task.errorMessages.push(text.trim());
            }
          }
        }
        
        this.updateStep(task, 'submit', 'failed');
        this.addDebugLog(task, '⚠️ Nettoyage du contexte empoisonné...');
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        return false;
      }

    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      task.errorMessages.push(errorMessage);
      this.updateStep(task, 'submit', 'failed');
      this.addLog(task, `❌ ${errorMessage}`);

      this.addDebugLog(task, '⚠️ Erreur - nettoyage complet du navigateur...');
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      
      return false;
    }
  }

  private async verifyEmail(task: AutomationTask, page: Page, browser: Browser, context: BrowserContext, cookies: any[]): Promise<void> {
    try {
      this.updateStep(task, 'email_verify', 'running');
      this.addDebugLog(task, '📧 Récupération de l\'email de confirmation...');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      let verificationLink: string | null = null;
      let attempts = 0;
      const maxAttempts = 10;

      while (!verificationLink && attempts < maxAttempts) {
        const messages = await emailService.getMessages(task.email);
        
        for (const msg of messages) {
          if (msg.fromAddress.includes('replit')) {
            const messageDetails = await emailService.getMessageDetails(msg.id);
            if (!messageDetails) continue;
            
            const content = messageDetails.htmlContent || messageDetails.textContent || '';
            
            const linkMatch = content.match(/https:\/\/replit\.com\/verify[^\s"<>]*/);
            if (linkMatch) {
              verificationLink = linkMatch[0];
              break;
            }
          }
        }
        
        if (!verificationLink) {
          attempts++;
          this.addDebugLog(task, `⏳ Attente email... (${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      if (!verificationLink) {
        this.updateStep(task, 'email_verify', 'failed');
        this.addLog(task, '❌ Email de confirmation non reçu');
        await this.saveAccountToDatabase(task, cookies, false);
        await context.close();
        await browser.close();
        return;
      }

      this.addDebugLog(task, '🔗 Lien trouvé, validation en cours...');
      
      await page.goto(verificationLink, { waitUntil: 'networkidle', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      this.updateStep(task, 'email_verify', 'completed');
      this.addDebugLog(task, '✅ Email validé avec succès!');

      const finalCookies = await context.cookies();
      await this.saveAccountToDatabase(task, finalCookies, true);

      await context.close();
      await browser.close();
      
    } catch (error: any) {
      this.updateStep(task, 'email_verify', 'failed');
      this.addLog(task, `❌ Erreur validation: ${error.message}`);
      await this.saveAccountToDatabase(task, cookies, false);
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }

  private async saveAccountToDatabase(task: AutomationTask, cookies: any[], verified: boolean): Promise<void> {
    try {
      this.addDebugLog(task, '💾 Sauvegarde en base de données...');

      const { data: accountData, error: accountError } = await supabase
        .from('replit_accounts')
        .insert({
          email: task.email,
          password: task.password!,
          verified,
          verified_at: verified ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (accountError) {
        throw new Error(`DB Error: ${accountError.message}`);
      }

      if (cookies && cookies.length > 0) {
        const cookieRecords = cookies.map(cookie => ({
          account_id: accountData.id,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires ? Math.floor(cookie.expires) : null,
          http_only: cookie.httpOnly || false,
          secure: cookie.secure || false,
          same_site: cookie.sameSite || null,
        }));

        const { error: cookiesError } = await supabase
          .from('cookies')
          .insert(cookieRecords);

        if (cookiesError) {
          console.error('❌ [DB] Failed to save cookies:', cookiesError);
        } else {
          this.addDebugLog(task, `✅ ${cookies.length} cookies sauvegardés`);
        }
      }

      this.addDebugLog(task, '✅ Compte sauvegardé en base de données');
      
    } catch (error: any) {
      console.error('❌ [DB] Failed to save account:', error);
      this.addLog(task, `⚠️ Erreur DB: ${error.message}`);
    }
  }

  getTask(taskId: string): AutomationTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): AutomationTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getActiveWorkers(): number {
    return this.workerPool.getActiveCount();
  }
}

export const accountAutomationService = new AccountAutomationService();
