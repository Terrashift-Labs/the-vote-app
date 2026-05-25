// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PauseGuardian
 * @notice M-of-N multisig controller for the VoteLedger emergency pause.
 *
 * A configurable threshold of guardians must co-sign a pause request
 * before the VoteLedger is paused. This prevents any single key compromise
 * from halting the voting system.
 *
 * Default configuration: 3-of-5 guardians required.
 *
 * Flow:
 *   1. Any guardian calls `proposePause(reason)`
 *   2. Other guardians call `approvePause(proposalId)`
 *   3. Once threshold signatures are collected, `executePause(proposalId)`
 *      is callable by any guardian — triggers `IPausable(target).pause()`
 *   4. Unpause requires the same M-of-N process via `proposeUnpause` /
 *      `approveUnpause` / `executeUnpause`
 */
interface IPausable {
    function pause() external;
    function unpause() external;
}

contract PauseGuardian is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    address public immutable target; // VoteLedger address
    uint256 public threshold;        // minimum approvals required
    uint256 public guardianCount;

    struct Proposal {
        bool   isPause;     // true = pause, false = unpause
        string reason;
        uint256 approvals;
        bool    executed;
        mapping(address => bool) approved;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) private proposals;

    event ProposalCreated(uint256 indexed id, bool isPause, address proposer, string reason);
    event ProposalApproved(uint256 indexed id, address guardian);
    event ProposalExecuted(uint256 indexed id, bool isPause);

    error AlreadyApproved();
    error AlreadyExecuted();
    error ThresholdNotMet();
    error NotGuardian();

    constructor(address _target, address[] memory _guardians, uint256 _threshold) {
        require(_threshold > 0 && _threshold <= _guardians.length, "Invalid threshold");
        target    = _target;
        threshold = _threshold;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        for (uint256 i = 0; i < _guardians.length; i++) {
            _grantRole(GUARDIAN_ROLE, _guardians[i]);
        }
        guardianCount = _guardians.length;
    }

    // ── Pause proposals ──────────────────────────────────────────────────────

    function proposePause(string calldata reason) external onlyRole(GUARDIAN_ROLE) returns (uint256 id) {
        id = _createProposal(true, reason);
        _approve(id);
    }

    function approvePause(uint256 id) external onlyRole(GUARDIAN_ROLE) {
        require(proposals[id].isPause, "Not a pause proposal");
        _approve(id);
    }

    function executePause(uint256 id) external onlyRole(GUARDIAN_ROLE) {
        Proposal storage p = proposals[id];
        if (p.executed)            revert AlreadyExecuted();
        if (!p.isPause)            revert("Not a pause proposal");
        if (p.approvals < threshold) revert ThresholdNotMet();
        p.executed = true;
        IPausable(target).pause();
        emit ProposalExecuted(id, true);
    }

    // ── Unpause proposals ────────────────────────────────────────────────────

    function proposeUnpause(string calldata reason) external onlyRole(GUARDIAN_ROLE) returns (uint256 id) {
        id = _createProposal(false, reason);
        _approve(id);
    }

    function approveUnpause(uint256 id) external onlyRole(GUARDIAN_ROLE) {
        require(!proposals[id].isPause, "Not an unpause proposal");
        _approve(id);
    }

    function executeUnpause(uint256 id) external onlyRole(GUARDIAN_ROLE) {
        Proposal storage p = proposals[id];
        if (p.executed)            revert AlreadyExecuted();
        if (p.isPause)             revert("Not an unpause proposal");
        if (p.approvals < threshold) revert ThresholdNotMet();
        p.executed = true;
        IPausable(target).unpause();
        emit ProposalExecuted(id, false);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    function getApprovals(uint256 id) external view returns (uint256) {
        return proposals[id].approvals;
    }

    function hasApproved(uint256 id, address guardian) external view returns (bool) {
        return proposals[id].approved[guardian];
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _createProposal(bool isPause, string calldata reason) internal returns (uint256 id) {
        id = proposalCount++;
        proposals[id].isPause = isPause;
        proposals[id].reason  = reason;
        emit ProposalCreated(id, isPause, msg.sender, reason);
    }

    function _approve(uint256 id) internal {
        Proposal storage p = proposals[id];
        if (p.executed)             revert AlreadyExecuted();
        if (p.approved[msg.sender]) revert AlreadyApproved();
        p.approved[msg.sender] = true;
        p.approvals++;
        emit ProposalApproved(id, msg.sender);
    }
}
