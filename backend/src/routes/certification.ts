import { Router, Request, Response } from "express";
import { z } from "zod";
import { createVerify } from "crypto";
import { certificationService } from "../services/CertificationService.js";
import { multiPinService } from "../ipfs/MultiPinService.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { BlockchainService } from "../services/BlockchainService.js";
import logger from "../utils/logger.js";

const router = Router();

const CertifyBody = z.object({
  policyTitle: z.string().min(1).max(200),
  countryCode: z.string().length(2),
  txHash:      z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  merkleRoot:  z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

/**
 * POST /api/v1/certification/:pollId
 * Generate and pin a signed election result certificate.
 * Returns { cid, signature, issuedAt, ipfsUrl }
 */
router.post("/:pollId", requireAdmin, async (req: Request, res: Response) => {
  const parsed = CertifyBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { pollId }  = req.params;
  const { policyTitle, countryCode, txHash, merkleRoot } = parsed.data;

  try {
    // The certificate's on-chain proof must be a real, successful transaction.
    const receipt = await new BlockchainService().getReceipt(txHash);
    if (!receipt || receipt.status !== "success") {
      return res.status(422).json({ error: "txHash is not a confirmed successful transaction" });
    }

    const result = await certificationService.certify(
      pollId, policyTitle, countryCode, txHash, merkleRoot
    );

    res.status(201).json({
      ...result,
      ipfsUrl: `https://ipfs.io/ipfs/${result.cid}`,
    });
  } catch (err: any) {
    logger.error({ pollId, err: err.message }, "Certification failed");
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/certification/:pollId/verify?cid=<cid>&signature=<hex>
 * Verify that a certificate's ECDSA signature is valid for its IPFS content.
 */
router.get("/:pollId/verify", async (req: Request, res: Response) => {
  const { cid, signature } = req.query as { cid?: string; signature?: string };
  if (!cid || !signature) {
    return res.status(400).json({ error: "cid and signature query params required" });
  }

  try {
    const pdfBytes = await multiPinService.get(cid);
    const publicKeyPem = process.env.CERT_SIGNING_KEY_PEM_PUBLIC;

    if (!publicKeyPem) {
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ valid: false, error: "Certificate verification key not configured" });
      }
      // Dev fallback — skip real verification
      return res.json({ valid: true, note: "Signature verification skipped in dev mode" });
    }

    const verify = createVerify("SHA256");
    verify.update(pdfBytes);
    const valid = verify.verify(publicKeyPem, signature, "hex");

    res.json({ valid, cid });
  } catch (err: any) {
    logger.warn({ cid, err: err.message }, "Certificate verification failed");
    res.status(400).json({ valid: false, error: err.message });
  }
});

export default router;
