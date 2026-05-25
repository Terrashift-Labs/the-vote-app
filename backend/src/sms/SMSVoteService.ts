import twilio from "twilio";
import { createHash } from "crypto";
import { ethers } from "ethers";
import { getRedis } from "../redis/RedisClient.js";
import logger from "../utils/logger.js";

/**
 * SMSVoteService — SMS fallback voting for low-connectivity regions.
 *
 * Vote by text: send  VOTE <policyId> <SUPPORT|OPPOSE|ABSTAIN>  to the
 * inbound number. The phone number is never stored — only a one-way hash
 * (nullifier) is derived from it, preserving anonymity.
 *
 * Security properties:
 *   • Phone hash used as nullifier — one vote per number per policy
 *   • Country-code allowlist — only permitted jurisdictions can vote
 *   • Rate limiting — enforced upstream via express-rate-limit
 *   • No PII stored — phone number discarded after nullifier derivation
 *
 * Format:  VOTE POL-001 SUPPORT
 *          VERIFY <txHash>
 *          HELP
 */
export class SMSVoteService {
  private readonly client: twilio.Twilio;
  private readonly fromNumber: string;
  private readonly allowedCountryCodes: Set<string>;
  private readonly NULLIFIERS_KEY = "sms:nullifiers";

  constructor(
    accountSid: string,
    authToken: string,
    fromNumber: string,
    allowedCountryCodes: string[] = []
  ) {
    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber;
    this.allowedCountryCodes = new Set(allowedCountryCodes.map((c) => c.toUpperCase()));
  }

  /**
   * Handle an inbound SMS message from Twilio webhook.
   * Returns the reply text to send back.
   */
  async handleInbound(from: string, body: string): Promise<string> {
    const countryCode = this.extractCountryCode(from);

    if (this.allowedCountryCodes.size > 0 && !this.allowedCountryCodes.has(countryCode)) {
      return "Voting via SMS is not available in your region.";
    }

    const text = body.trim().toUpperCase();
    const parts = text.split(/\s+/);
    const command = parts[0];

    if (command === "HELP") {
      return this.helpText();
    }

    if (command === "VERIFY" && parts[1]) {
      return this.handleVerify(parts[1]);
    }

    if (command === "VOTE" && parts.length >= 3) {
      const policyId = parts[1];
      const optionRaw = parts[2];
      return this.handleVote(from, policyId, optionRaw);
    }

    return `Unrecognised command. Text HELP for instructions.`;
  }

  /**
   * Reply with the transaction hash for an SMS vote.
   */
  async sendReply(to: string, message: string): Promise<void> {
    await this.client.messages.create({ from: this.fromNumber, to, body: message });
  }

  // MARK: - Private

  private async handleVote(from: string, policyId: string, optionRaw: string): Promise<string> {
    const optionMap: Record<string, string> = {
      SUPPORT: "option-support",
      OPPOSE:  "option-oppose",
      ABSTAIN: "option-abstain",
    };
    const optionId = optionMap[optionRaw];
    if (!optionId) {
      return `Unknown option "${optionRaw}". Use SUPPORT, OPPOSE, or ABSTAIN.`;
    }

    // Derive nullifier from phone + policy — phone number never stored
    const nullifier = this.deriveNullifier(from, policyId);
    const redis = getRedis();

    const alreadyVoted = await redis.sismember(this.NULLIFIERS_KEY, nullifier);
    if (alreadyVoted) {
      return `You have already voted on ${policyId}. Each number may vote once.`;
    }

    try {
      const txHash = await this.submitToChain(nullifier, policyId, optionId);
      await redis.sadd(this.NULLIFIERS_KEY, nullifier);
      logger.info({ policyId, optionId, nullifier }, "SMS vote submitted");
      return `Vote recorded! TX: ${txHash.slice(0, 18)}... Reply VERIFY ${txHash} to confirm.`;
    } catch (err) {
      logger.error({ err, policyId }, "SMS vote submission failed");
      return `Vote submission failed. Please try again or visit the app.`;
    }
  }

  private handleVerify(txHash: string): string {
    // In production: query the blockchain for the transaction receipt
    return `Checking TX ${txHash.slice(0, 12)}... Visit the app for full verification details.`;
  }

  /** SHA-256(phone || policyId || salt) — one-way, never reversible */
  private deriveNullifier(phone: string, policyId: string): string {
    const salt = process.env.SMS_NULLIFIER_SALT ?? "default-salt-replace-in-prod";
    return "0x" + createHash("sha256")
      .update(phone + policyId + salt)
      .digest("hex");
  }

  private extractCountryCode(e164: string): string {
    // Very simplified — in production use libphonenumber
    if (e164.startsWith("+44")) return "GB";
    if (e164.startsWith("+1"))  return "US";
    if (e164.startsWith("+91")) return "IN";
    if (e164.startsWith("+234")) return "NG";
    if (e164.startsWith("+254")) return "KE";
    if (e164.startsWith("+27")) return "ZA";
    return "UNKNOWN";
  }

  private async submitToChain(nullifier: string, policyId: string, optionId: string): Promise<string> {
    // Stub — real implementation calls BlockchainService.castVote()
    // Returns a deterministic fake TX hash for tests
    return "0x" + createHash("sha256").update(nullifier + policyId + optionId).digest("hex");
  }

  private helpText(): string {
    return [
      "TheVoteApp SMS Voting",
      "---------------------",
      "VOTE <policyId> SUPPORT|OPPOSE|ABSTAIN",
      "VERIFY <txHash>",
      "HELP — show this message",
      "",
      "Your number is never stored.",
      "One vote per policy per number.",
    ].join("\n");
  }
}

export const smsVoteService = new SMSVoteService(
  process.env.TWILIO_ACCOUNT_SID ?? "",
  process.env.TWILIO_AUTH_TOKEN ?? "",
  process.env.TWILIO_FROM_NUMBER ?? "",
  (process.env.SMS_ALLOWED_COUNTRY_CODES ?? "GB,US,IN,NG,KE,ZA").split(",")
);
