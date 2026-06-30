import axios from 'axios';

export class KeepAliveService {
  private interval: NodeJS.Timeout | null = null;
  private pingUrl: string;
  private pingIntervalMs: number;
  private isEnabled: boolean;

  constructor() {
    const port = parseInt(process.env.PORT || '5000', 10);
    this.pingUrl = process.env.KEEP_ALIVE_URL || `http://localhost:${port}/api/health`;
    this.pingIntervalMs = parseInt(process.env.KEEP_ALIVE_INTERVAL || '240000', 10);
    
    const renderEnv = process.env.RENDER || process.env.IS_RENDER;
    this.isEnabled = !!renderEnv;
    
    if (this.isEnabled) {
      console.log(`🔄 [KEEP-ALIVE] Service enabled (Render detected)`);
      console.log(`🔄 [KEEP-ALIVE] Will ping ${this.pingUrl} every ${this.pingIntervalMs / 1000}s`);
    } else {
      console.log('ℹ️  [KEEP-ALIVE] Service disabled (not on Render)');
    }
  }

  start(): void {
    if (!this.isEnabled) {
      console.log('ℹ️  [KEEP-ALIVE] Skipping start (disabled)');
      return;
    }

    if (this.interval) {
      console.log('⚠️  [KEEP-ALIVE] Already running');
      return;
    }

    console.log('✅ [KEEP-ALIVE] Starting service...');
    
    this.interval = setInterval(async () => {
      try {
        const startTime = Date.now();
        const response = await axios.get(this.pingUrl, { timeout: 5000 });
        const duration = Date.now() - startTime;
        
        console.log(`💓 [KEEP-ALIVE] Ping successful (${response.status}) in ${duration}ms`);
      } catch (error: any) {
        console.error(`❌ [KEEP-ALIVE] Ping failed:`, error.message);
      }
    }, this.pingIntervalMs);

    this.ping();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('🛑 [KEEP-ALIVE] Service stopped');
    }
  }

  private async ping(): Promise<void> {
    try {
      const startTime = Date.now();
      const response = await axios.get(this.pingUrl, { timeout: 5000 });
      const duration = Date.now() - startTime;
      
      console.log(`💓 [KEEP-ALIVE] Initial ping successful (${response.status}) in ${duration}ms`);
    } catch (error: any) {
      console.error(`❌ [KEEP-ALIVE] Initial ping failed:`, error.message);
    }
  }

  getStatus(): { enabled: boolean; pingUrl: string; intervalMs: number } {
    return {
      enabled: this.isEnabled,
      pingUrl: this.pingUrl,
      intervalMs: this.pingIntervalMs,
    };
  }
}

export const keepAliveService = new KeepAliveService();
