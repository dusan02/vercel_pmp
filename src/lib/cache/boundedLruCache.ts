/**
 * Bounded in-memory TTL + LRU cache with single-flight in-flight deduplication
 * for secondary SSR data loaders (bypassed under NODE_ENV === 'test').
 */
export class BoundedTtlLruCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly maxEntries: number = 500,
    private readonly ttlMs: number = 5 * 60 * 1000,
  ) {}

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    if (process.env.NODE_ENV === 'test') {
      return loader();
    }

    const now = Date.now();
    const cached = this.store.get(key);
    if (cached) {
      if (now <= cached.expiresAt) {
        // Refresh LRU recency
        this.store.delete(key);
        this.store.set(key, cached);
        return cached.value;
      }
      this.store.delete(key);
    }

    const active = this.inflight.get(key);
    if (active) {
      return active;
    }

    const pending = loader()
      .then((value) => {
        if (this.store.has(key)) {
          this.store.delete(key);
        } else if (this.store.size >= this.maxEntries) {
          const oldest = this.store.keys().next().value;
          if (oldest !== undefined) this.store.delete(oldest);
        }
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, pending);
    return pending;
  }
}
