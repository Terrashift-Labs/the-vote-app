import { ethers, JsonRpcProvider, Wallet, Contract, TransactionReceipt } from "ethers";

// ABI slices — only the functions we call from the backend
const VOTE_LEDGER_ABI = [
  "function castVote(bytes32 pollId, bytes32 optionHash, bytes32 nullifier, tuple(uint256[2] piA, uint256[2][2] piB, uint256[2] piC, uint256[] publicSignals) proof) external",
  "function getTally(bytes32 pollId, bytes32 optionHash) external view returns (uint256)",
  "function getPollMeta(bytes32 pollId) external view returns (bytes2 countryCode, uint64 deadline, bool finalised, uint256 totalVotes)",
  "function isNullifierSpent(bytes32 nullifier) external view returns (bool)",
];

const POLICY_REGISTRY_ABI = [
  "function getPolicy(string policyId) external view returns (tuple(bytes2 countryCode, bytes32 documentHash, string ipfsCID, uint64 createdAt, bool active))",
];

interface CastVoteParams {
  policyId:   string;
  optionHash: string;
  nullifier:  `0x${string}`;
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    publicSignals: string[];
  };
}

export class BlockchainService {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private voteLedger: Contract;
  private policyRegistry: Contract;

  constructor() {
    this.provider = new JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new Wallet(process.env.RELAY_PRIVATE_KEY!, this.provider);
    this.voteLedger = new Contract(
      process.env.VOTE_LEDGER_ADDRESS!,
      VOTE_LEDGER_ABI,
      this.wallet
    );
    this.policyRegistry = new Contract(
      process.env.POLICY_REGISTRY_ADDRESS!,
      POLICY_REGISTRY_ABI,
      this.provider
    );
  }

  async castVote(params: CastVoteParams): Promise<TransactionReceipt> {
    const pollId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "bytes2"],
        [params.policyId, ethers.toUtf8Bytes(this.getCountryCode(params.policyId))]
      )
    );

    const proof = {
      piA: params.proof.pi_a.map(BigInt),
      piB: params.proof.pi_b.map((row) => row.map(BigInt)),
      piC: params.proof.pi_c.map(BigInt),
      publicSignals: params.proof.publicSignals.map(BigInt),
    };

    const tx = await this.voteLedger.castVote(
      pollId,
      params.optionHash,
      params.nullifier,
      proof
    );
    const receipt = await tx.wait(1); // wait for 1 confirmation
    if (!receipt) throw new Error("Transaction receipt not found");
    return receipt;
  }

  async isNullifierSpent(nullifier: string): Promise<boolean> {
    return this.voteLedger.isNullifierSpent(nullifier);
  }

  async getResults(policyId: string): Promise<{
    policyId: string;
    totalVotes: string;
    isFinalised: boolean;
  }> {
    const pollId = ethers.keccak256(ethers.toUtf8Bytes(policyId));
    const meta = await this.voteLedger.getPollMeta(pollId);
    return {
      policyId,
      totalVotes:  meta.totalVotes.toString(),
      isFinalised: meta.finalised,
    };
  }

  async getReceipt(txHash: string): Promise<{ transactionHash: string; blockNumber: number; status: "success" | "reverted" } | null> {
    const r = await this.provider.getTransactionReceipt(txHash);
    if (!r) return null;
    return { transactionHash: r.hash, blockNumber: r.blockNumber, status: r.status === 1 ? "success" : "reverted" };
  }

  private getCountryCode(policyId: string): string {
    // In production, look up from PolicyRegistry or database
    return "GB";
  }
}
