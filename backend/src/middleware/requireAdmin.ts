import { Request, Response, NextFunction } from "express";
import { timingSafeEqual, createHash } from "crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Bearer-token guard for admin endpoints. Fails closed: if ADMIN_API_TOKEN
 * is not configured, every request is rejected.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) {
    return res.status(503).json({ error: "Admin API not configured" });
  }
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !timingSafeEqual(digest(token), digest(expected))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
