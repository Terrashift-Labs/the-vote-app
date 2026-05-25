import { Router, Request, Response } from "express";
import twilio from "twilio";
import { smsVoteService } from "../sms/SMSVoteService.js";
import logger from "../utils/logger.js";

const router = Router();

/**
 * POST /api/v1/sms/inbound
 * Twilio webhook for inbound SMS messages.
 *
 * Twilio signs every request with X-Twilio-Signature.
 * The validateRequest middleware verifies this signature before processing.
 */
router.post(
  "/inbound",
  twilioSignatureMiddleware(),
  async (req: Request, res: Response) => {
    const from: string = req.body?.From ?? "";
    const body: string = req.body?.Body ?? "";

    if (!from || !body) {
      return res.status(400).send("<Response></Response>");
    }

    logger.info({ from: maskPhone(from) }, "Inbound SMS received");

    try {
      const reply = await smsVoteService.handleInbound(from, body);
      // Respond with TwiML — Twilio sends this as an SMS reply
      return res.type("text/xml").send(
        `<Response><Message>${escapeXML(reply)}</Message></Response>`
      );
    } catch (err) {
      logger.error({ err }, "SMS handling error");
      return res.type("text/xml").send(
        `<Response><Message>An error occurred. Please try again.</Message></Response>`
      );
    }
  }
);

// MARK: - Helpers

function twilioSignatureMiddleware() {
  return (req: Request, res: Response, next: () => void) => {
    const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
    const url = `${process.env.ORIGIN}/api/v1/sms/inbound`;
    const signature = req.headers["x-twilio-signature"] as string ?? "";

    if (process.env.NODE_ENV !== "test" &&
        !twilio.validateRequest(authToken, signature, url, req.body)) {
      logger.warn("Invalid Twilio signature on SMS webhook");
      return res.status(403).send("Forbidden");
    }
    next();
  };
}

/** Mask all but the last 4 digits of a phone number for logs */
function maskPhone(phone: string): string {
  return phone.length > 4 ? "*".repeat(phone.length - 4) + phone.slice(-4) : "****";
}

function escapeXML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default router;
