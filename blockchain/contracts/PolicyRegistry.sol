// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title PolicyRegistry
 * @notice On-chain registry of policy metadata hashes.
 *
 * Full policy documents live off-chain (IPFS). This contract stores a
 * content-addressed hash so anyone can verify the document hasn't changed
 * since the poll was created.
 */
contract PolicyRegistry is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    struct PolicyMeta {
        bytes2  countryCode;
        bytes32 documentHash;   // IPFS CIDv1 as bytes32 (truncated for on-chain storage)
        string  ipfsCID;        // full CID string for retrieval
        uint64  createdAt;
        bool    active;
    }

    mapping(bytes32 => PolicyMeta) public policies; // policyId hash → meta

    event PolicyPublished(bytes32 indexed policyId, bytes2 countryCode, string ipfsCID);
    event PolicyDeactivated(bytes32 indexed policyId);

    error PolicyExists();
    error PolicyNotFound();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Publish a new policy.
     * @param policyId   String identifier (hashed for storage key)
     * @param countryCode ISO 3166-1 alpha-2
     * @param ipfsCID    IPFS content identifier of the full policy document
     */
    function publishPolicy(
        string calldata policyId,
        bytes2 countryCode,
        string calldata ipfsCID
    ) external onlyOwner {
        bytes32 key = keccak256(bytes(policyId));
        if (policies[key].createdAt != 0) revert PolicyExists();

        policies[key] = PolicyMeta({
            countryCode:  countryCode,
            documentHash: bytes32(bytes(ipfsCID)),
            ipfsCID:      ipfsCID,
            createdAt:    uint64(block.timestamp),
            active:       true
        });

        emit PolicyPublished(key, countryCode, ipfsCID);
    }

    function deactivatePolicy(string calldata policyId) external onlyOwner {
        bytes32 key = keccak256(bytes(policyId));
        if (policies[key].createdAt == 0) revert PolicyNotFound();
        policies[key].active = false;
        emit PolicyDeactivated(key);
    }

    function getPolicy(string calldata policyId)
        external
        view
        returns (PolicyMeta memory)
    {
        bytes32 key = keccak256(bytes(policyId));
        return policies[key];
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
