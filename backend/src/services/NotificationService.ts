import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { getRedis } from "../redis/RedisClient.js";
import logger from "../utils/logger.js";

/**
 * NotificationService — FCM (Android) + APNs (iOS via FCM) push notifications.
 *
 * Sends notifications for:
 *   • Policy opened — "Voting is now open on <title>"
 *   • 24-hour deadline warning — "Last chance to vote on <title>"
 *   • Results published — "Results are in for <title>"
 *
 * Device tokens are stored keyed by (userId, platform).
 * No vote content is ever included in notification payloads.
 */
export type NotificationEvent = "policy_opened" | "deadline_24h" | "results_published";

interface TokenRecord {
  token: string;
  platform: "android" | "ios";
  countryCode: string;
}

export class NotificationService {
  // Redis key helpers
  private readonly TK = (userId: string) => `notif:token:${userId}`;
  private readonly CK = (countryCode: string) => `notif:country:${countryCode}`;

  constructor() {
    if (getApps().length === 0 && process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        initializeApp({
          credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        });
      } catch (err) {
        logger.warn({ err }, "Firebase Admin SDK init failed — push notifications disabled");
      }
    }
  }

  // MARK: - Token management

  async registerToken(userId: string, token: string, platform: "android" | "ios", countryCode: string): Promise<void> {
    const redis = getRedis();
    const record: TokenRecord = { token, platform, countryCode };
    // Remove from old country set if country changed
    const existing = await redis.get(this.TK(userId));
    if (existing) {
      const old: TokenRecord = JSON.parse(existing);
      if (old.countryCode !== countryCode) {
        await redis.srem(this.CK(old.countryCode), userId);
      }
    }
    await Promise.all([
      redis.set(this.TK(userId), JSON.stringify(record)),
      redis.sadd(this.CK(countryCode), userId),
    ]);
    logger.info({ userId, platform, countryCode }, "Device token registered");
  }

  async unregisterToken(userId: string): Promise<void> {
    const redis = getRedis();
    const raw = await redis.get(this.TK(userId));
    if (raw) {
      const record: TokenRecord = JSON.parse(raw);
      await redis.srem(this.CK(record.countryCode), userId);
    }
    await redis.del(this.TK(userId));
  }

  // MARK: - Send notifications

  async notifyPolicyOpened(policyId: string, policyTitle: string, countryCode: string) {
    await this.broadcast({
      countryCode,
      title: "Voting is now open",
      body: policyTitle,
      data: { event: "policy_opened", policyId },
    });
  }

  async notifyDeadline24h(policyId: string, policyTitle: string, countryCode: string) {
    await this.broadcast({
      countryCode,
      title: "Last chance to vote",
      body: `Voting closes in 24 hours: ${policyTitle}`,
      data: { event: "deadline_24h", policyId },
    });
  }

  async notifyResultsPublished(policyId: string, policyTitle: string, countryCode: string) {
    await this.broadcast({
      countryCode,
      title: "Results are in",
      body: policyTitle,
      data: { event: "results_published", policyId },
    });
  }

  // MARK: - Private

  private async broadcast({
    countryCode,
    title,
    body,
    data,
  }: {
    countryCode: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }) {
    const redis = getRedis();
    const userIds = await redis.smembers(this.CK(countryCode));
    if (userIds.length === 0) return;

    const rawRecords = await Promise.all(userIds.map((id) => redis.get(this.TK(id))));
    const recipients = rawRecords
      .map((r, i) => r ? { userId: userIds[i], ...JSON.parse(r) as TokenRecord } : null)
      .filter(Boolean) as Array<{ userId: string } & TokenRecord>;

    if (recipients.length === 0) return;

    const tokenStrings = recipients.map((r) => r.token);
    const message: MulticastMessage = {
      tokens: tokenStrings,
      notification: { title, body },
      data,
      android: { priority: "high" },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
    };

    try {
      const messaging = getMessaging();
      const result = await messaging.sendEachForMulticast(message);
      logger.info(
        { success: result.successCount, failure: result.failureCount, event: data.event },
        "Push notifications sent"
      );

      // Remove invalid tokens from Redis
      const staleRemovals: Promise<unknown>[] = [];
      result.responses.forEach((resp, i) => {
        if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
          const { userId, countryCode: cc } = recipients[i];
          staleRemovals.push(
            redis.del(this.TK(userId)),
            redis.srem(this.CK(cc), userId),
          );
        }
      });
      if (staleRemovals.length > 0) await Promise.all(staleRemovals);
    } catch (err) {
      logger.error({ err }, "Push notification broadcast failed");
    }
  }
}

export const notificationService = new NotificationService();
