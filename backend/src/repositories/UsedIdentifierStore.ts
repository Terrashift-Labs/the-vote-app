import { getRedis } from "../redis/RedisClient.js";

/**
 * Records which document identifiers have already registered, so the same
 * ID cannot register twice. Stores identifier → commitment only — no PII.
 *
 * Production must back Redis with persistence (AOF/RDB): losing this set
 * lets already-registered documents register again.
 */
export type ClaimResult = { claimed: true } | { claimed: false; existing: string };

export interface UsedIdentifierStore {
  /**
   * Atomically claim `key` for `commitment`.
   * Returns `{ claimed: true }` if newly claimed, otherwise the commitment
   * that already holds it (so a retry with the same commitment is idempotent).
   */
  claim(key: string, commitment: string): Promise<ClaimResult>;
  /** Give a claim back, e.g. when the on-chain registration failed. */
  release(key: string, commitment: string): Promise<void>;
}

export class RedisUsedIdentifierStore implements UsedIdentifierStore {
  private k(key: string) { return `zkp:uid:${key}`; }

  async claim(key: string, commitment: string): Promise<ClaimResult> {
    const redis = getRedis();
    const ok = await redis.set(this.k(key), commitment, "NX");
    if (ok === "OK") return { claimed: true as const };
    const existing = await redis.get(this.k(key));
    // Key vanished between SET and GET — treat as unclaimed by retrying once.
    if (existing === null) return this.claim(key, commitment);
    return { claimed: false as const, existing };
  }

  async release(key: string, commitment: string) {
    const redis = getRedis();
    // Only delete our own claim.
    await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0`,
      1, this.k(key), commitment,
    );
  }
}

export class InMemoryUsedIdentifierStore implements UsedIdentifierStore {
  private readonly map = new Map<string, string>();

  async claim(key: string, commitment: string) {
    const existing = this.map.get(key);
    if (existing !== undefined) return { claimed: false as const, existing };
    this.map.set(key, commitment);
    return { claimed: true as const };
  }

  async release(key: string, commitment: string) {
    if (this.map.get(key) === commitment) this.map.delete(key);
  }
}

export const usedIdentifierStore: UsedIdentifierStore = new RedisUsedIdentifierStore();
