// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @title VoterRegistry
 * @notice Stores identity commitments for eligible voters — one per country per citizen.
 *
 * Privacy model:
 *   - An "identity commitment" is a cryptographic hash of the voter's secret
 *     and a random salt, derived off-chain. It proves eligibility without
 *     revealing who the voter is.
 *   - The registry never stores names, national IDs, or any PII.
 *   - Each commitment can only be registered once (prevents Sybil attacks).
 *
 * Upgradeability: UUPS proxy pattern (OpenZeppelin) so governance can fix bugs
 * without redeploying the full system.
 */
contract VoterRegistry is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    /// Maps identity commitment → country code (non-zero means registered)
    mapping(bytes32 => bytes2) private _commitmentToCountry;

    /// Set of all registered commitments (for Merkle tree construction off-chain)
    bytes32[] public commitments;

    /// Authorised registrars per country (e.g. national identity oracle)
    mapping(bytes2 => address) public countryRegistrar;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event VoterRegistered(bytes32 indexed commitment, bytes2 indexed countryCode);
    event RegistrarUpdated(bytes2 indexed countryCode, address registrar);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error AlreadyRegistered();
    error UnauthorisedRegistrar();
    error InvalidCommitment();

    // -----------------------------------------------------------------------
    // Initialiser (replaces constructor for upgradeable contracts)
    // -----------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
        __Pausable_init();
    }

    // -----------------------------------------------------------------------
    // External functions
    // -----------------------------------------------------------------------

    /**
     * @notice Register an identity commitment for a voter.
     * @param commitment  H(voterSecret || salt) — must be unique
     * @param countryCode ISO 3166-1 alpha-2 as bytes2, e.g. 0x4742 for "GB"
     *
     * Called by the country's authorised registrar oracle after verifying the
     * citizen's government-issued credential off-chain.
     */
    function register(bytes32 commitment, bytes2 countryCode)
        external
        whenNotPaused
    {
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (_commitmentToCountry[commitment] != bytes2(0)) revert AlreadyRegistered();
        // Fail closed: a country with no registrar configured accepts no registrations.
        address registrar = countryRegistrar[countryCode];
        if (registrar == address(0) || registrar != msg.sender) {
            revert UnauthorisedRegistrar();
        }

        _commitmentToCountry[commitment] = countryCode;
        commitments.push(commitment);

        emit VoterRegistered(commitment, countryCode);
    }

    /**
     * @notice Check whether a commitment is registered for a given country.
     */
    function isRegistered(bytes32 commitment, bytes2 countryCode)
        external
        view
        returns (bool)
    {
        return _commitmentToCountry[commitment] == countryCode;
    }

    /**
     * @notice Return the total number of registered voters (all countries).
     */
    function totalVoters() external view returns (uint256) {
        return commitments.length;
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    function setCountryRegistrar(bytes2 countryCode, address registrar)
        external
        onlyOwner
    {
        countryRegistrar[countryCode] = registrar;
        emit RegistrarUpdated(countryCode, registrar);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // -----------------------------------------------------------------------
    // UUPS upgrade authorisation
    // -----------------------------------------------------------------------

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
