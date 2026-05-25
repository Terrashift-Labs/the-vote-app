import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { randomBytes } from "crypto";
import { getRedis } from "../redis/RedisClient.js";
import logger from "../utils/logger.js";

/**
 * FIDO2Service — WebAuthn / FIDO2 hardware security key support.
 *
 * Supports both platform authenticators (device biometrics) and
 * roaming authenticators (FIDO2 USB/NFC security keys, e.g. YubiKey).
 *
 * Challenges are one-time-use and expire after 5 minutes (Redis TTL).
 * Credentials are persisted in Redis; safe for horizontal scaling.
 */

interface StoredCredential {
  credentialID: string;
  credentialPublicKey: string; // base64-encoded Uint8Array
  counter: number;
  userId: string;
}

export class FIDO2Service {
  private readonly rpName = "TheVoteApp";
  private readonly rpID: string;
  private readonly origin: string;

  private readonly CHALLENGE_TTL = 300; // 5 minutes
  private readonly CK = (userId: string) => `fido2:challenge:${userId}`;
  private readonly CR = (credId: string) => `fido2:cred:${credId}`;
  private readonly UC = (userId: string) => `fido2:user:${userId}:creds`;

  constructor(rpID: string, origin: string) {
    this.rpID = rpID;
    this.origin = origin;
  }

  // MARK: - Registration

  async generateRegistrationOptions(userId: string, userDisplayName: string) {
    const userCreds = await this.getUserCredentials(userId);

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: new TextEncoder().encode(userId),
      userName: userId,
      userDisplayName,
      attestationType: "none",
      authenticatorSelection: {
        // Allow both platform (biometric) and cross-platform (security key)
        authenticatorAttachment: undefined,
        residentKey: "preferred",
        userVerification: "required",
      },
      // Exclude already-registered credentials to prevent duplicates
      excludeCredentials: userCreds.map((c) => ({ id: c.credentialID })),
    });

    await this.storeChallenge(userId, options.challenge);
    return options;
  }

  async verifyRegistration(userId: string, response: RegistrationResponseJSON) {
    const stored = await this.getChallenge(userId);
    if (!stored) throw new Error("No pending challenge for user");

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: stored,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Registration verification failed");
    }

    const { credential } = verification.registrationInfo;
    await this.storeCredential(credential.id, {
      credentialID: credential.id,
      credentialPublicKey: credential.publicKey,
      counter: credential.counter,
      userId,
    });

    await this.deleteChallenge(userId);
    logger.info({ userId, credentialId: credential.id }, "FIDO2 credential registered");
    return { credentialId: credential.id };
  }

  // MARK: - Authentication

  async generateAuthenticationOptions(userId: string) {
    const userCreds = await this.getUserCredentials(userId);

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: userCreds.map((c) => ({ id: c.credentialID })),
      userVerification: "required",
    });

    await this.storeChallenge(userId, options.challenge);
    return options;
  }

  async verifyAuthentication(userId: string, response: AuthenticationResponseJSON) {
    const stored = await this.getChallenge(userId);
    if (!stored) throw new Error("No pending challenge for user");

    const credential = await this.getCredential(response.id);
    if (!credential || credential.userId !== userId) {
      throw new Error("Credential not found for user");
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: credential.credentialID,
        publicKey: Buffer.from(credential.credentialPublicKey, "base64"),
        counter: credential.counter,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) throw new Error("Authentication verification failed");

    // Update stored signature counter (replay attack protection)
    await this.updateCounter(response.id, verification.authenticationInfo.newCounter);
    await this.deleteChallenge(userId);

    logger.info({ userId, credentialId: response.id }, "FIDO2 authentication verified");
    return true;
  }

  // MARK: - Private Redis helpers

  private async storeChallenge(userId: string, challenge: string): Promise<void> {
    await getRedis().setex(this.CK(userId), this.CHALLENGE_TTL, challenge);
  }

  private async getChallenge(userId: string): Promise<string | null> {
    return getRedis().get(this.CK(userId));
  }

  private async deleteChallenge(userId: string): Promise<void> {
    await getRedis().del(this.CK(userId));
  }

  private async storeCredential(
    credentialId: string,
    record: { credentialID: string; credentialPublicKey: Uint8Array; counter: number; userId: string }
  ): Promise<void> {
    const stored: StoredCredential = {
      ...record,
      credentialPublicKey: Buffer.from(record.credentialPublicKey).toString("base64"),
    };
    const redis = getRedis();
    await Promise.all([
      redis.set(this.CR(credentialId), JSON.stringify(stored)),
      redis.sadd(this.UC(record.userId), credentialId),
    ]);
  }

  private async getCredential(credentialId: string): Promise<StoredCredential | null> {
    const raw = await getRedis().get(this.CR(credentialId));
    return raw ? (JSON.parse(raw) as StoredCredential) : null;
  }

  private async getUserCredentials(userId: string): Promise<StoredCredential[]> {
    const redis = getRedis();
    const credIds = await redis.smembers(this.UC(userId));
    const records = await Promise.all(credIds.map((id) => this.getCredential(id)));
    return records.filter(Boolean) as StoredCredential[];
  }

  private async updateCounter(credentialId: string, newCounter: number): Promise<void> {
    const raw = await getRedis().get(this.CR(credentialId));
    if (!raw) return;
    const stored: StoredCredential = JSON.parse(raw);
    stored.counter = newCounter;
    await getRedis().set(this.CR(credentialId), JSON.stringify(stored));
  }
}

export const fido2Service = new FIDO2Service(
  process.env.RP_ID ?? "localhost",
  process.env.ORIGIN ?? "http://localhost:3000"
);
