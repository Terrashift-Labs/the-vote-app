import { Router, Request, Response } from "express";
import { z } from "zod";
import { fido2Service } from "../auth/FIDO2Service.js";
import logger from "../utils/logger.js";

const router = Router();

const UserIdSchema = z.object({ userId: z.string().min(1) });

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/fido2/register/options
 * Returns a WebAuthn registration challenge for the given user.
 */
router.post("/register/options", async (req: Request, res: Response) => {
  const parsed = UserIdSchema.extend({ displayName: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "userId and displayName are required" });
  }
  try {
    const options = await fido2Service.generateRegistrationOptions(
      parsed.data.userId,
      parsed.data.displayName
    );
    return res.json(options);
  } catch (err) {
    logger.error({ err }, "FIDO2 register options failed");
    return res.status(500).json({ error: "Failed to generate registration options" });
  }
});

/**
 * POST /api/v1/fido2/register/verify
 * Verify a WebAuthn registration response and store the credential.
 */
router.post("/register/verify", async (req: Request, res: Response) => {
  const parsed = UserIdSchema.extend({ response: z.record(z.unknown()) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "userId and response are required" });
  }
  try {
    const result = await fido2Service.verifyRegistration(
      parsed.data.userId,
      parsed.data.response as any
    );
    return res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, "FIDO2 register verify failed");
    return res.status(400).json({ error: (err as Error).message });
  }
});

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/fido2/authenticate/options
 * Returns a WebAuthn authentication challenge for the given user.
 */
router.post("/authenticate/options", async (req: Request, res: Response) => {
  const parsed = UserIdSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "userId is required" });
  }
  try {
    const options = await fido2Service.generateAuthenticationOptions(parsed.data.userId);
    return res.json(options);
  } catch (err) {
    logger.error({ err }, "FIDO2 auth options failed");
    return res.status(500).json({ error: "Failed to generate authentication options" });
  }
});

/**
 * POST /api/v1/fido2/authenticate/verify
 * Verify a WebAuthn authentication response.
 * Returns { verified: true } on success — caller issues their own session token.
 */
router.post("/authenticate/verify", async (req: Request, res: Response) => {
  const parsed = UserIdSchema.extend({ response: z.record(z.unknown()) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "userId and response are required" });
  }
  try {
    await fido2Service.verifyAuthentication(parsed.data.userId, parsed.data.response as any);
    return res.json({ verified: true });
  } catch (err) {
    logger.error({ err }, "FIDO2 auth verify failed");
    return res.status(401).json({ error: (err as Error).message });
  }
});

export default router;
