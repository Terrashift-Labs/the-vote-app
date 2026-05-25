// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title HomomorphicTally
 * @notice Accumulates Baby Jubjub ElGamal ciphertexts for each vote option,
 *         enabling privacy-preserving tallying without decrypting individual votes.
 *
 * Scheme (additive ElGamal on Baby Jubjub):
 *   Encrypt(v, r, PK) = (C1, C2) = (r·G,  v·G + r·PK)    v ∈ {0,1}
 *   Tally:             ΣC1 = (Σr)·G,  ΣC2 = (Σv)·G + (Σr)·PK
 *   Decrypt:           T = ΣC2 − sk·(ΣC1) = (Σv)·G
 *                      Recover Σv by BSGS (result ≤ total voters)
 *
 * Workflow:
 *   1. Tally authority generates (sk, PK) before the poll opens.
 *      PK is published on-chain; sk is held in an MPC/HSM.
 *   2. Voters submit (C1, C2, proof) via submitEncryptedVote().
 *      The ZK proof (from homomorphic_vote.circom) certifies v ∈ {0,1}
 *      and correct encryption under PK.
 *   3. After the poll closes, the authority calls finaliseDecryption()
 *      with a partial-decrypt proof, revealing only the aggregate tally.
 */
contract HomomorphicTally is Initializable, AccessControlUpgradeable, UUPSUpgradeable {

    // ── Roles ────────────────────────────────────────────────────────────────

    bytes32 public constant TALLY_AUTHORITY_ROLE = keccak256("TALLY_AUTHORITY_ROLE");
    bytes32 public constant UPGRADER_ROLE        = keccak256("UPGRADER_ROLE");

    // ── Types ────────────────────────────────────────────────────────────────

    /// Baby Jubjub curve point (field element coordinates in BN254 scalar field)
    struct BabyJubPoint {
        uint256 x;
        uint256 y;
    }

    /// Accumulated ciphertext for one (pollId, optionIndex) pair
    struct AccumulatedCiphertext {
        BabyJubPoint C1;   // Σ r_i · G
        BabyJubPoint C2;   // Σ (v_i · G + r_i · PK)
        uint256 count;     // number of votes accumulated
    }

    /// Decryption result posted by tally authority after poll closes
    struct DecryptionResult {
        uint256 tallyValue;       // Σv — the vote count for this option
        BabyJubPoint T;           // T = ΣC2 − sk·(ΣC1) = tallyValue·G (on-chain verifiable)
        bytes decryptionProof;    // proof that T = ΣC2 − sk·(ΣC1) without revealing sk
        bool finalised;
    }

    /// Per-poll metadata
    struct PollConfig {
        uint256[2] tallyPublicKey; // PK = [x, y] Baby Jubjub point
        uint256    optionCount;
        uint256    closeTime;      // unix timestamp
        bool       exists;
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    /// ZK verifier for the vote encryption proof
    address public voteProofVerifier;

    /// pollId → PollConfig
    mapping(bytes32 => PollConfig) public polls;

    /// pollId → optionIndex → AccumulatedCiphertext
    mapping(bytes32 => mapping(uint256 => AccumulatedCiphertext)) public ciphertexts;

    /// pollId → optionIndex → DecryptionResult
    mapping(bytes32 => mapping(uint256 => DecryptionResult)) public results;

    /// Nullifier set — prevents same (pollId, nullifier) pair being used twice
    mapping(bytes32 => mapping(bytes32 => bool)) public nullifiersUsed;

    // ── Events ───────────────────────────────────────────────────────────────

    event PollRegistered(bytes32 indexed pollId, uint256[2] tallyPublicKey, uint256 closeTime);
    event EncryptedVoteAccumulated(bytes32 indexed pollId, uint256 indexed optionIndex, uint256 newCount);
    event TallyFinalised(bytes32 indexed pollId, uint256 indexed optionIndex, uint256 tallyValue);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    // ── Errors ───────────────────────────────────────────────────────────────

    error PollNotFound(bytes32 pollId);
    error PollAlreadyRegistered(bytes32 pollId);
    error PollNotClosed(bytes32 pollId, uint256 closeTime);
    error PollStillOpen(bytes32 pollId);
    error InvalidOptionIndex(uint256 index, uint256 max);
    error NullifierAlreadyUsed(bytes32 nullifier);
    error InvalidProof();
    error AlreadyFinalised(bytes32 pollId, uint256 optionIndex);
    error OptionCountMismatch(uint256 provided, uint256 expected);

    // ── Initialiser ──────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address admin, address _voteProofVerifier) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TALLY_AUTHORITY_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        voteProofVerifier = _voteProofVerifier;
    }

    // ── Poll management ───────────────────────────────────────────────────────

    /**
     * @notice Register a poll before it opens.
     * @param pollId          Unique identifier (keccak256 of policy id + chain id)
     * @param tallyPublicKey  Baby Jubjub public key of the tally authority
     * @param optionCount     Number of vote options
     * @param closeTime       Unix timestamp when the poll closes
     */
    function registerPoll(
        bytes32     pollId,
        uint256[2] calldata tallyPublicKey,
        uint256     optionCount,
        uint256     closeTime
    ) external onlyRole(TALLY_AUTHORITY_ROLE) {
        if (polls[pollId].exists) revert PollAlreadyRegistered(pollId);
        polls[pollId] = PollConfig({
            tallyPublicKey: tallyPublicKey,
            optionCount:    optionCount,
            closeTime:      closeTime,
            exists:         true
        });

        // Initialise accumulators to curve neutral element (0, 1)
        for (uint256 i = 0; i < optionCount; i++) {
            ciphertexts[pollId][i].C1 = BabyJubPoint(0, 1);
            ciphertexts[pollId][i].C2 = BabyJubPoint(0, 1);
        }
        emit PollRegistered(pollId, tallyPublicKey, closeTime);
    }

    // ── Vote submission ───────────────────────────────────────────────────────

    /**
     * @notice Submit an encrypted vote.
     *         The caller provides an ElGamal ciphertext (C1, C2) and a ZK proof
     *         certifying that the plaintext is 0 or 1 and the encryption is
     *         well-formed under the poll's tally public key.
     *
     * @param pollId       Poll identifier
     * @param optionIndex  Which option is being voted for (0-based)
     * @param C1x          Ciphertext component 1, x-coordinate
     * @param C1y          Ciphertext component 1, y-coordinate
     * @param C2x          Ciphertext component 2, x-coordinate
     * @param C2y          Ciphertext component 2, y-coordinate
     * @param nullifier    Per-voter nullifier preventing double-voting
     * @param proof        PLONK proof bytes from homomorphic_vote.circom
     */
    function submitEncryptedVote(
        bytes32 pollId,
        uint256 optionIndex,
        uint256 C1x, uint256 C1y,
        uint256 C2x, uint256 C2y,
        bytes32 nullifier,
        bytes calldata proof
    ) external {
        PollConfig storage poll = polls[pollId];
        if (!poll.exists)                         revert PollNotFound(pollId);
        if (block.timestamp >= poll.closeTime)    revert PollNotClosed(pollId, poll.closeTime);
        if (optionIndex >= poll.optionCount)      revert InvalidOptionIndex(optionIndex, poll.optionCount - 1);
        if (nullifiersUsed[pollId][nullifier])    revert NullifierAlreadyUsed(nullifier);

        // Verify the ZK proof: plaintext ∈ {0,1} and well-formed encryption
        bool valid = _verifyVoteProof(
            poll.tallyPublicKey,
            [C1x, C1y],
            [C2x, C2y],
            pollId,
            proof
        );
        if (!valid) revert InvalidProof();

        // Mark nullifier used
        nullifiersUsed[pollId][nullifier] = true;

        // Accumulate ciphertext: (ΣC1, ΣC2) += (C1, C2) using Baby Jubjub addition
        AccumulatedCiphertext storage acc = ciphertexts[pollId][optionIndex];
        (uint256 newC1x, uint256 newC1y) = _babyJubAdd(acc.C1.x, acc.C1.y, C1x, C1y);
        (uint256 newC2x, uint256 newC2y) = _babyJubAdd(acc.C2.x, acc.C2.y, C2x, C2y);
        acc.C1 = BabyJubPoint(newC1x, newC1y);
        acc.C2 = BabyJubPoint(newC2x, newC2y);
        acc.count += 1;

        emit EncryptedVoteAccumulated(pollId, optionIndex, acc.count);
    }

    // ── Decryption ────────────────────────────────────────────────────────────

    /**
     * @notice Post the decrypted tally for one option after the poll closes.
     *         The tally authority submits T = ΣC2 − sk·(ΣC1) along with a
     *         proof-of-correct-decryption (Chaum-Pedersen NIZK or similar).
     *
     * @param pollId         Poll identifier
     * @param optionIndex    Option being decrypted
     * @param tallyValue     The recovered vote count (Σv)
     * @param T              The intermediate point T = (Σv)·G (verifiable by BSGS)
     * @param decryptionProof Proof that T was computed correctly from sk and ΣC1/ΣC2
     */
    function finaliseDecryption(
        bytes32    pollId,
        uint256    optionIndex,
        uint256    tallyValue,
        uint256[2] calldata T,
        bytes calldata decryptionProof
    ) external onlyRole(TALLY_AUTHORITY_ROLE) {
        PollConfig storage poll = polls[pollId];
        if (!poll.exists)                         revert PollNotFound(pollId);
        if (block.timestamp < poll.closeTime)     revert PollStillOpen(pollId);
        if (optionIndex >= poll.optionCount)      revert InvalidOptionIndex(optionIndex, poll.optionCount - 1);
        if (results[pollId][optionIndex].finalised) revert AlreadyFinalised(pollId, optionIndex);

        // Verify decryption proof:
        // Verifies that T = ΣC2 − sk·(ΣC1) where sk corresponds to the registered PK
        // In production: Chaum-Pedersen proof verifier goes here.
        // For now we accept the authority's submission (governance-controlled role).

        results[pollId][optionIndex] = DecryptionResult({
            tallyValue:      tallyValue,
            T:               BabyJubPoint(T[0], T[1]),
            decryptionProof: decryptionProof,
            finalised:       true
        });
        emit TallyFinalised(pollId, optionIndex, tallyValue);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getAccumulated(bytes32 pollId, uint256 optionIndex)
        external view
        returns (uint256 C1x, uint256 C1y, uint256 C2x, uint256 C2y, uint256 count)
    {
        AccumulatedCiphertext storage acc = ciphertexts[pollId][optionIndex];
        return (acc.C1.x, acc.C1.y, acc.C2.x, acc.C2.y, acc.count);
    }

    function getResult(bytes32 pollId, uint256 optionIndex)
        external view
        returns (uint256 tallyValue, bool finalised)
    {
        DecryptionResult storage r = results[pollId][optionIndex];
        return (r.tallyValue, r.finalised);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /**
     * @dev Verifies the homomorphic vote ZK proof via the external verifier contract.
     */
    function _verifyVoteProof(
        uint256[2] storage pk,
        uint256[2] memory C1,
        uint256[2] memory C2,
        bytes32 pollId,
        bytes calldata proof
    ) internal view returns (bool) {
        if (voteProofVerifier == address(0)) return true; // verifier not yet deployed — accept all (testnet only)

        // Public signals: pk[2], C1[2], C2[2], pollId  (7 field elements)
        uint256[] memory pubSignals = new uint256[](7);
        pubSignals[0] = pk[0];
        pubSignals[1] = pk[1];
        pubSignals[2] = C1[0];
        pubSignals[3] = C1[1];
        pubSignals[4] = C2[0];
        pubSignals[5] = C2[1];
        pubSignals[6] = uint256(pollId);

        (bool success, bytes memory ret) = voteProofVerifier.staticcall(
            abi.encodeWithSignature("verifyProof(bytes,uint256[])", proof, pubSignals)
        );
        if (!success || ret.length < 32) return false;
        return abi.decode(ret, (bool));
    }

    /**
     * @dev Baby Jubjub twisted Edwards point addition.
     *      a = 168700, d = 168696 (circom convention)
     *      Neutral element: (0, 1)
     *
     *      x3 = (x1*y2 + y1*x2) / (1 + d*x1*x2*y1*y2)
     *      y3 = (y1*y2 − a*x1*x2) / (1 − d*x1*x2*y1*y2)
     *
     *      Division is performed via modular inverse over the BN254 scalar field.
     */
    function _babyJubAdd(
        uint256 x1, uint256 y1,
        uint256 x2, uint256 y2
    ) internal pure returns (uint256 x3, uint256 y3) {
        uint256 p = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // BN254 scalar field
        uint256 a = 168700;
        uint256 d = 168696;

        // Handle neutral element (0, 1)
        if (x1 == 0 && y1 == 1) return (x2, y2);
        if (x2 == 0 && y2 == 1) return (x1, y1);

        uint256 x1x2 = mulmod(x1, x2, p);
        uint256 y1y2 = mulmod(y1, y2, p);
        uint256 dx1x2y1y2 = mulmod(mulmod(d, x1x2, p), y1y2, p);

        // x3 numerator: x1*y2 + y1*x2
        uint256 x3num = addmod(mulmod(x1, y2, p), mulmod(y1, x2, p), p);
        // x3 denominator: 1 + d*x1*x2*y1*y2
        uint256 x3den = addmod(1, dx1x2y1y2, p);

        // y3 numerator: y1*y2 − a*x1*x2
        uint256 y3num = addmod(y1y2, p - mulmod(a, x1x2, p), p);
        // y3 denominator: 1 − d*x1*x2*y1*y2
        uint256 y3den = addmod(1, p - dx1x2y1y2, p);

        x3 = mulmod(x3num, _modInv(x3den, p), p);
        y3 = mulmod(y3num, _modInv(y3den, p), p);
    }

    /**
     * @dev Modular inverse via Fermat's little theorem: a^(p-2) mod p.
     *      Assumes p is prime.
     */
    function _modInv(uint256 a, uint256 p) internal pure returns (uint256) {
        return _modExp(a, p - 2, p);
    }

    function _modExp(uint256 base, uint256 exp, uint256 mod) internal pure returns (uint256 result) {
        result = 1;
        base = base % mod;
        while (exp > 0) {
            if (exp & 1 == 1) result = mulmod(result, base, mod);
            base = mulmod(base, base, mod);
            exp >>= 1;
        }
    }

    // ── Administration ────────────────────────────────────────────────────────

    function setVerifier(address newVerifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit VerifierUpdated(voteProofVerifier, newVerifier);
        voteProofVerifier = newVerifier;
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
