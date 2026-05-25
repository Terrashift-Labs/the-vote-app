import { Router, Request, Response } from "express";
import { z } from "zod";
import { auditLogService } from "../services/AuditLogService.js";

const router = Router();

/**
 * GET /api/v1/audit
 * List all on-chain audit entries (paginated).
 */
router.get("/", async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(req.query["page"] as string ?? "1"));
  const limit = Math.min(50, parseInt(req.query["limit"] as string ?? "20"));
  try {
    const total = Number(await (auditLogService as any).contract.entryCount());
    const start = Math.max(0, total - page * limit);
    const end   = Math.max(0, total - (page - 1) * limit);
    const ids   = Array.from({ length: end - start }, (_, i) => start + i).reverse();
    const entries = await Promise.all(
      ids.map(async (id) => {
        const raw = await (auditLogService as any).contract.getEntry(id);
        return { id, actor: raw[0], action: raw[1], cid: raw[2], timestamp: Number(raw[3]) };
      })
    );
    return res.json({ total, page, limit, entries });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/audit/:id/verify
 * Fetch and verify a specific audit entry from IPFS.
 */
router.get("/:id/verify", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const result = await auditLogService.verify(id);
    return res.json(result);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

export default router;
