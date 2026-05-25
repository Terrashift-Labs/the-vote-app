// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SymTest} from "halmos-cheatcodes/src/SymTest.sol";
import {VoteLedger} from "../../contracts/VoteLedger.sol";
import {VoterRegistry} from "../../contracts/VoterRegistry.sol";
import {StubZKVerifier} from "../../contracts/StubZKVerifier.sol";

/**
 * @title VoteLedgerFormalSpec
 * @notice Halmos symbolic-execution tests for VoteLedger and VoterRegistry.
 *
 * Each `check_*` function is a property that Halmos verifies holds for ALL
 * possible symbolic inputs — not just sampled values.
 *
 * Properties verified:
 *   1. No double-voting: a spent nullifier always causes revert
 *   2. Finalised poll rejects all new votes
 *   3. totalVotes is monotonically non-decreasing
 *   4. Pause blocks all vote submissions
 *   5. VoterRegistry: commitment zero always reverts
 *   6. VoterRegistry: double registration always reverts
 *
 * Run with:
 *   halmos --contract VoteLedgerFormalSpec --solver z3
 */
contract VoteLedgerFormalSpec is Test, SymTest {

    VoteLedger     internal ledger;
    VoterRegistry  internal registry;
    StubZKVerifier internal verifier;

    // Fixed poll used across tests
    bytes32 internal POLL_ID;
    bytes2  internal constant COUNTRY = 0x4742; // "GB"
    uint64  internal constant DEADLINE_OFFSET = 365 days;

    // Minimal stub ZK proof that StubZKVerifier accepts
    VoteLedger.ZKProofData internal STUB_PROOF;

    function setUp() public {
        // Deploy implementations (no proxy for formal tests — proxy logic
        // is verified separately; here we test the business logic invariants)
        registry = new VoterRegistry();
        registry.initialize(address(this));

        verifier = new StubZKVerifier();

        ledger = new VoteLedger();
        ledger.initialize(address(this), address(registry), address(verifier));

        // Create a poll with a far-future deadline
        POLL_ID = ledger.createPoll(
            "pol-001",
            COUNTRY,
            uint64(block.timestamp + DEADLINE_OFFSET)
        );

        // Populate stub proof with zeros (StubZKVerifier ignores them)
        STUB_PROOF.piA = [uint256(0), uint256(0)];
        STUB_PROOF.piB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        STUB_PROOF.piC = [uint256(0), uint256(0)];
        STUB_PROOF.publicSignals = new uint256[](0);
    }

    // ── Property 1: No double-voting ─────────────────────────────────────────

    /**
     * For any symbolic (nullifier, optionHash), if the first castVote succeeds,
     * then a second castVote with the same nullifier MUST revert with NullifierSpent.
     */
    function check_noDoubleVote(bytes32 nullifier, bytes32 optionHash) public {
        vm.assume(nullifier != bytes32(0));

        // First vote — should succeed
        ledger.castVote(POLL_ID, optionHash, nullifier, STUB_PROOF);

        // Second vote with the same nullifier — must revert
        vm.expectRevert(VoteLedger.NullifierSpent.selector);
        ledger.castVote(POLL_ID, optionHash, nullifier, STUB_PROOF);
    }

    // ── Property 2: Finalised poll rejects votes ──────────────────────────────

    /**
     * Once finalisePoll is called, castVote always reverts with PollAlreadyFinalised,
     * regardless of the nullifier or option.
     */
    function check_finalisedPollRejectsVotes(bytes32 nullifier, bytes32 optionHash) public {
        vm.assume(nullifier != bytes32(0));

        ledger.finalisePoll(POLL_ID);

        vm.expectRevert(VoteLedger.PollAlreadyFinalised.selector);
        ledger.castVote(POLL_ID, optionHash, nullifier, STUB_PROOF);
    }

    // ── Property 3: totalVotes never decreases ────────────────────────────────

    /**
     * After a successful castVote, totalVotes increases by exactly 1.
     * Symbolically: for any valid (nullifier, optionHash), the invariant holds.
     */
    function check_totalVotesIncrementsByOne(bytes32 nullifier, bytes32 optionHash) public {
        vm.assume(nullifier != bytes32(0));

        (, , , uint256 before) = ledger.getPollMeta(POLL_ID);
        ledger.castVote(POLL_ID, optionHash, nullifier, STUB_PROOF);
        (, , , uint256 after_) = ledger.getPollMeta(POLL_ID);

        assert(after_ == before + 1);
    }

    // ── Property 4: Pause blocks all votes ───────────────────────────────────

    /**
     * When the contract is paused, castVote must revert for ANY inputs.
     */
    function check_pauseBlocksAllVotes(bytes32 nullifier, bytes32 optionHash) public {
        vm.assume(nullifier != bytes32(0));

        ledger.pause();

        vm.expectRevert(); // EnforcedPause from OZ Pausable
        ledger.castVote(POLL_ID, optionHash, nullifier, STUB_PROOF);
    }

    // ── Property 5: Unknown poll reverts ─────────────────────────────────────

    /**
     * Casting a vote for a non-existent pollId must always revert.
     */
    function check_unknownPollReverts(
        bytes32 unknownPollId,
        bytes32 nullifier,
        bytes32 optionHash
    ) public {
        vm.assume(unknownPollId != POLL_ID);
        vm.assume(nullifier != bytes32(0));

        vm.expectRevert(VoteLedger.PollNotFound.selector);
        ledger.castVote(unknownPollId, optionHash, nullifier, STUB_PROOF);
    }

    // ── Property 6: Nullifier list length matches totalVotes ─────────────────

    /**
     * After N successful votes, nullifierList.length == totalVotes.
     * Checked after 2 distinct votes.
     */
    function check_nullifierListConsistency(
        bytes32 n1,
        bytes32 n2,
        bytes32 opt
    ) public {
        vm.assume(n1 != bytes32(0) && n2 != bytes32(0));
        vm.assume(n1 != n2); // distinct nullifiers

        ledger.castVote(POLL_ID, opt, n1, STUB_PROOF);
        ledger.castVote(POLL_ID, opt, n2, STUB_PROOF);

        (, , , uint256 total) = ledger.getPollMeta(POLL_ID);
        assert(ledger.nullifierList(0) == n1);
        assert(ledger.nullifierList(1) == n2);
        assert(total == 2);
    }
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * @title VoterRegistryFormalSpec
 * @notice Halmos formal tests for VoterRegistry invariants.
 */
contract VoterRegistryFormalSpec is Test, SymTest {

    VoterRegistry internal registry;
    bytes2 internal constant COUNTRY = 0x4742; // "GB"

    function setUp() public {
        registry = new VoterRegistry();
        registry.initialize(address(this));
    }

    // ── Property 1: Zero commitment always reverts ────────────────────────────

    function check_zeroCommitmentRejected() public {
        vm.expectRevert(VoterRegistry.InvalidCommitment.selector);
        registry.register(bytes32(0), COUNTRY);
    }

    // ── Property 2: No double registration ───────────────────────────────────

    /**
     * For any non-zero symbolic commitment, registering it twice always reverts
     * with AlreadyRegistered.
     */
    function check_noDoubleRegistration(bytes32 commitment) public {
        vm.assume(commitment != bytes32(0));

        registry.register(commitment, COUNTRY);

        vm.expectRevert(VoterRegistry.AlreadyRegistered.selector);
        registry.register(commitment, COUNTRY);
    }

    // ── Property 3: totalVoters increments by 1 per registration ─────────────

    function check_totalVotersMonotone(bytes32 commitment) public {
        vm.assume(commitment != bytes32(0));
        vm.assume(!registry.isRegistered(commitment, COUNTRY));

        uint256 before = registry.totalVoters();
        registry.register(commitment, COUNTRY);
        assert(registry.totalVoters() == before + 1);
    }

    // ── Property 4: Unauthorised registrar reverts ────────────────────────────

    /**
     * When a country registrar is set, any other caller must be rejected.
     */
    function check_unauthorisedRegistrarReverts(bytes32 commitment, address attacker) public {
        vm.assume(commitment != bytes32(0));
        vm.assume(attacker != address(this) && attacker != address(0));

        // Set address(this) as the authorised registrar for GB
        registry.setCountryRegistrar(COUNTRY, address(this));

        // Attacker tries to register
        vm.prank(attacker);
        vm.expectRevert(VoterRegistry.UnauthorisedRegistrar.selector);
        registry.register(commitment, COUNTRY);
    }

    // ── Property 5: isRegistered returns false before registration ────────────

    function check_isRegisteredFalseBeforeRegistration(bytes32 commitment) public view {
        vm.assume(commitment != bytes32(0));
        // Fresh registry — nothing is registered
        assert(!registry.isRegistered(commitment, COUNTRY));
    }
}
