import { ethers } from "ethers";
import { ipfsService } from "../ipfs/IPFSService.js";
import logger from "../utils/logger.js";

/**
 * GatewayManifest — publishes a signed JSON manifest to IPFS so clients
 * can discover backend API endpoints without relying on central DNS.
 *
 * Manifest schema:
 * {
 *   "version":   1,
 *   "endpoints": { "api": "https://...", "ws": "wss://..." },
 *   "chains":    { "1": "0x<VoteLedger>", "11155111": "0x<VoteLedger>" },
 *   "publishedAt": "<ISO-8601>",
 *   "signature": "0x<ECDSA over keccak256(content without signature field)>"
 * }
 *
 * The CID of the latest manifest is stored as an ENS text record on
 * thevoteapp.eth (key "gateway") so clients can find it without any
 * centralised bootstrap server.
 */
export interface GatewayManifestData {
  version: number;
  endpoints: {
    api: string;
    ws: string;
  };
  chains: Record<string, string>; // chainId → VoteLedger contract address
  publishedAt: string;
  signature?: string;
}

export class GatewayManifestService {
  private readonly signerKey: string;

  constructor(signerPrivateKey: string) {
    this.signerKey = signerPrivateKey;
  }

  /**
   * Build, sign, and pin the gateway manifest to IPFS.
   * Returns the CID to be stored as the ENS text record.
   */
  async publish(
    apiUrl: string,
    wsUrl: string,
    chainContracts: Record<string, string>
  ): Promise<string> {
    const manifest: GatewayManifestData = {
      version: 1,
      endpoints: { api: apiUrl, ws: wsUrl },
      chains: chainContracts,
      publishedAt: new Date().toISOString(),
    };

    // Sign the manifest content (excluding the signature field)
    const payload = JSON.stringify(manifest, null, 2);
    const wallet = new ethers.Wallet(this.signerKey);
    const hash = ethers.id(payload);
    const signature = await wallet.signMessage(ethers.getBytes(hash));
    manifest.signature = signature;

    const signed = JSON.stringify(manifest, null, 2);
    const cid = await ipfsService.pinDocument(
      new TextEncoder().encode(signed),
      "gateway-manifest.json"
    );

    logger.info({ cid, apiUrl }, "Gateway manifest published to IPFS");
    return cid;
  }

  /**
   * Verify a manifest retrieved from IPFS.
   * Returns the signer address so callers can check against the known public key.
   */
  static verify(manifest: GatewayManifestData, expectedSigner: string): boolean {
    if (!manifest.signature) return false;
    const { signature, ...rest } = manifest;
    const payload = JSON.stringify(rest, null, 2);
    const hash = ethers.id(payload);
    try {
      const recovered = ethers.verifyMessage(ethers.getBytes(hash), signature);
      return recovered.toLowerCase() === expectedSigner.toLowerCase();
    } catch {
      return false;
    }
  }
}
