import { createRemoteJWKSet, jwtVerify } from "jose";
import { BaseIdentityAdapter, type IdentityResult } from "./BaseIdentityAdapter.js";
import logger from "../utils/logger.js";

/**
 * eIDASAdapter — verifies EU eIDAS identity assertions.
 *
 * eIDAS (EU 910/2014) mandates that all EU member states provide electronic
 * identification schemes that are cross-border interoperable.
 *
 * Integration path:
 *   1. Citizen is redirected to the EU eIDAS node (national eID gateway)
 *   2. After authentication, the node issues a signed JWT (OIDC id_token)
 *      containing the `eidas_natural_person_identifier` claim
 *   3. The JWT is sent to POST /api/v1/identity/verify { adapter: "eidas", token }
 *   4. This adapter verifies the JWT against the eIDAS node's JWKS endpoint
 *   5. Returns a commitment derived from the natural person identifier
 *
 * Reference: https://ec.europa.eu/digital-building-blocks/wikis/display/DIGITAL/eIDAS+eID+Profile
 *
 * Environment variables:
 *   EIDAS_JWKS_URI     — JWKS endpoint of the eIDAS node (per-country or EU central)
 *   EIDAS_ISSUER       — Expected JWT issuer
 *   EIDAS_AUDIENCE     — Expected JWT audience (your client_id)
 *   EIDAS_COUNTRY_CODES — Comma-separated list of supported EU country codes
 */

// Natural person identifier format: CC/CC/identifier
// e.g. "DE/EU/12345678X"
const NPI_REGEX = /^([A-Z]{2})\/([A-Z]{2}|EU)\/(.+)$/;

// Map of eIDAS LoA (Level of Assurance) — only accept high/substantial
const ACCEPTED_LOA = new Set([
  "http://eidas.europa.eu/LoA/high",
  "http://eidas.europa.eu/LoA/substantial",
]);

export class eIDASAdapter extends BaseIdentityAdapter {
  readonly name = "eidas";

  private readonly jwksUri: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly allowedCountries: Set<string>;

  constructor() {
    super();
    this.jwksUri         = process.env.EIDAS_JWKS_URI    ?? "";
    this.issuer          = process.env.EIDAS_ISSUER       ?? "";
    this.audience        = process.env.EIDAS_AUDIENCE     ?? "";
    this.allowedCountries = new Set(
      (process.env.EIDAS_COUNTRY_CODES ?? "DE,FR,ES,IT,NL,PL,SE,AT,BE,DK,FI,IE,PT,RO,CZ,HU,BG,HR,SK,SI,LT,LV,EE,CY,LU,MT")
        .split(",").map((c) => c.trim().toUpperCase())
    );
  }

  async verify(idToken: string): Promise<IdentityResult> {
    if (!this.jwksUri || !this.issuer || !this.audience) {
      throw new Error("eIDAS adapter not configured — set EIDAS_JWKS_URI, EIDAS_ISSUER, EIDAS_AUDIENCE");
    }

    const JWKS = createRemoteJWKSet(new URL(this.jwksUri));

    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer:   this.issuer,
      audience: this.audience,
    });

    // Validate Level of Assurance
    const loa = payload["acr"] as string | undefined;
    if (loa && !ACCEPTED_LOA.has(loa)) {
      throw new Error(`eIDAS LoA '${loa}' insufficient — high or substantial required`);
    }

    // Extract the natural person identifier (NPI)
    const npi = payload["eidas_natural_person_identifier"] as string | undefined
              ?? payload["sub"] as string;

    if (!npi) throw new Error("eIDAS token missing natural person identifier");

    // Parse "CC/CC/id" format to extract country code
    const match = npi.match(NPI_REGEX);
    const issuingCountry = match ? match[1].toUpperCase() : (payload["c"] as string ?? "EU").toUpperCase();

    if (!this.allowedCountries.has(issuingCountry)) {
      throw new Error(`Country '${issuingCountry}' not in eIDAS allow-list`);
    }

    // Derive commitment — NPI is never stored, only its hash
    const commitment = this.deriveCommitment(npi, issuingCountry);
    logger.info({ adapter: this.name, country: issuingCountry }, "eIDAS identity verified");

    return { commitment, countryCode: issuingCountry, adapterName: this.name };
  }
}

export const eidasAdapter = new eIDASAdapter();
