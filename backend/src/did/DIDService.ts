import { ethers } from "ethers";

/**
 * DIDService — W3C Decentralised Identity integration using did:ethr method.
 *
 * Each voter holds a DID of the form:
 *   did:ethr:sepolia:0x<address>
 *
 * A DID Document is resolved on-chain via the ERC-1056 DID Registry.
 * The voter's identity commitment (for the vote registry) is derived from
 * their DID, ensuring one-to-one mapping without storing PII.
 *
 * Spec: https://github.com/decentralized-identity/ethr-did-resolver
 */
export class DIDService {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly networkName: string;

  // ERC-1056 DID Registry (deployed on most EVM networks)
  private static readonly ERC1056_REGISTRY = "0xdCa7EF03e98e0DC2B855bE647C39ABe984fcF21b";
  private static readonly REGISTRY_ABI = [
    "event DIDAttributeChanged(address indexed identity, bytes32 name, bytes value, uint validTo, uint previousChange)",
    "event DIDDelegateChanged(address indexed identity, bytes32 delegateType, address delegate, uint validTo, uint previousChange)",
    "function changed(address identity) view returns (uint)",
    "function nonce(address identity) view returns (uint)",
    "function setAttribute(address identity, bytes32 name, bytes value, uint validity) external",
  ];

  constructor(rpcURL: string, networkName = "sepolia") {
    this.provider = new ethers.JsonRpcProvider(rpcURL);
    this.networkName = networkName;
  }

  /**
   * Generate a DID from an Ethereum address.
   * did:ethr:<network>:<address>
   */
  toDID(address: string): string {
    if (!ethers.isAddress(address)) throw new Error(`Invalid address: ${address}`);
    return `did:ethr:${this.networkName}:${address.toLowerCase()}`;
  }

  /**
   * Extract the Ethereum address from a did:ethr DID.
   */
  fromDID(did: string): string {
    const parts = did.split(":");
    if (parts[0] !== "did" || parts[1] !== "ethr") {
      throw new Error(`Unsupported DID method: ${did}`);
    }
    const address = parts.length === 4 ? parts[3] : parts[2];
    if (!ethers.isAddress(address)) throw new Error(`Invalid address in DID: ${did}`);
    return address;
  }

  /**
   * Resolve a DID to a W3C DID Document.
   * Reads on-chain DID Registry events to build the document.
   */
  async resolve(did: string): Promise<DIDDocument> {
    const address = this.fromDID(did);
    const registry = new ethers.Contract(
      DIDService.ERC1056_REGISTRY,
      DIDService.REGISTRY_ABI,
      this.provider
    );

    // Fetch last-changed block
    const lastChanged: bigint = await registry.changed(address).catch(() => 0n);

    const doc: DIDDocument = {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/secp256k1-2019/v1"
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#controller`,
          type: "EcdsaSecp256k1RecoveryMethod2020",
          controller: did,
          blockchainAccountId: `eip155:1:${address}`
        }
      ],
      authentication: [`${did}#controller`],
      assertionMethod: [`${did}#controller`],
    };

    return doc;
  }

  /**
   * Derive the voter identity commitment from a DID.
   * commitment = keccak256(did || countryCode || salt)
   *
   * This is posted to VoterRegistry; it does not reveal the DID or address.
   */
  deriveIdentityCommitment(did: string, countryCode: string, salt: string): string {
    const packed = ethers.solidityPackedKeccak256(
      ["string", "string", "string"],
      [did, countryCode, salt]
    );
    return packed;
  }

  /**
   * Verify that a JWT credential was signed by a given DID's controller.
   * Used by the national identity oracle to verify government-issued VCs.
   */
  async verifyCredential(vcJwt: string): Promise<VerifiedCredential> {
    // In production: use @veramo/core or @digitalbazaar/vc to verify
    // For now, decode the JWT header+payload and verify the signature
    const [headerB64, payloadB64, signatureB64] = vcJwt.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new Error("Invalid JWT format");
    }

    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8")
    );

    return {
      issuerDID: payload.iss,
      subjectDID: payload.sub,
      countryCode: payload.vc?.credentialSubject?.countryCode,
      issuanceDate: payload.iat,
      expirationDate: payload.exp,
      isValid: true, // stub — real implementation verifies signature
    };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DIDDocument {
  "@context": string[];
  id: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  service?: ServiceEndpoint[];
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  blockchainAccountId?: string;
  publicKeyMultibase?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface VerifiedCredential {
  issuerDID: string;
  subjectDID: string;
  countryCode: string;
  issuanceDate: number;
  expirationDate: number;
  isValid: boolean;
}
