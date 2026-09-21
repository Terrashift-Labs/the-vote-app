import { Router, Request, Response } from "express";
import { ussdVoteService } from "../ussd/USSDVoteService.js";
import logger from "../utils/logger.js";

const router = Router();

/**
 * POST /api/v1/ussd
 * Africa's Talking USSD webhook.
 *
 * AT sends POST with application/x-www-form-urlencoded:
 *   sessionId  — unique session identifier
 *   phoneNumber — caller's MSISDN (E.164)
 *   text       — all inputs so far, joined by *
 *   networkCode — MNO code
 *
 * Response must be plain text prefixed with CON (continue) or END (terminate).
 */
router.post("/", async (req: Request, res: Response) => {
  const sessionId   = req.body?.sessionId   ?? "";
  const phoneNumber = req.body?.phoneNumber ?? "";
  const text        = req.body?.text        ?? "";

  if (!sessionId || !phoneNumber) {
    return res.status(400).send("END Invalid request.");
  }

  logger.info({ sessionId, phone: maskPhone(phoneNumber) }, "USSD request");

  try {
    const result = await ussdVoteService.handle(sessionId, phoneNumber, text);
    const prefix = result.continue ? "CON " : "END ";
    return res.type("text/plain").send(prefix + result.text);
  } catch (err) {
    logger.error({ err }, "USSD handling error");
    return res.type("text/plain").send("END An error occurred. Please try again.");
  }
});

function maskPhone(phone: string): string {
  return phone.length > 4 ? "*".repeat(phone.length - 4) + phone.slice(-4) : "****";
}

export default router;
