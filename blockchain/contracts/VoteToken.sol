// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VoteToken (VGT)
 * @notice Governance token for TheVoteApp DAO.
 *
 * VGT holders vote on contract upgrades, country oracle approvals, and
 * emergency pauses. Tokens are non-transferable ("soulbound") to prevent
 * governance capture — they can only be minted to contributors by the DAO.
 *
 * Supply is intentionally small (1 token per contributor) so governance
 * power is distributed across contributors, not concentrated by wealth.
 */
contract VoteToken is ERC20Votes, ERC20Permit, Ownable {

    /// Tokens are non-transferable except by minting/burning
    bool public constant SOULBOUND = true;

    event ContributorMinted(address indexed to, uint256 amount);
    event ContributorRevoked(address indexed from, uint256 amount);

    error TokenIsSoulbound();

    constructor(address initialOwner)
        ERC20("VoteGlobal Governance Token", "VGT")
        ERC20Permit("VoteGlobal Governance Token")
        Ownable(initialOwner)
    {}

    /**
     * @notice Mint governance tokens to a contributor. Owner-only.
     * Typically called by the DAO after a governance vote.
     */
    function mintContributor(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit ContributorMinted(to, amount);
    }

    /**
     * @notice Revoke governance tokens from a contributor (e.g. on misconduct).
     */
    function revokeContributor(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
        emit ContributorRevoked(from, amount);
    }

    // ── Soulbound enforcement ─────────────────────────────────────────────────

    function transfer(address, uint256) public pure override returns (bool) {
        revert TokenIsSoulbound();
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert TokenIsSoulbound();
    }

    // ── Required overrides ────────────────────────────────────────────────────

    /// @dev Timestamp clock: VoteGovernor's delay/period are expressed in seconds
    ///      (1 days / 7 days). The default block-number clock would misread them as blocks.
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
