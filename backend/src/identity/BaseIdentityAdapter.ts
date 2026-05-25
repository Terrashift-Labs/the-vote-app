import { createHash } from "crypto";

/**
 * BaseIdentityAdapter — contract every national identity provider must implement.
 *
 * The adapter pattern keeps the VoterRegistry integration generic:
 * each adapter takes a provider-specific credential token and returns a
 * normalised IdentityResult with an identity commitment ready for on-chain
 * registration — without storing any PII.
 *
 * Flow:
 *   Citizen authenticates with their national IdP
 *     → IdP issues a credential token (JWT / SAML assertion / OIDC id_token)
 *     → Backend calls adapter.verify(token)
 *     → Adapter validates token with the IdP
 *     → Returns { commitment, countryCode } — no PII ever stored
 *     → Backend calls VoterRegistry.register(commitment, countryCode)
 */

export interface IdentityResult {
  /** keccak256-compatible hex commitment — H(subjectId || countryCode || salt) */
  commitment: string;
  /** ISO 3166-1 alpha-2 */
  countryCode: string;
  /** Adapter name for logging (NEVER log the subjectId itself) */
  adapterName: string;
}

export abstract class BaseIdentityAdapter {
  abstract readonly name: string;

  /**
   * Verify a credential token from the national identity provider.
   * Throws on invalid/expired credentials.
   * Returns an IdentityResult — never the raw subject ID.
   */
  abstract verify(token: string, extraParams?: Record<string, string>): Promise<IdentityResult>;

  /**
   * Derives an identity commitment from a subject identifier.
   * The subject ID is hashed with the country code and a server-side salt
   * so it cannot be reversed even if the commitment is leaked.
   *
   * @param subjectId  Provider-issued opaque user ID (sub claim, etc.)
   * @param countryCode ISO 3166-1 alpha-2
   */
  protected deriveCommitment(subjectId: string, countryCode: string): string {
    const salt = process.env.IDENTITY_COMMITMENT_SALT ?? "identity-salt-replace-in-prod";
    return "0x" + createHash("sha256")
      .update(subjectId + countryCode.toUpperCase() + salt)
      .digest("hex");
  }
}
