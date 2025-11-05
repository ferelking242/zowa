interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class CacheService {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttlMs: number = 10000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
    
    console.log(`💾 [CACHE] Stored key: ${key} (TTL: ${ttlMs}ms)`);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      console.log(`❌ [CACHE] Miss for key: ${key}`);
      return null;
    }

    const age = Date.now() - entry.timestamp;
    
    if (age > entry.ttl) {
      console.log(`⏰ [CACHE] Expired key: ${key} (age: ${age}ms, TTL: ${entry.ttl}ms)`);
      this.cache.delete(key);
      return null;
    }

    console.log(`✅ [CACHE] Hit for key: ${key} (age: ${age}ms)`);
    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  invalidate(key: string): void {
    console.log(`🗑️ [CACHE] Invalidated key: ${key}`);
    this.cache.delete(key);
  }

  invalidatePattern(pattern: string): void {
    const keysToDelete: string[] = [];
    const allKeys = Array.from(this.cache.keys());
    
    for (const key of allKeys) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`🗑️ [CACHE] Invalidated ${keysToDelete.length} keys matching pattern: ${pattern}`);
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🧹 [CACHE] Cleared all ${size} entries`);
  }

  getStats() {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    const valid = entries.filter(([_, entry]) => (now - entry.timestamp) <= entry.ttl);
    const expired = entries.length - valid.length;
    
    return {
      total: entries.length,
      valid: valid.length,
      expired,
    };
  }
}

export const cacheService = new CacheService();
