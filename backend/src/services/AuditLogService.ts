import { ethers } from "ethers";
import { ipfsService } from "../ipfs/IPFSService.js";
import logger from "../utils/logger.js";

/**
 * AuditLogService — signs admin actions, pins them to IPFS, records CID on-chain.
 *
 * Every mutation that affects the voting system (policy creation, voter roll
 * upload, DAO proposal) produces a signed, IPFS-pinned, on-chain entry.
 * Anyone can independently verify the complete admin history.
 */
export type AuditAction =
  | "policy_created"
  | "policy_updated"
  | "voter_roll_updated"
  | "dao_proposal_submitted"
  | "contract_paused"
  | "contract_unpaused"
  | "document_pinned";

export interface AuditEntry {
  action:    AuditAction;
  actor:     string;
  payload:   Record<string, unknown>;
  timestamp: string;
  signature?: string;
}

const AUDIT_LOG_ABI = [
  "function addEntry(string calldata action, string calldata ipfsCid) external",
  "function getEntry(uint256 id) view returns (address actor, string action, string ipfsCid, uint256 timestamp)",
  "function entryCount() view returns (uint256)",
  "event AuditEntryAdded(uint256 indexed id, address indexed actor, string action, string ipfsCid, uint256 timestamp)",
];

export class AuditLogService {
  private readonly signer:   ethers.Wallet;
  private readonly contract: ethers.Contract;

  constructor(signerKey: string, contractAddress: string, rpcUrl: string) {
    const provider  = new ethers.JsonRpcProvider(rpcUrl);
    this.signer     = new ethers.Wallet(signerKey, provider);
    this.contract   = new ethers.Contract(contractAddress, AUDIT_LOG_ABI, this.signer);
  }

  /**
   * Record an admin action.
   * Signs the entry, pins to IPFS, stores CID on-chain.
   */
  async record(action: AuditAction, actor: string, payload: Record<string, unknown>): Promise<string> {
    const entry: AuditEntry = {
      action,
      actor,
      payload,
      timestamp: new Date().toISOString(),
    };

    // Sign the canonical JSON (without signature field)
    const canonical = JSON.stringify(entry, null, 2);
    const hash      = ethers.id(canonical);
    const signature = await this.signer.signMessage(ethers.getBytes(hash));
    entry.signature = signature;

    // Pin to IPFS
    const blob = JSON.stringify(entry, null, 2);
    const cid  = await ipfsService.pinDocument(
      new TextEncoder().encode(blob),
      `audit-${action}-${Date.now()}.json`
    );

    // Record CID on-chain
    const tx = await this.contract.addEntry(action, cid);
    await tx.wait();

    logger.info({ action, actor, cid }, "Audit entry recorded");
    return cid;
  }

  /**
   * Retrieve and verify an audit entry by on-chain ID.
   */
  async verify(id: number): Promise<{ entry: AuditEntry; valid: boolean; cid: string }> {
    const onChain = await this.contract.getEntry(id);
    const cid     = onChain[2] as string;

    const raw   = await ipfsService.getDocument(cid);
    const entry = JSON.parse(Buffer.from(raw).toString("utf-8")) as AuditEntry;

    // Re-derive the signed payload
    const { signature, ...unsigned } = entry;
    const canonical = JSON.stringify(unsigned, null, 2);
    const hash      = ethers.id(canonical);
    let valid = false;
    try {
      const recovered = ethers.verifyMessage(ethers.getBytes(hash), signature ?? "");
      valid = recovered.toLowerCase() === onChain[0].toLowerCase();
    } catch { /* invalid signature */ }

    return { entry, valid, cid };
  }
}

export const auditLogService = new AuditLogService(
  process.env.AUDIT_SIGNER_KEY     ?? ethers.Wallet.createRandom().privateKey,
  process.env.AUDIT_LOG_ADDRESS    ?? ethers.ZeroAddress,
  process.env.RPC_URL              ?? "http://localhost:8545"
);
