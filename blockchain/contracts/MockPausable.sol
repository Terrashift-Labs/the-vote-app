// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Minimal pausable contract used only in tests.
contract MockPausable is Pausable, Ownable {
    constructor() Ownable(msg.sender) {}
    function pause() external { _pause(); }
    function unpause() external { _unpause(); }
}
