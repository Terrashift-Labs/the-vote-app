import { Router, Request, Response } from "express";
import { z } from "zod";
import { notificationService } from "../services/NotificationService.js";

const router = Router();

const RegisterSchema = z.object({
  userId:      z.string().min(1),
  token:       z.string().min(1),
  platform:    z.enum(["android", "ios"]),
  countryCode: z.string().length(2),
});

/**
 * POST /api/v1/notifications/register
 * Register or refresh a device push token.
 */
router.post("/register", (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { userId, token, platform, countryCode } = parsed.data;
  notificationService.registerToken(userId, token, platform, countryCode.toUpperCase());
  return res.status(201).json({ registered: true });
});

/**
 * DELETE /api/v1/notifications/register/:userId
 * Unregister a device token (on logout / permission revoked).
 */
router.delete("/register/:userId", (req: Request, res: Response) => {
  notificationService.unregisterToken(req.params.userId);
  return res.status(204).send();
});

export default router;
