import { Router, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { ipfsService } from "../ipfs/IPFSService.js";
import logger from "../utils/logger.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max policy document
  fileFilter: (_req, file, cb) => {
    // Accept PDF and plain text only
    const allowed = ["application/pdf", "text/plain", "text/markdown"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const PinQuerySchema = z.object({
  policyId: z.string().min(1),
});

const CidParamSchema = z.object({
  cid: z.string().min(1),
});

/**
 * POST /api/v1/ipfs/pin
 * Upload and pin a policy document. Returns its IPFS CID.
 * Body: multipart/form-data with fields: file (binary), policyId (string)
 */
router.post("/pin", upload.single("file"), async (req: Request, res: Response) => {
  const parsed = PinQuerySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "policyId is required" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "file is required (PDF or text, max 10 MB)" });
  }

  try {
    const filename = `${parsed.data.policyId}-${Date.now()}.${
      req.file.mimetype === "application/pdf" ? "pdf" : "txt"
    }`;
    const cid = await ipfsService.pinDocument(req.file.buffer, filename);
    logger.info({ policyId: parsed.data.policyId, cid }, "Policy document pinned");
    return res.status(201).json({ cid, policyId: parsed.data.policyId });
  } catch (err) {
    logger.error({ err }, "IPFS pin failed");
    return res.status(500).json({ error: "Failed to pin document" });
  }
});

/**
 * GET /api/v1/ipfs/:cid
 * Retrieve a document by CID. Streams it back with the correct content-type.
 */
router.get("/:cid", async (req: Request, res: Response) => {
  const parsed = CidParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid CID" });
  }

  try {
    const content = await ipfsService.getDocument(parsed.data.cid);
    // Sniff PDF magic bytes
    const isPdf = content[0] === 0x25 && content[1] === 0x50; // %P
    res.set("Content-Type", isPdf ? "application/pdf" : "text/plain; charset=utf-8");
    res.set("Cache-Control", "public, max-age=31536000, immutable"); // CID is content-addressed
    return res.send(Buffer.from(content));
  } catch (err) {
    logger.error({ err, cid: parsed.data.cid }, "IPFS fetch failed");
    return res.status(404).json({ error: "Document not found" });
  }
});

/**
 * GET /api/v1/ipfs/:cid/verify?content=<hex>
 * Verify that a CID matches the provided content (integrity check).
 */
router.get("/:cid/verify", async (req: Request, res: Response) => {
  const cidParsed = CidParamSchema.safeParse(req.params);
  const hexContent = req.query["content"];
  if (!cidParsed.success || typeof hexContent !== "string") {
    return res.status(400).json({ error: "cid param and content query are required" });
  }

  try {
    const content = Buffer.from(hexContent, "hex");
    const valid = await ipfsService.verifyDocument(cidParsed.data.cid, content);
    return res.json({ cid: cidParsed.data.cid, valid });
  } catch {
    return res.status(400).json({ error: "Verification failed" });
  }
});

export default router;
