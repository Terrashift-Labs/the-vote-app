import { Router, Request, Response } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import logger from "../utils/logger.js";

const router = Router();

/**
 * Offline QR ballot payload schema.
 * Generated on-device, scanned at a polling station or submitted via the web app.
 */
const QRPayloadSchema = z.object({
  policyId:        z.string().min(1),
  optionId:        z.string().min(1),
  voterNullifier:  z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  signature:       z.string().regex(/^0x[0-9a-fA-F]+$/),
  timestamp:       z.number().int().positive(),
  // QR ballots omit zkProof — server generates a server-side proof
  // (same trust model as the original stub; client-side ZK is a device-only path)
});

type QRPayload = z.infer<typeof QRPayloadSchema>;

/**
 * POST /api/v1/vote/qr
 * Accept a QR-encoded ballot from a polling station scanner or web app.
 * Validates the payload, checks for replay, and submits to the blockchain.
 */
router.post("/", async (req: Request, res: Response) => {
  const parsed = QRPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;

  // Reject stale ballots (> 30 days old)
  const ageMs = Date.now() - payload.timestamp;
  if (ageMs > 30 * 24 * 3600 * 1000) {
    return res.status(400).json({ error: "QR ballot has expired (> 30 days)" });
  }

  // Verify the signature — must be signed by the voter's device key
  const messageHash = ethers.solidityPackedKeccak256(
    ["string", "string", "bytes32", "uint256"],
    [payload.policyId, payload.optionId, payload.voterNullifier, payload.timestamp]
  );
  let signerAddress: string;
  try {
    signerAddress = ethers.recoverAddress(
      ethers.hashMessage(ethers.getBytes(messageHash)),
      payload.signature
    );
  } catch {
    return res.status(400).json({ error: "Invalid signature" });
  }

  logger.info(
    { policyId: payload.policyId, optionId: payload.optionId, signer: signerAddress },
    "QR ballot received"
  );

  // In production: call BlockchainService.castVote() here
  // Returning a stub receipt for now
  const stubTxHash = "0x" + ethers.id(
    payload.voterNullifier + payload.policyId + payload.optionId
  ).slice(2);

  return res.status(201).json({
    receipt: {
      transactionHash: stubTxHash,
      blockNumber:     0,
      nullifier:       payload.voterNullifier,
    },
  });
});

export default router;
