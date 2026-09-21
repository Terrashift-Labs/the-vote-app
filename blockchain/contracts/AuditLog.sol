// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title AuditLog
 * @notice On-chain verifiable audit log for admin actions.
 *
 * Every admin action (policy creation, voter roll update, contract proposal)
 * is signed off-chain, pinned to IPFS, and the CID recorded here.
 * Anyone can verify the complete admin history without trusting the backend.
 *
 * Entry schema (off-chain JSON, IPFS-pinned):
 * {
 *   "action":     "policy_created" | "voter_roll_updated" | "dao_proposal",
 *   "actor":      "0x<admin address>",
 *   "payload":    { ... action-specific data ... },
 *   "timestamp":  "<ISO-8601>",
 *   "signature":  "0x<ECDSA over keccak256(canonical JSON)>"
 * }
 */
contract AuditLog is Initializable, AccessControlUpgradeable, UUPSUpgradeable {

    bytes32 public constant AUDITOR_ROLE  = keccak256("AUDITOR_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct Entry {
        address actor;
        string  action;
        string  ipfsCid;
        uint256 timestamp;
    }

    Entry[] private _entries;

    event AuditEntryAdded(
        uint256 indexed id,
        address indexed actor,
        string  action,
        string  ipfsCid,
        uint256 timestamp
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address admin) public initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AUDITOR_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    /**
     * @notice Record an admin action.
     * @param action  Short action identifier (e.g. "policy_created")
     * @param ipfsCid IPFS CID of the signed JSON entry blob
     */
    function addEntry(string calldata action, string calldata ipfsCid)
        external
        onlyRole(AUDITOR_ROLE)
    {
        uint256 id = _entries.length;
        _entries.push(Entry({
            actor:     msg.sender,
            action:    action,
            ipfsCid:   ipfsCid,
            timestamp: block.timestamp
        }));
        emit AuditEntryAdded(id, msg.sender, action, ipfsCid, block.timestamp);
    }

    function getEntry(uint256 id) external view returns (Entry memory) {
        require(id < _entries.length, "Entry not found");
        return _entries[id];
    }

    function entryCount() external view returns (uint256) {
        return _entries.length;
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
