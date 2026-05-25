import { Router, Request, Response } from "express";
import { z } from "zod";
import { getAdapter, listAdapters } from "../identity/IdentityAdapterRegistry.js";
import logger from "../utils/logger.js";

const router = Router();

const VerifyBody = z.object({
  adapter:     z.string().min(1).max(32),
  token:       z.string().min(1).max(16_384), // JWT or JSON blob
  extraParams: z.record(z.string()).optional(),
});

/**
 * POST /api/v1/identity/verify
 *
 * Body: { adapter: "eidas" | "govuk" | "mock", token: "<id_token>", extraParams?: {} }
 *
 * Returns: { commitment: "0x…", countryCode: "GB" }
 *
 * The commitment is suitable for direct submission to VoterRegistry.register().
 * No PII is stored or returned.
 */
router.post("/verify", async (req: Request, res: Response) => {
  const parsed = VerifyBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { adapter: adapterName, token, extraParams } = parsed.data;

  try {
    const adapter = getAdapter(adapterName);
    const result  = await adapter.verify(token, extraParams);

    logger.info(
      { adapter: adapterName, country: result.countryCode },
      "Identity verified — commitment derived"
    );

    return res.json({
      commitment:  result.commitment,
      countryCode: result.countryCode,
    });
  } catch (err: any) {
    logger.warn({ adapter: adapterName, err: err.message }, "Identity verification failed");
    return res.status(401).json({ error: err.message });
  }
});

/**
 * GET /api/v1/identity/adapters
 * Returns the list of available identity adapters for this deployment.
 */
router.get("/adapters", (_req: Request, res: Response) => {
  res.json({ adapters: listAdapters() });
});

export default router;
