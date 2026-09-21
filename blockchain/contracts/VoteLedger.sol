// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./VoterRegistry.sol";
import "./IZKVerifier.sol";

/**
 * @title VoteLedger
 * @notice Immutable, anonymised vote ledger secured by zero-knowledge proofs.
 *
 * Security model:
 *   - Each vote is accompanied by a Groth16 ZK proof that the voter's
 *     identity commitment is in the VoterRegistry Merkle tree.
 *   - A per-voter, per-policy nullifier prevents double-voting without
 *     revealing the voter's identity.
 *   - Vote options are stored as hashes — raw content is never on-chain.
 *   - The owner can close a poll but can NEVER delete or alter existing votes.
 */
contract VoteLedger is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    struct Poll {
        bytes2   countryCode;
        bytes32  policyHash;        // keccak256(policyId)
        uint64   deadline;          // unix timestamp
        bool     finalised;
        uint256  totalVotes;
        mapping(bytes32 => uint256) optionTally; // optionHash → count
    }

    struct ZKProofData {
        uint256[2]   piA;
        uint256[2][2] piB;
        uint256[2]   piC;
        uint256[]    publicSignals;
    }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    VoterRegistry public voterRegistry;
    IZKVerifier   public zkVerifier;

    /// pollId → Poll
    mapping(bytes32 => Poll) private _polls;

    /// Spent nullifiers — prevents double-voting
    mapping(bytes32 => bool) private _nullifiers;

    /// All nullifiers in insertion order (for off-chain Merkle tree construction)
    bytes32[] public nullifierList;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event PollCreated(bytes32 indexed pollId, bytes2 indexed countryCode, uint64 deadline);
    event VoteCast(bytes32 indexed pollId, bytes32 indexed nullifier, bytes32 optionHash);
    event PollFinalised(bytes32 indexed pollId, uint256 totalVotes);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error PollNotFound();
    error PollClosed();
    error PollAlreadyFinalised();
    error NullifierSpent();
    error InvalidZKProof();
    error DeadlineInPast();

    // -----------------------------------------------------------------------
    // Initialiser
    // -----------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address initialOwner,
        address voterRegistryAddress,
        address zkVerifierAddress
    ) external initializer {
        __Ownable_init(initialOwner);
        __Pausable_init();
        voterRegistry = VoterRegistry(voterRegistryAddress);
        zkVerifier = IZKVerifier(zkVerifierAddress);
    }

    // -----------------------------------------------------------------------
    // Poll management
    // -----------------------------------------------------------------------

    /**
     * @notice Create a new poll for a country policy.
     * @param policyId   String policy identifier, hashed on-chain
     * @param countryCode ISO 3166-1 alpha-2
     * @param deadline   Unix timestamp for poll close
     */
    function createPoll(
        string calldata policyId,
        bytes2 countryCode,
        uint64 deadline
    ) external onlyOwner returns (bytes32 pollId) {
        if (deadline <= block.timestamp) revert DeadlineInPast();
        pollId = keccak256(abi.encodePacked(policyId, countryCode));

        Poll storage poll = _polls[pollId];
        poll.countryCode = countryCode;
        poll.policyHash  = keccak256(bytes(policyId));
        poll.deadline    = deadline;

        emit PollCreated(pollId, countryCode, deadline);
    }

    // -----------------------------------------------------------------------
    // Vote submission
    // -----------------------------------------------------------------------

    /**
     * @notice Cast an anonymous vote.
     *
     * @param pollId      Target poll
     * @param optionHash  keccak256(optionId) — keeps option labels off-chain
     * @param nullifier   H(voterSecret || policyId) — unique per voter per poll
     * @param proof       Groth16 proof: voter's commitment is in the registry tree
     *
     * The ZK proof's public inputs must be:
     *   [0] = Merkle root of VoterRegistry commitments
     *   [1] = nullifier
     *   [2] = pollId (as uint256)
     */
    function castVote(
        bytes32 pollId,
        bytes32 optionHash,
        bytes32 nullifier,
        ZKProofData calldata proof
    ) external whenNotPaused {
        Poll storage poll = _polls[pollId];
        if (poll.deadline == 0)             revert PollNotFound();
        if (block.timestamp > poll.deadline) revert PollClosed();
        if (poll.finalised)                  revert PollAlreadyFinalised();
        if (_nullifiers[nullifier])          revert NullifierSpent();

        // Verify zero-knowledge proof
        bool valid = zkVerifier.verifyProof(
            proof.piA,
            proof.piB,
            proof.piC,
            proof.publicSignals
        );
        if (!valid) revert InvalidZKProof();

        // Record vote — irrevocable
        _nullifiers[nullifier] = true;
        nullifierList.push(nullifier);
        poll.optionTally[optionHash]++;
        poll.totalVotes++;

        emit VoteCast(pollId, nullifier, optionHash);
    }

    // -----------------------------------------------------------------------
    // Finalisation & results
    // -----------------------------------------------------------------------

    function finalisePoll(bytes32 pollId) external onlyOwner {
        Poll storage poll = _polls[pollId];
        if (poll.deadline == 0)  revert PollNotFound();
        if (poll.finalised)      revert PollAlreadyFinalised();
        poll.finalised = true;
        emit PollFinalised(pollId, poll.totalVotes);
    }

    function getTally(bytes32 pollId, bytes32 optionHash)
        external
        view
        returns (uint256)
    {
        return _polls[pollId].optionTally[optionHash];
    }

    function getPollMeta(bytes32 pollId)
        external
        view
        returns (bytes2 countryCode, uint64 deadline, bool finalised, uint256 totalVotes)
    {
        Poll storage poll = _polls[pollId];
        return (poll.countryCode, poll.deadline, poll.finalised, poll.totalVotes);
    }

    function isNullifierSpent(bytes32 nullifier) external view returns (bool) {
        return _nullifiers[nullifier];
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
