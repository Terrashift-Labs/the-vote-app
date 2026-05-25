import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

/**
 * Log every request — but NEVER log request bodies (they may contain vote content).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    logger.info({
      method:  req.method,
      path:    req.path,
      status:  res.statusCode,
      ms:      Date.now() - start,
      // Intentionally omitting: req.body, req.query (may contain nullifiers)
    });
  });
  next();
}
