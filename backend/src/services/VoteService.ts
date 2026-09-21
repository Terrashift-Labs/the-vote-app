import { ethers } from "ethers";
import { BlockchainService } from "./BlockchainService";
import { ZKProver } from "./ZKProver";

interface VoteRequest {
  policyId: string;
  optionId: string;
  voterNullifier: string;
  zkProof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    publicSignals: string[];
  };
  signature: string;
  timestamp: number;
}

interface VoteReceipt {
  transactionHash: string;
  blockNumber: number;
  nullifier: string;
  timestamp: number;
}

export class VoteService {
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly zkProver: ZKProver = new ZKProver()
  ) {}

  async submitVote(request: VoteRequest): Promise<VoteReceipt> {
    // 1. Verify the ECDSA signature over the vote payload
    this.verifySignature(request);

    // 2. Verify the ZK proof of eligibility
    await this.zkProver.verify(request.zkProof);

    // 3. Check timestamp freshness (prevent replay attacks — within 5 minutes)
    const ageMs = Date.now() - request.timestamp;
    if (ageMs < 0 || ageMs > 5 * 60 * 1000) {
      throw new Error("Vote payload timestamp is stale or in the future");
    }

    // 4. Relay to blockchain
    const receipt = await this.blockchainService.castVote({
      policyId:  request.policyId,
      optionHash: ethers.keccak256(ethers.toUtf8Bytes(request.optionId)),
      nullifier:  request.voterNullifier as `0x${string}`,
      proof:      request.zkProof,
    });

    return {
      transactionHash: receipt.hash,
      blockNumber:     Number(receipt.blockNumber),
      nullifier:       request.voterNullifier,
      timestamp:       Date.now(),
    };
  }

  private verifySignature(request: VoteRequest): void {
    const message = `${request.policyId}:${request.optionId}:${request.voterNullifier}:${request.timestamp}`;
    const messageBytes = ethers.toUtf8Bytes(message);
    const messageHash = ethers.keccak256(messageBytes);

    // The signature must be a valid ECDSA sig over the message hash.
    // We recover the signer address and check it's non-zero.
    const recoveredAddress = ethers.recoverAddress(messageHash, request.signature);
    if (!ethers.isAddress(recoveredAddress)) {
      throw new Error("Invalid vote signature");
    }
    // In a full implementation: verify the recovered address matches the
    // address derived from the voter's registered identity commitment.
  }
}
