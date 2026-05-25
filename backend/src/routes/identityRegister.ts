import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { getAdapter } from "../identity/IdentityAdapterRegistry.js";
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
 *   2. Derives the commitment (no PII stored)
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
    const { commitment, countryCode } = await adapter.verify(token, extraParams);

    const registry    = getRegistry();
    const countryBytes = ethers.encodeBytes32String(countryCode).slice(0, 6) as `0x${string}`;
    // bytes2 encoding: ISO code as UTF-8 hex, e.g. "GB" → 0x4742
    const countryBytes2 = ("0x" + Buffer.from(countryCode.padEnd(2).slice(0, 2)).toString("hex")) as `0x${string}`;

    // Step 2: Check if already registered (idempotent)
    const alreadyRegistered: boolean = await registry.isRegistered(commitment, countryBytes2);
    if (alreadyRegistered) {
      logger.info({ adapter: adapterName, countryCode }, "Voter already registered — idempotent");
      return res.json({ commitment, countryCode, txHash: null, alreadyRegistered: true });
    }

    // Step 3: Submit on-chain registration
    const tx      = await registry.register(commitment, countryBytes2);
    const receipt = await tx.wait();

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
