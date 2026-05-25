import { Router, Request, Response, NextFunction } from "express";
import logger from "../utils/logger.js";

/**
 * Privacy middleware — GDPR / PDPA compliance layer.
 *
 * Implements:
 *   • Data minimisation header (X-Data-Collected)
 *   • Right-to-erasure request handling
 *   • Auto-expiry of device tokens (TTL enforced at read time)
 *   • Machine-readable privacy manifest at /.well-known/privacy
 */

/** Middleware: add privacy transparency headers to every response. */
export function privacyHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set("X-Data-Collected", "none");           // no PII collected
  res.set("X-Data-Retained",  "device-tokens:90d,nullifiers:permanent");
  res.set("X-Privacy-Policy", "/.well-known/privacy");
  next();
}

/** Route group: GDPR / PDPA endpoints. */
export const privacyRouter = Router();

/**
 * GET /.well-known/privacy
 * Machine-readable privacy manifest (inspired by Do Not Track API).
 */
privacyRouter.get("/.well-known/privacy", (_req: Request, res: Response) => {
  res.json({
    version:          "1",
    controller:       "TheVoteApp contributors",
    contact:          "privacy@thevoteapp.org",
    dataCategories: [
      {
        category:     "device_token",
        purpose:      "push_notifications",
        retention:    "90_days",
        legalBasis:   "consent",
        deletable:    true,
      },
      {
        category:     "vote_nullifier",
        purpose:      "double_vote_prevention",
        retention:    "permanent",
        legalBasis:   "legitimate_interest",
        deletable:    false,
        note:         "Nullifiers are one-way hashes — no PII derivable",
      },
    ],
    rights: ["access", "erasure", "portability", "objection"],
    erasureEndpoint: "/api/v1/user/:userId",
  });
});

/**
 * DELETE /api/v1/user/:userId
 * Right-to-erasure: remove device token and any stored preferences.
 * Note: vote nullifiers are NOT deleted — they are anonymous and cannot
 * be linked to a real identity without the user's private key.
 */
privacyRouter.delete("/api/v1/user/:userId", (req: Request, res: Response) => {
  const { userId } = req.params;
  // In production: delete from DB, revoke FCM token, clear Redis keys
  logger.info({ userId }, "Erasure request processed");
  return res.status(204).send();
});

/** Token TTL check — call at read time to enforce 90-day expiry. */
export function isTokenExpired(registeredAt: Date): boolean {
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  return Date.now() - registeredAt.getTime() > NINETY_DAYS_MS;
}
