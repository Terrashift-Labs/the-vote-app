import type { Request, Response, NextFunction } from "express";
import { httpRequestDuration } from "../metrics/MetricsService.js";

/**
 * Express middleware that records HTTP request duration into the
 * thevoteapp_http_request_duration_ms Prometheus histogram.
 *
 * The `route` label uses `req.route?.path` (set after routing) so metrics
 * are grouped by path template (e.g. /api/v1/vote/:policyId) rather than
 * per-request URLs with concrete IDs.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const route = req.route?.path ?? req.path ?? "unknown";
    httpRequestDuration
      .labels(req.method, route, String(res.statusCode))
      .observe(Date.now() - start);
  });
  next();
}
