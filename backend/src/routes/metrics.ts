import { Router, Request, Response } from "express";
import { register } from "../metrics/MetricsService.js";

const router = Router();

/**
 * GET /metrics
 * Prometheus scrape endpoint. Should be restricted to internal/monitoring
 * networks in production (e.g. via nginx allow/deny or a separate port).
 */
router.get("/", async (_req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

export default router;
