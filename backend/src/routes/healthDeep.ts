import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { ipfsService } from "../ipfs/IPFSService.js";
import { getRedis } from "../redis/RedisClient.js";
import logger from "../utils/logger.js";

const router = Router();

/**
 * GET /api/v1/health/deep
 * Deep readiness check — verifies blockchain RPC and IPFS connectivity.
 * Used by load balancers, DR scripts, and monitoring dashboards.
 */
router.get("/", async (_req: Request, res: Response) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // Blockchain RPC
  const rpcStart = Date.now();
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL ?? "http://localhost:8545");
    await provider.getBlockNumber();
    checks.blockchain = { ok: true, latencyMs: Date.now() - rpcStart };
  } catch (err: any) {
    checks.blockchain = { ok: false, error: err.message };
  }

  // IPFS
  const ipfsStart = Date.now();
  try {
    const testData = new TextEncoder().encode(`health-check-${Date.now()}`);
    const cid = await ipfsService.pinDocument(testData, "health-check.txt");
    await ipfsService.getDocument(cid);
    checks.ipfs = { ok: true, latencyMs: Date.now() - ipfsStart };
  } catch (err: any) {
    checks.ipfs = { ok: false, error: err.message };
  }

  // Redis
  const redisStart = Date.now();
  try {
    const pong = await getRedis().ping();
    checks.redis = { ok: pong === "PONG", latencyMs: Date.now() - redisStart };
  } catch (err: any) {
    checks.redis = { ok: false, error: err.message };
  }

  // Memory
  const mem = process.memoryUsage();
  checks.memory = {
    ok: mem.heapUsed < 500 * 1024 * 1024,
    latencyMs: Math.round(mem.heapUsed / 1024 / 1024),
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  if (!allOk) logger.warn({ checks }, "Deep health check failed");

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;
