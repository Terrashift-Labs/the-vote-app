import type { Request, Response, NextFunction } from "express";
import { getRedis } from "../redis/RedisClient.js";
import logger from "../utils/logger.js";

/**
 * Redis-backed sliding-window rate limiter.
 *
 * Uses a sorted set per client key:
 *   Key:    `rl:{namespace}:{clientKey}`
 *   Member: unique request ID (timestamp-based)
 *   Score:  unix timestamp (ms) of the request
 *
 * On each request:
 *   1. Remove all members with score < now - windowMs  (slide the window)
 *   2. Count remaining members
 *   3. If count >= limit → reject with 429
 *   4. Otherwise → add new member with score=now; set key TTL to windowMs
 *
 * This approach is O(log N) per request and handles distributed backends
 * correctly because Redis is the single source of truth.
 */

export interface RateLimitOptions {
  /** Namespace — used to scope different limiters (e.g. "vote", "audit") */
  namespace: string;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Max requests allowed within the window */
  limit: number;
  /** Function that extracts the client identity from the request */
  keyFn?: (req: Request) => string;
  /** Per-country override map: countryCode → limit */
  countryOverrides?: Record<string, number>;
  /** Header from which to read country code (default: x-country-code) */
  countryHeader?: string;
}

export function redisRateLimit(opts: RateLimitOptions) {
  const {
    namespace,
    windowMs,
    limit,
    keyFn = defaultKey,
    countryOverrides = {},
    countryHeader = "x-country-code",
  } = opts;

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const clientKey  = keyFn(req);
    const country    = (req.headers[countryHeader] as string ?? "").toUpperCase();
    const effectiveLimit = countryOverrides[country] ?? limit;
    const redisKey   = `rl:${namespace}:${clientKey}`;
    const now        = Date.now();
    const windowStart = now - windowMs;
    const member     = `${now}-${Math.random().toString(36).slice(2)}`; // unique ID

    try {
      const redis = getRedis();

      // Atomic sliding window via pipeline
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(redisKey, "-inf", windowStart);  // evict old
      pipeline.zcard(redisKey);                                   // count current
      pipeline.zadd(redisKey, now, member);                       // record this request
      pipeline.pexpire(redisKey, windowMs);                       // auto-expire key

      const results = await pipeline.exec();
      const count   = (results?.[1]?.[1] as number) ?? 0;        // count before adding

      const remaining = Math.max(0, effectiveLimit - count - 1);
      const resetMs   = Math.ceil(windowMs / 1000);

      res.setHeader("X-RateLimit-Limit",     effectiveLimit);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset",     resetMs);

      if (count >= effectiveLimit) {
        logger.warn({ namespace, clientKey, country, count, effectiveLimit }, "Rate limit exceeded");
        res.status(429).json({
          error: "Too many requests — please wait before trying again.",
          retryAfterSeconds: resetMs,
        });
        return;
      }

      next();
    } catch (err: any) {
      // If Redis is unavailable, fail open (log and allow the request)
      logger.error({ err: err.message, namespace }, "Rate limiter Redis error — failing open");
      next();
    }
  };
}

// ── Pre-configured limiters ─────────────────────────────────────────────────

/** 5 votes per IP per country per minute (stricter for high-risk countries) */
export const voteLimiter = redisRateLimit({
  namespace: "vote",
  windowMs:  60_000,
  limit:     5,
  countryOverrides: {
    // Countries with historically high bot traffic get a tighter limit
    NG: 3,
    IN: 3,
  },
});

/** 60 read requests per IP per minute (public audit/result endpoints) */
export const auditLimiter = redisRateLimit({
  namespace: "audit",
  windowMs:  60_000,
  limit:     60,
});

/** 10 admin API requests per token per minute */
export const adminLimiter = redisRateLimit({
  namespace: "admin",
  windowMs:  60_000,
  limit:     10,
  keyFn:     adminKey,
});

/** 30 WebAuthn / FIDO2 requests per IP per minute */
export const fido2Limiter = redisRateLimit({
  namespace: "fido2",
  windowMs:  60_000,
  limit:     30,
});

// MARK: - Key extraction helpers

function defaultKey(req: Request): string {
  // Use X-Forwarded-For if behind a trusted proxy, otherwise req.ip
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  const ip = forwarded ? forwarded.split(",")[0].trim() : (req.ip ?? "unknown");
  const country = (req.headers["x-country-code"] as string ?? "XX").toUpperCase();
  return `${ip}:${country}`;
}

function adminKey(req: Request): string {
  // Key by Bearer token so limits are per-admin rather than per-IP
  const auth  = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7, 39) : defaultKey(req);
  return token;
}
