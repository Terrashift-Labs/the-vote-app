import { tmpdir } from "os";
import { z } from "zod";
import type { ZKPassport, Query, QueryResult, ProofResult } from "@zkpassport/sdk";
import { BaseIdentityAdapter, type IdentityResult } from "./BaseIdentityAdapter.js";
import { getCountry } from "../countries/index.js";
import logger from "../utils/logger.js";

/**
 * ZKPassportAdapter — anonymous citizenship check using ZKPassport proofs.
 *
 * The citizen's phone proves, in zero knowledge, "nationality = X, age >= 18"
 * from their passport / ID chip. The proof is bound to a `commitment` the
 * client generated from its own `voterSecret`, so:
 *   - the server never learns who the citizen is (no PII in the proof), and
 *   - the server never sees or derives the vote key.
 *
 * The result carries a `sybilKey` (ZKPassport's unique identifier) so the
 * caller can reject the same document registering twice.
 *
 * SECURITY: the query is rebuilt here from server-side rules. We never accept
 * `originalQuery` from the client — otherwise a client could submit a proof
 * of a weaker query (e.g. no nationality check) and still pass verification.
 *
 * Token: JSON string { country: "GB", commitment: "0x…32 bytes", proofs, queryResult }
 *
 * Environment variables:
 *   ZKPASSPORT_DOMAIN   — domain registered with ZKPassport (default thevoteapp.org)
 *   ZKP_OPRF_KEY_ID     — OPRF key id, required for salted identifiers
 *   ZKPASSPORT_DEV_MODE — "true" to accept mock proofs (refused in production)
 */

export const MIN_VOTING_AGE = 18;

// Loaded lazily: the SDK is large, so importing the app must not pay for it.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadSdk = (): typeof import("@zkpassport/sdk") => require("@zkpassport/sdk");

const TokenSchema = z.object({
  country:     z.string().length(2),
  commitment:  z.string().regex(/^0x[0-9a-fA-F]{64}$/, "commitment must be 32-byte hex"),
  proofs:      z.array(z.any()).min(1),
  queryResult: z.record(z.any()),
});

export interface ZKPassportVerification {
  verified: boolean;
  uniqueIdentifier?: string;
  uniqueIdentifierType?: number;
  queryResultErrors?: unknown;
}

export interface ZKPassportVerifyInput {
  proofs: ProofResult[];
  originalQuery: Query;
  queryResult: QueryResult;
  scope: string;
  devMode: boolean;
  oprfKeyId?: string;
}

/** Seam so tests can run without the real (heavy) SDK verifier. */
export type ZKPassportVerifyFn = (input: ZKPassportVerifyInput) => Promise<ZKPassportVerification>;

/** One sybil scope per country. */
export const scopeFor = (alpha3: string) => `citizen-${alpha3.toLowerCase()}`;

/** The exact query a client must have proven. Also used by clients to build requests. */
export function buildQuery(sdk: ZKPassport, alpha3: string, commitment: string): Query {
  return sdk.createQuery()
    .eq("nationality", alpha3 as any)
    .gte("age", MIN_VOTING_AGE)
    .bind("custom_data", commitment.toLowerCase())
    .facematch("strict") // required for salted identifiers
    .done().query;
}

export class ZKPassportAdapter extends BaseIdentityAdapter {
  readonly name = "zkpassport";

  private sdk?: ZKPassport;

  constructor(private readonly verifyFn?: ZKPassportVerifyFn) {
    super();
  }

  private get domain() { return process.env.ZKPASSPORT_DOMAIN ?? "thevoteapp.org"; }

  private get devMode() {
    const dev = process.env.ZKPASSPORT_DEV_MODE === "true";
    if (dev && process.env.NODE_ENV === "production") {
      throw new Error("ZKPassport dev mode (mock proofs) is not allowed in production");
    }
    return dev;
  }

  private getSdk() {
    return (this.sdk ??= new (loadSdk().ZKPassport)(this.domain));
  }

  private defaultVerify: ZKPassportVerifyFn = async (i) => {
    const sdk = this.getSdk();
    return sdk.verify({
      proofs: i.proofs,
      originalQuery: i.originalQuery,
      queryResult: i.queryResult,
      scope: i.scope,
      devMode: i.devMode,
      oprfKeyId: i.oprfKeyId,
      uniqueIdentifierType: loadSdk().NullifierType.SALTED,
      writingDirectory: tmpdir(),
    });
  };

  async verify(token: string): Promise<IdentityResult> {
    let body: z.infer<typeof TokenSchema>;
    try {
      body = TokenSchema.parse(JSON.parse(token));
    } catch (err: any) {
      throw new Error(`ZKPassport: malformed token (${err instanceof z.ZodError ? err.issues[0]?.message : "not JSON"})`);
    }

    const countryCode = body.country.toUpperCase();
    const country = getCountry(countryCode);
    if (!country) throw new Error(`ZKPassport: unsupported country '${countryCode}'`);
    const alpha3 = country.alpha3;

    const devMode = this.devMode;
    const oprfKeyId = process.env.ZKP_OPRF_KEY_ID;
    if (!devMode && !oprfKeyId) {
      throw new Error("ZKPassport adapter not configured — set ZKP_OPRF_KEY_ID");
    }

    const commitment = body.commitment.toLowerCase();
    const queryResult = body.queryResult as QueryResult;

    // Rebuild the query ourselves — see SECURITY note above.
    const originalQuery = this.verifyFn
      ? ({ nationality: { eq: alpha3 }, age: { gte: MIN_VOTING_AGE }, bind: { custom_data: commitment }, facematch: { mode: "strict" } } as unknown as Query)
      : buildQuery(this.getSdk(), alpha3, commitment);

    const result = await (this.verifyFn ?? this.defaultVerify)({
      proofs: body.proofs as ProofResult[],
      originalQuery,
      queryResult,
      scope: scopeFor(alpha3),
      devMode,
      oprfKeyId,
    });

    if (!result.verified || result.queryResultErrors) throw new Error("ZKPassport: invalid proof");
    if (!result.uniqueIdentifier) throw new Error("ZKPassport: proof carried no unique identifier");

    // Salted identifiers stop a document issuer recomputing who registered.
    const { NullifierType } = loadSdk();
    const salted = result.uniqueIdentifierType === NullifierType.SALTED ||
      (devMode && result.uniqueIdentifierType === NullifierType.SALTED_MOCK);
    if (!salted) throw new Error("ZKPassport: salted unique identifier required");

    // Defence in depth: check the proven results, not just that a proof exists.
    if (queryResult.nationality?.eq?.expected !== alpha3 || queryResult.nationality?.eq?.result !== true) {
      throw new Error("ZKPassport: nationality not proven");
    }
    if (queryResult.age?.gte?.result !== true || queryResult.age?.gte?.expected !== MIN_VOTING_AGE) {
      throw new Error("ZKPassport: minimum age not proven");
    }
    if (queryResult.bind?.custom_data?.toLowerCase() !== commitment) {
      throw new Error("ZKPassport: proof is not bound to this commitment");
    }

    // Never log the unique identifier or commitment.
    logger.info({ adapter: this.name, countryCode }, "ZKPassport identity verified");

    return { sybilKey: result.uniqueIdentifier, commitment, countryCode, adapterName: this.name };
  }
}

export const zkPassportAdapter = new ZKPassportAdapter();
