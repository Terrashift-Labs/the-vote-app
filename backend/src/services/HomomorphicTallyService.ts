import { ethers } from "ethers";
import { getRedis } from "../redis/RedisClient";
import { logger } from "../utils/logger";

/**
 * HomomorphicTallyService
 *
 * Coordinates the off-chain side of homomorphic vote tallying:
 *
 *  1. Watches for EncryptedVoteAccumulated events from HomomorphicTally.sol.
 *  2. Caches accumulated ciphertext snapshots in Redis for fast API reads.
 *  3. After a poll closes, performs aggregate decryption using the tally
 *     authority's private key (held in an env var / HSM) and posts the result
 *     back on-chain via finaliseDecryption().
 *  4. Verifies the final tally against the on-chain Baby Jubjub point T using
 *     a baby-step giant-step (BSGS) discrete-log search.
 *
 * Key design decisions:
 *  - The private key NEVER leaves this service process; it is loaded from
 *    TALLY_AUTHORITY_PRIVATE_KEY at startup and never logged.
 *  - Decryption is idempotent: if finaliseDecryption() was already called
 *    for a (pollId, optionIndex), the service skips re-submission.
 *  - The BSGS search is bounded by MAX_VOTERS to avoid unbounded computation.
 */

// ── ABI fragments ────────────────────────────────────────────────────────────

const HOMOMORPHIC_TALLY_ABI = [
  "event EncryptedVoteAccumulated(bytes32 indexed pollId, uint256 indexed optionIndex, uint256 newCount)",
  "event TallyFinalised(bytes32 indexed pollId, uint256 indexed optionIndex, uint256 tallyValue)",
  "event PollRegistered(bytes32 indexed pollId, uint256[2] tallyPublicKey, uint256 closeTime)",
  "function getAccumulated(bytes32 pollId, uint256 optionIndex) view returns (uint256 C1x, uint256 C1y, uint256 C2x, uint256 C2y, uint256 count)",
  "function getResult(bytes32 pollId, uint256 optionIndex) view returns (uint256 tallyValue, bool finalised)",
  "function finaliseDecryption(bytes32 pollId, uint256 optionIndex, uint256 tallyValue, uint256[2] T, bytes decryptionProof) external",
  "function polls(bytes32 pollId) view returns (uint256[2] tallyPublicKey, uint256 optionCount, uint256 closeTime, bool exists)",
];

// ── Baby Jubjub constants ─────────────────────────────────────────────────────

const BJJ_P = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
const BJJ_A = BigInt(168700);
const BJJ_D = BigInt(168696);
// Generator G (BASE8 in circomlib)
const BJJ_GX = BigInt("5299619240641551281634865583518297030282874472190772894086521144482721001553");
const BJJ_GY = BigInt("16950150798460657717958625567821834550301663161624707787222815936182638968203");
// Neutral element
const BJJ_NEUTRAL: [bigint, bigint] = [0n, 1n];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CiphertextSnapshot {
  pollId:      string;
  optionIndex: number;
  C1x: string; C1y: string;
  C2x: string; C2y: string;
  count:       number;
  updatedAt:   number;
}

export interface TallyResult {
  pollId:      string;
  optionIndex: number;
  tallyValue:  number;
  finalised:   boolean;
}

// ── Baby Jubjub arithmetic ────────────────────────────────────────────────────

function bjjAdd(
  x1: bigint, y1: bigint,
  x2: bigint, y2: bigint,
): [bigint, bigint] {
  if (x1 === 0n && y1 === 1n) return [x2, y2];
  if (x2 === 0n && y2 === 1n) return [x1, y1];

  const x1x2   = (x1 * x2) % BJJ_P;
  const y1y2   = (y1 * y2) % BJJ_P;
  const dx1x2y1y2 = (BJJ_D * x1x2 % BJJ_P * y1y2) % BJJ_P;

  const x3num  = (x1 * y2 % BJJ_P + y1 * x2 % BJJ_P) % BJJ_P;
  const x3den  = (1n + dx1x2y1y2) % BJJ_P;
  const y3num  = (y1y2 + BJJ_P - BJJ_A * x1x2 % BJJ_P) % BJJ_P;
  const y3den  = (1n + BJJ_P - dx1x2y1y2) % BJJ_P;

  const x3 = x3num * modInv(x3den, BJJ_P) % BJJ_P;
  const y3 = y3num * modInv(y3den, BJJ_P) % BJJ_P;
  return [x3, y3];
}

function bjjScalarMul(scalar: bigint, px: bigint, py: bigint): [bigint, bigint] {
  let [rx, ry] = BJJ_NEUTRAL;
  let [cx, cy] = [px, py];
  let s = scalar;
  while (s > 0n) {
    if (s & 1n) [rx, ry] = bjjAdd(rx, ry, cx, cy);
    [cx, cy] = bjjAdd(cx, cy, cx, cy);
    s >>= 1n;
  }
  return [rx, ry];
}

function bjjNeg(x: bigint, y: bigint): [bigint, bigint] {
  return [(BJJ_P - x) % BJJ_P, y];
}

function modInv(a: bigint, p: bigint): bigint {
  // Extended Euclidean algorithm
  let [old_r, r]   = [a, p];
  let [old_s, s]   = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % p) + p) % p;
}

/**
 * Baby-step giant-step discrete log: find k s.t. k*G = T, 0 ≤ k ≤ maxK.
 * Time/space: O(√maxK).  For maxK = 1_000_000 this is ~1000 steps.
 */
function bsgs(Tx: bigint, Ty: bigint, maxK: number): number | null {
  const m = Math.ceil(Math.sqrt(maxK)) + 1;

  // Baby steps: table[j*G] = j, j ∈ [0, m)
  const table = new Map<string, number>();
  let [bx, by] = BJJ_NEUTRAL;
  for (let j = 0; j < m; j++) {
    table.set(`${bx},${by}`, j);
    [bx, by] = bjjAdd(bx, by, BJJ_GX, BJJ_GY);
  }

  // Giant step: step = m*G (negated for subtraction)
  const [mgx, mgy] = bjjScalarMul(BigInt(m), BJJ_GX, BJJ_GY);
  const [negMgx, negMgy] = bjjNeg(mgx, mgy);

  // Giant steps: T − i*(m*G), i ∈ [0, m)
  let [gx, gy] = [Tx, Ty];
  for (let i = 0; i < m; i++) {
    const key = `${gx},${gy}`;
    const j = table.get(key);
    if (j !== undefined) {
      const k = i * m + j;
      if (k <= maxK) return k;
    }
    [gx, gy] = bjjAdd(gx, gy, negMgx, negMgy);
  }
  return null;
}

// ── Service ───────────────────────────────────────────────────────────────────

const MAX_VOTERS = 10_000_000; // upper bound for BSGS search
const CACHE_TTL  = 3600;       // Redis TTL for ciphertext snapshots (seconds)

export class HomomorphicTallyService {

  private contract: ethers.Contract;
  private signer:   ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private started = false;

  constructor() {
    const rpcUrl      = process.env.BLOCKCHAIN_RPC_URL      ?? "http://localhost:8545";
    const contractAddr = process.env.HOMOMORPHIC_TALLY_ADDR ?? ethers.ZeroAddress;
    const privKey     = process.env.TALLY_AUTHORITY_PRIVATE_KEY ?? "";

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer   = new ethers.Wallet(privKey || ethers.Wallet.createRandom().privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddr, HOMOMORPHIC_TALLY_ABI, this.signer);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Listen for new vote accumulations and update Redis cache
    this.contract.on(
      "EncryptedVoteAccumulated",
      async (pollId: string, optionIndex: bigint) => {
        await this._refreshCache(pollId, Number(optionIndex)).catch((err) =>
          logger.error({ err, pollId, optionIndex }, "Failed to refresh ciphertext cache")
        );
      }
    );

    // Auto-finalise polls that have closed
    this.contract.on(
      "PollRegistered",
      (pollId: string, _pk: unknown, closeTime: bigint) => {
        const msUntilClose = Number(closeTime) * 1000 - Date.now();
        if (msUntilClose > 0) {
          setTimeout(() => this._finaliseAll(pollId), msUntilClose + 5000); // +5s buffer for last votes
        }
      }
    );

    logger.info("HomomorphicTallyService started");
  }

  stop(): void {
    this.contract.removeAllListeners();
    this.started = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Return cached ciphertext snapshots for all options of a poll.
   * Falls back to on-chain read if cache is cold.
   */
  async getCiphertexts(pollId: string): Promise<CiphertextSnapshot[]> {
    const redis = getRedis();
    const pollData = await this.contract.polls(pollId);
    if (!pollData.exists) return [];

    const optionCount = Number(pollData.optionCount);
    const results: CiphertextSnapshot[] = [];

    for (let i = 0; i < optionCount; i++) {
      const cached = await redis.get(`htally:ct:${pollId}:${i}`);
      if (cached) {
        results.push(JSON.parse(cached) as CiphertextSnapshot);
      } else {
        const snap = await this._refreshCache(pollId, i);
        if (snap) results.push(snap);
      }
    }
    return results;
  }

  /**
   * Return decrypted tally results for a poll (only available after finalisation).
   */
  async getTallyResults(pollId: string): Promise<TallyResult[]> {
    const pollData = await this.contract.polls(pollId);
    if (!pollData.exists) return [];

    const optionCount = Number(pollData.optionCount);
    const out: TallyResult[] = [];
    for (let i = 0; i < optionCount; i++) {
      const [tallyValue, finalised] = await this.contract.getResult(pollId, i);
      out.push({ pollId, optionIndex: i, tallyValue: Number(tallyValue), finalised });
    }
    return out;
  }

  // ── Decryption ────────────────────────────────────────────────────────────

  /**
   * Finalise all options for a poll:
   *  1. Read accumulated (ΣC1, ΣC2) from chain.
   *  2. Compute T = ΣC2 − sk·(ΣC1).
   *  3. Run BSGS to recover Σv = tallyValue.
   *  4. Submit finaliseDecryption() on-chain.
   */
  private async _finaliseAll(pollId: string): Promise<void> {
    const pollData = await this.contract.polls(pollId);
    if (!pollData.exists) return;
    if (Number(pollData.closeTime) * 1000 > Date.now()) return; // not closed yet

    const optionCount = Number(pollData.optionCount);
    for (let i = 0; i < optionCount; i++) {
      await this._finaliseOption(pollId, i).catch((err) =>
        logger.error({ err, pollId, optionIndex: i }, "Failed to finalise option")
      );
    }
  }

  private async _finaliseOption(pollId: string, optionIndex: number): Promise<void> {
    const [, alreadyFinalised] = await this.contract.getResult(pollId, optionIndex);
    if (alreadyFinalised) return;

    const [C1x, C1y, C2x, C2y] = await this.contract.getAccumulated(pollId, optionIndex);

    // T = ΣC2 − sk·(ΣC1)
    // sk is the tally authority private key (as a bigint scalar)
    const sk = BigInt(await this._getTallyPrivateKey());

    const [skC1x, skC1y] = bjjScalarMul(sk, BigInt(C1x.toString()), BigInt(C1y.toString()));
    const [negSkC1x, negSkC1y] = bjjNeg(skC1x, skC1y);
    const [Tx, Ty] = bjjAdd(
      BigInt(C2x.toString()), BigInt(C2y.toString()),
      negSkC1x, negSkC1y,
    );

    // Recover Σv via BSGS
    const tallyValue = bsgs(Tx, Ty, MAX_VOTERS);
    if (tallyValue === null) {
      logger.error({ pollId, optionIndex }, "BSGS failed — tally exceeds MAX_VOTERS or invalid ciphertext");
      return;
    }

    // Build a Chaum-Pedersen proof of correct decryption.
    // In production this would be a full Schnorr-based NIZK; here we produce a
    // placeholder that can be replaced when the proof library is integrated.
    const decryptionProof = this._buildDecryptionProof(sk, C1x, C1y, C2x, C2y, Tx, Ty);

    const tx = await this.contract.finaliseDecryption(
      pollId,
      optionIndex,
      tallyValue,
      [Tx, Ty],
      decryptionProof,
    );
    await tx.wait();
    logger.info({ pollId, optionIndex, tallyValue, txHash: tx.hash }, "Tally finalised");
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async _refreshCache(pollId: string, optionIndex: number): Promise<CiphertextSnapshot | null> {
    try {
      const [C1x, C1y, C2x, C2y, count] = await this.contract.getAccumulated(pollId, optionIndex);
      const snap: CiphertextSnapshot = {
        pollId, optionIndex,
        C1x: C1x.toString(), C1y: C1y.toString(),
        C2x: C2x.toString(), C2y: C2y.toString(),
        count:     Number(count),
        updatedAt: Date.now(),
      };
      const redis = getRedis();
      await redis.set(`htally:ct:${pollId}:${optionIndex}`, JSON.stringify(snap), "EX", CACHE_TTL);
      return snap;
    } catch (err) {
      logger.error({ err, pollId, optionIndex }, "Failed to read accumulated ciphertext");
      return null;
    }
  }

  /**
   * Load the tally authority private key scalar.
   * In production: delegate to an HSM or KMS via env var / secrets manager.
   */
  private async _getTallyPrivateKey(): Promise<string> {
    const key = process.env.TALLY_AUTHORITY_PRIVATE_KEY;
    if (!key) throw new Error("TALLY_AUTHORITY_PRIVATE_KEY not set");
    // Return as decimal bigint string for BJJ arithmetic
    return BigInt(key).toString();
  }

  /**
   * Placeholder Chaum-Pedersen decryption proof.
   *
   * Full protocol (for reference):
   *   Prover knows sk s.t. PK = sk*G and T = ΣC2 − sk*(ΣC1).
   *   1. Pick random nonce k; compute R1 = k*G, R2 = k*(ΣC1).
   *   2. Compute challenge c = H(PK, ΣC1, T, R1, R2).
   *   3. Compute response s = k − c*sk (mod BJJ order).
   *   Verify: s*G + c*PK == R1  AND  s*(ΣC1) + c*T_neg == R2
   *
   * Replace this stub with the full implementation before mainnet deployment.
   */
  private _buildDecryptionProof(
    sk: bigint,
    C1x: bigint, C1y: bigint,
    _C2x: bigint, _C2y: bigint,
    Tx: bigint, Ty: bigint,
  ): Uint8Array {
    // Encode (T, stub_signature) as proof bytes — verifier stub accepts this
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "bytes32"],
      [Tx, Ty, ethers.keccak256(ethers.toUtf8Bytes(`${C1x},${C1y},${sk % 1000n}`))], // sk % 1000 to avoid logging key
    );
    return ethers.getBytes(encoded);
  }
}

export const homomorphicTallyService = new HomomorphicTallyService();
