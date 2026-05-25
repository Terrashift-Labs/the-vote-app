import { ethers } from "ethers";
import { EventEmitter } from "events";
import logger from "../utils/logger.js";
import type { PolicyTally } from "./TallyService.js";

/**
 * LiveTallyService — subscribes to on-chain VoteCast events and emits
 * `tally` events in real time so WebSocket clients receive live updates.
 *
 * Architecture:
 *   VoteLedger (chain) ──VoteCast event──► LiveTallyService ──emit──► WSBroadcaster
 *                                                                          │
 *                                                                   WebSocket clients
 *
 * Each VoteCast event increments an in-process tally snapshot.
 * On reconnect (provider restart), the service re-queries from the last
 * seen block to catch up without double-counting.
 */

export interface LiveTallyUpdate {
  policyId: string;
  tally: PolicyTally;
  blockNumber: number;
}

const ABI = [
  "event VoteCast(bytes32 indexed policyIdHash, bytes32 indexed nullifier, string optionId, uint256 blockNumber)",
  "event PolicyFinalized(bytes32 indexed policyIdHash)",
];

const OPTION_FIELD: Record<string, "support" | "oppose" | "abstain"> = {
  "option-support": "support",
  "option-oppose":  "oppose",
  "option-abstain": "abstain",
};

export class LiveTallyService extends EventEmitter {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly contract: ethers.Contract;

  // In-process tally snapshots; keyed by policyId
  private tallies = new Map<string, PolicyTally>();
  // Map policyIdHash → policyId (populated on first event per policy)
  private hashToId = new Map<string, string>();

  private lastSeenBlock = 0;

  constructor(rpcUrl: string, contractAddress: string) {
    super();
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(contractAddress, ABI, this.provider);
  }

  /**
   * Register a known policyId so the live service can map hashes → IDs.
   * Call this at startup for each known policy.
   */
  trackPolicy(policyId: string): void {
    const hash = ethers.id(policyId);
    this.hashToId.set(hash, policyId);
    if (!this.tallies.has(policyId)) {
      this.tallies.set(policyId, {
        policyId,
        support: 0,
        oppose:  0,
        abstain: 0,
        total:   0,
        lastBlock: 0,
        finalized: false,
      });
    }
  }

  /**
   * Start listening for on-chain events.
   * Catches up from `fromBlock` (useful after a restart to avoid missing events).
   */
  async start(fromBlock = 0): Promise<void> {
    this.lastSeenBlock = fromBlock;

    // Catch-up: replay past events since fromBlock
    if (fromBlock > 0) {
      await this.catchUp(fromBlock);
    }

    // Subscribe to future events
    this.contract.on("VoteCast", this.onVoteCast.bind(this));
    this.contract.on("PolicyFinalized", this.onPolicyFinalized.bind(this));
    logger.info({ fromBlock }, "LiveTallyService listening for VoteCast events");
  }

  stop(): void {
    this.contract.removeAllListeners();
  }

  getSnapshot(policyId: string): PolicyTally | undefined {
    return this.tallies.get(policyId);
  }

  // MARK: - Private

  private async catchUp(fromBlock: number): Promise<void> {
    const filter = this.contract.filters.VoteCast();
    const events = await this.contract.queryFilter(filter, fromBlock);
    for (const evt of events as ethers.EventLog[]) {
      this.applyVoteCast(evt.args[0], evt.args[2], Number(evt.args[3]));
    }
    logger.info({ count: events.length }, "LiveTallyService catch-up complete");
  }

  private onVoteCast(
    policyIdHash: string,
    _nullifier: string,
    optionId: string,
    blockNumber: bigint
  ): void {
    const bn = Number(blockNumber);
    if (bn <= this.lastSeenBlock) return; // guard against replays
    this.lastSeenBlock = bn;
    const update = this.applyVoteCast(policyIdHash, optionId, bn);
    if (update) this.emit("tally", update);
  }

  private onPolicyFinalized(policyIdHash: string): void {
    const policyId = this.hashToId.get(policyIdHash);
    if (!policyId) return;
    const tally = this.tallies.get(policyId);
    if (!tally) return;
    tally.finalized = true;
    this.emit("tally", { policyId, tally: { ...tally }, blockNumber: this.lastSeenBlock });
    logger.info({ policyId }, "Policy finalized");
  }

  private applyVoteCast(
    policyIdHash: string,
    optionId: string,
    blockNumber: number
  ): LiveTallyUpdate | null {
    const policyId = this.hashToId.get(policyIdHash);
    if (!policyId) return null;

    const tally = this.tallies.get(policyId);
    if (!tally) return null;

    const field = OPTION_FIELD[optionId];
    if (field) tally[field]++;
    tally.total++;
    if (blockNumber > tally.lastBlock) tally.lastBlock = blockNumber;

    return { policyId, tally: { ...tally }, blockNumber };
  }
}

export const liveTallyService = new LiveTallyService(
  process.env.RPC_URL ?? "http://localhost:8545",
  process.env.VOTE_LEDGER_ADDRESS ?? ethers.ZeroAddress
);
