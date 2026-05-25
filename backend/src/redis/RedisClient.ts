import Redis from "ioredis";

let _client: Redis | null = null;

/**
 * Returns the shared ioredis client, creating it on first call.
 *
 * Connection parameters come from REDIS_URL (default: redis://localhost:6379).
 * The client uses lazy connect so import side-effects don't block startup.
 */
export function getRedis(): Redis {
  if (!_client) {
    _client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    _client.on("error", (err: Error) => {
      // Avoid circular dep on Winston logger — write directly to stderr
      process.stderr.write(`[Redis] ${err.message}\n`);
    });
  }
  return _client;
}

/** Gracefully close the connection (call during process shutdown). */
export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}
