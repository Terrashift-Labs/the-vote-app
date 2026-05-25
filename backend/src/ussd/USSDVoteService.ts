import { createHash } from "crypto";
import { getRedis } from "../redis/RedisClient.js";
import logger from "../utils/logger.js";

/**
 * USSDVoteService — Africa's Talking USSD gateway integration.
 *
 * Enables voting from any GSM feature phone with no data plan.
 * Dial *384*VOTE# (or operator-assigned shortcode) to start.
 *
 * Session flow:
 *   Step 1: Welcome + language select
 *   Step 2: Policy list (paginated, max 3 per screen)
 *   Step 3: Vote options (Support / Oppose / Abstain)
 *   Step 4: Confirmation prompt
 *   Step 5: Receipt code (last 8 hex chars of nullifier)
 *
 * Security:
 *   • Phone number hashed to nullifier — never stored
 *   • One vote per phone number per policy
 *   • Session state stored in Redis with 90-second TTL (survives restarts,
 *     safe for horizontal scaling)
 */

export type USSDResponse = {
  text:     string;
  continue: boolean;   // false = END session, true = CON (continue)
};

interface Session {
  step:        number;
  policyIndex: number;
  policyId?:   string;
}

export class USSDVoteService {
  // Stub policy list — populated from PolicyService in production
  private readonly POLICIES = [
    { id: "pol-001", title: "NHS Funding Increase" },
    { id: "pol-002", title: "Green Energy Transition" },
    { id: "pol-003", title: "Housing Reform Bill" },
    { id: "pol-004", title: "Education Voucher Scheme" },
    { id: "pol-005", title: "Transport Infrastructure" },
  ];

  private readonly NULLIFIER_SALT = process.env.USSD_NULLIFIER_SALT ?? "ussd-salt-replace";
  private readonly SESSION_TTL = 90; // seconds
  private readonly SK = (id: string) => `ussd:session:${id}`;
  private readonly NULLIFIERS_KEY = "ussd:nullifiers";

  /**
   * Handle an inbound USSD request from Africa's Talking.
   */
  async handle(sessionId: string, phone: string, text: string): Promise<USSDResponse> {
    const redis = getRedis();
    const parts = text.split("*").filter(Boolean);

    let session = await this.getSession(sessionId);
    if (!session) {
      session = { step: 0, policyIndex: 0 };
    }
    // Refresh TTL on every interaction
    await this.saveSession(sessionId, session);

    // Root — no input yet
    if (parts.length === 0) {
      return this.con("Welcome to TheVoteApp\n\nActive policies:\n" + this.policyMenu(0) + "\n0. Next page\n#. Exit");
    }

    const last = parts[parts.length - 1];

    // Exit at any time
    if (last === "#") {
      await redis.del(this.SK(sessionId));
      return this.end("Session ended. Thank you.");
    }

    // Policy selection
    if (!session.policyId) {
      if (last === "0") {
        session.policyIndex = (session.policyIndex + 3) % this.POLICIES.length;
        await this.saveSession(sessionId, session);
        return this.con("Active policies:\n" + this.policyMenu(session.policyIndex) + "\n0. Next page\n#. Exit");
      }
      const idx = parseInt(last, 10) - 1 + session.policyIndex;
      const policy = this.POLICIES[idx];
      if (!policy) return this.con("Invalid choice. Please try again.\n" + this.policyMenu(session.policyIndex));
      session.policyId = policy.id;
      session.step = 1;
      await this.saveSession(sessionId, session);
      return this.con(`${policy.title}\n\n1. Support\n2. Oppose\n3. Abstain\n#. Cancel`);
    }

    // Vote option selection
    if (session.step === 1) {
      const optionMap: Record<string, string> = { "1": "option-support", "2": "option-oppose", "3": "option-abstain" };
      const optionId = optionMap[last];
      if (!optionId) return this.con("Invalid option.\n1. Support\n2. Oppose\n3. Abstain\n#. Cancel");
      const labelMap: Record<string, string> = { "option-support": "Support", "option-oppose": "Oppose", "option-abstain": "Abstain" };
      const policyBase = session.policyId.split(":")[0];
      session.step = 2;
      session.policyId = `${policyBase}:${optionId}`;
      await this.saveSession(sessionId, session);
      return this.con(`Confirm vote:\n${labelMap[optionId]} on ${policyBase}\n\n1. Confirm\n2. Cancel`);
    }

    // Confirmation
    if (session.step === 2) {
      if (last !== "1") {
        await redis.del(this.SK(sessionId));
        return this.end("Vote cancelled. Thank you.");
      }
      const [policyId, optionId] = (session.policyId ?? ":").split(":");
      const nullifier = this.deriveNullifier(phone, policyId);

      const alreadyVoted = await redis.sismember(this.NULLIFIERS_KEY, nullifier);
      if (alreadyVoted) {
        await redis.del(this.SK(sessionId));
        return this.end("You have already voted on this policy.");
      }

      // Submit to chain (stub) — nullifier recorded atomically
      await redis.sadd(this.NULLIFIERS_KEY, nullifier);
      await redis.del(this.SK(sessionId));
      const receipt = nullifier.slice(2, 10).toUpperCase(); // 8-char receipt code
      logger.info({ policyId, optionId, nullifier }, "USSD vote submitted");
      return this.end(`Vote recorded!\nReceipt: ${receipt}\n\nThank you for participating.`);
    }

    return this.end("Session expired. Please dial again.");
  }

  // MARK: - Private

  private async getSession(sessionId: string): Promise<Session | null> {
    const raw = await getRedis().get(this.SK(sessionId));
    return raw ? (JSON.parse(raw) as Session) : null;
  }

  private async saveSession(sessionId: string, session: Session): Promise<void> {
    await getRedis().setex(this.SK(sessionId), this.SESSION_TTL, JSON.stringify(session));
  }

  private policyMenu(offset: number): string {
    return this.POLICIES.slice(offset, offset + 3)
      .map((p, i) => `${i + 1}. ${p.title.slice(0, 30)}`)
      .join("\n");
  }

  private deriveNullifier(phone: string, policyId: string): string {
    return "0x" + createHash("sha256")
      .update(phone + policyId + this.NULLIFIER_SALT)
      .digest("hex");
  }

  private con(text: string): USSDResponse { return { text, continue: true }; }
  private end(text: string): USSDResponse { return { text, continue: false }; }
}

export const ussdVoteService = new USSDVoteService();
