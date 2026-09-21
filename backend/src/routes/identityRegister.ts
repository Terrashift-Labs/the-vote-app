import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { getAdapter } from "../identity/IdentityAdapterRegistry.js";
import { usedIdentifierStore } from "../repositories/UsedIdentifierStore.js";
import logger from "../utils/logger.js";

const router = Router();

const VOTER_REGISTRY_ABI = [
  "function register(bytes32 commitment, bytes2 countryCode) external",
  "function isRegistered(bytes32 commitment, bytes2 countryCode) external view returns (bool)",
];

function getRegistry() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL ?? "http://localhost:8545");
  const wallet   = new ethers.Wallet(process.env.RELAY_PRIVATE_KEY ?? "", provider);
  return new ethers.Contract(
    process.env.VOTER_REGISTRY_ADDRESS ?? ethers.ZeroAddress,
    VOTER_REGISTRY_ABI,
    wallet
  );
}

const RegisterBody = z.object({
  adapter:     z.string().min(1).max(32),
  token:       z.string().min(1).max(16_384),
  extraParams: z.record(z.string()).optional(),
});

/**
 * POST /api/v1/identity/register
 *
 * Self-service voter registration:
 *   1. Verifies identity token via the named adapter
 *   2. Obtains the commitment (client-supplied for zkpassport; no PII stored)
 *      and rejects documents that have already registered
 *   3. Checks if already registered (idempotent)
 *   4. Submits VoterRegistry.register(commitment, countryCode) on-chain
 *
 * Returns: { commitment, countryCode, txHash, alreadyRegistered }
 */
router.post("/register", async (req: Request, res: Response) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { adapter: adapterName, token, extraParams } = parsed.data;

  try {
    // Step 1: Verify identity
    const adapter = getAdapter(adapterName);
    const { commitment, countryCode, sybilKey } = await adapter.verify(token, extraParams);

    const registry    = getRegistry();
    // bytes2 encoding: ISO code as UTF-8 hex, e.g. "GB" → 0x4742
    const countryBytes2 = ("0x" + Buffer.from(countryCode.padEnd(2).slice(0, 2)).toString("hex")) as `0x${string}`;

    // Step 2a: Reject a document that already registered with a different commitment.
    // Same commitment = retry, which falls through to the idempotent check below.
    let claimed = false;
    if (sybilKey) {
      const claim = await usedIdentifierStore.claim(sybilKey, commitment);
      if (!claim.claimed && claim.existing !== commitment) {
        logger.warn({ adapter: adapterName, countryCode }, "Duplicate registration rejected");
        return res.status(409).json({ error: "This identity has already registered" });
      }
      claimed = claim.claimed;
    }

    // Step 2b: Check if already registered (idempotent)
    const alreadyRegistered: boolean = await registry.isRegistered(commitment, countryBytes2);
    if (alreadyRegistered) {
      logger.info({ adapter: adapterName, countryCode }, "Voter already registered — idempotent");
      return res.json({ commitment, countryCode, txHash: null, alreadyRegistered: true });
    }

    // Step 3: Submit on-chain registration
    let receipt;
    try {
      const tx = await registry.register(commitment, countryBytes2);
      receipt  = await tx.wait();
    } catch (txErr) {
      // Let the citizen retry if the chain rejected us.
      if (sybilKey && claimed) await usedIdentifierStore.release(sybilKey, commitment);
      throw txErr;
    }

    logger.info(
      { adapter: adapterName, countryCode, txHash: receipt.hash },
      "Voter registered on-chain"
    );

    return res.status(201).json({
      commitment,
      countryCode,
      txHash:            receipt.hash,
      alreadyRegistered: false,
    });
  } catch (err: any) {
    logger.warn({ adapter: adapterName, err: err.message }, "Voter registration failed");
    return res.status(400).json({ error: err.message });
  }
});

export default router;
