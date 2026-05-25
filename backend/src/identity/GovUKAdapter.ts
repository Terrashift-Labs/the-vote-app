import { createRemoteJWKSet, jwtVerify } from "jose";
import { BaseIdentityAdapter, type IdentityResult } from "./BaseIdentityAdapter.js";
import logger from "../utils/logger.js";

/**
 * GovUKAdapter — verifies UK Gov.UK One Login OIDC id_tokens.
 *
 * Gov.UK One Login (https://sign-in.service.gov.uk) is the UK government's
 * single sign-on service. It issues OIDC id_tokens after identity verification
 * at one of three levels: Cl (low), Cl.Cm (medium), P1 (high), P2 (highest).
 *
 * We require at least Cl.Cm (medium — verified photo ID or bank check).
 *
 * Integration path:
 *   1. Citizen authenticates via Gov.UK One Login (OAuth 2.0 PKCE flow)
 *   2. Backend receives id_token at /callback
 *   3. id_token sent to POST /api/v1/identity/verify { adapter: "govuk", token }
 *   4. Adapter verifies against Gov.UK JWKS and extracts `sub`
 *
 * Environment variables:
 *   GOVUK_OIDC_JWKS_URI  — Gov.UK One Login JWKS URI
 *   GOVUK_OIDC_ISSUER    — e.g. https://oidc.account.gov.uk
 *   GOVUK_OIDC_CLIENT_ID — Your registered client_id
 */

// Gov.UK One Login vector of trust values (minimum = Cl.Cm)
const ACCEPTED_VOT = new Set(["Cl.Cm", "Cl.Cm.P2", "P1.Cl.Cm", "P2.Cl.Cm"]);

export class GovUKAdapter extends BaseIdentityAdapter {
  readonly name = "govuk";

  private readonly jwksUri: string;
  private readonly issuer: string;
  private readonly clientId: string;

  constructor() {
    super();
    this.jwksUri  = process.env.GOVUK_OIDC_JWKS_URI  ?? "";
    this.issuer   = process.env.GOVUK_OIDC_ISSUER     ?? "";
    this.clientId = process.env.GOVUK_OIDC_CLIENT_ID  ?? "";
  }

  async verify(idToken: string): Promise<IdentityResult> {
    if (!this.jwksUri || !this.issuer || !this.clientId) {
      throw new Error("GovUK adapter not configured — set GOVUK_OIDC_JWKS_URI, GOVUK_OIDC_ISSUER, GOVUK_OIDC_CLIENT_ID");
    }

    const JWKS = createRemoteJWKSet(new URL(this.jwksUri));

    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer:   this.issuer,
      audience: this.clientId,
    });

    // Validate vector of trust (identity confidence level)
    const vot = payload["vot"] as string | undefined;
    if (vot && !ACCEPTED_VOT.has(vot)) {
      throw new Error(`Gov.UK One Login vot '${vot}' insufficient — Cl.Cm or higher required`);
    }

    const sub = payload["sub"] as string | undefined;
    if (!sub) throw new Error("Gov.UK One Login token missing sub claim");

    const commitment = this.deriveCommitment(sub, "GB");
    logger.info({ adapter: this.name, country: "GB" }, "Gov.UK identity verified");

    return { commitment, countryCode: "GB", adapterName: this.name };
  }
}

export const govUKAdapter = new GovUKAdapter();
