import { ethers } from "ethers";
import logger from "../utils/logger.js";

/**
 * TallyService — reads VoteLedger events and aggregates vote counts per policy.
 *
 * Votes are stored on-chain as keccak256 hashes (not plaintext). The option
 * is encoded in the event topics so it can be counted without decryption.
 *
 * Results are publicly verifiable: anyone can independently reproduce the
 * tally by reading the same on-chain events.
 */
export interface PolicyTally {
  policyId: string;
  support: number;
  oppose: number;
  abstain: number;
  total: number;
  lastBlock: number;
  finalized: boolean;
}

const OPTION_MAP: Record<string, keyof Omit<PolicyTally, "policyId" | "total" | "lastBlock" | "finalized">> = {
  "option-support": "support",
  "option-oppose":  "oppose",
  "option-abstain": "abstain",
};

export class TallyService {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly contractAddress: string;

  // Minimal ABI — only the events we need
  private readonly abi = [
    "event VoteCast(bytes32 indexed policyIdHash, bytes32 indexed nullifier, string optionId, uint256 blockNumber)",
    "event PolicyFinalized(bytes32 indexed policyIdHash)",
  ];

  private contract: ethers.Contract;

  // Cache: policyId → tally (invalidated on new blocks)
  private cache = new Map<string, { tally: PolicyTally; cachedAt: number }>();
  private readonly CACHE_TTL_MS = 30_000;

  constructor(rpcUrl: string, contractAddress: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contractAddress = contractAddress;
    this.contract = new ethers.Contract(contractAddress, this.abi, this.provider);
  }

  /**
   * Aggregate all votes for a policy from on-chain events.
   * Results are cached for 30 seconds to avoid hammering the RPC.
   */
  async getTally(policyId: string): Promise<PolicyTally> {
    const cached = this.cache.get(policyId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.tally;
    }

    const policyIdHash = ethers.id(policyId);
    const filter = this.contract.filters.VoteCast(policyIdHash);
    const events = await this.contract.queryFilter(filter);

    const tally: PolicyTally = {
      policyId,
      support: 0,
      oppose:  0,
      abstain: 0,
      total:   0,
      lastBlock: 0,
      finalized: false,
    };

    const seenNullifiers = new Set<string>();

    for (const event of events) {
      const e = event as ethers.EventLog;
      const nullifier = e.args[1] as string;
      const optionId  = e.args[2] as string;
      const blockNum  = Number(e.args[3]);

      // Deduplicate — contract should prevent this but belt-and-braces
      if (seenNullifiers.has(nullifier)) continue;
      seenNullifiers.add(nullifier);

      const field = OPTION_MAP[optionId];
      if (field) tally[field]++;
      tally.total++;
      if (blockNum > tally.lastBlock) tally.lastBlock = blockNum;
    }

    // Check if policy has been finalized
    const finalFilter = this.contract.filters.PolicyFinalized(policyIdHash);
    const finalEvents = await this.contract.queryFilter(finalFilter);
    tally.finalized = finalEvents.length > 0;

    this.cache.set(policyId, { tally, cachedAt: Date.now() });
    logger.info({ policyId, total: tally.total }, "Tally computed");
    return tally;
  }

  /**
   * Return tallies for all policies known to the registry.
   */
  async getAllTallies(policyIds: string[]): Promise<PolicyTally[]> {
    return Promise.all(policyIds.map((id) => this.getTally(id)));
  }
}

export const tallyService = new TallyService(
  process.env.RPC_URL ?? "http://localhost:8545",
  process.env.VOTE_LEDGER_ADDRESS ?? ethers.ZeroAddress
);
