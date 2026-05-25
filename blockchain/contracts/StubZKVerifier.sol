// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./IZKVerifier.sol";

/**
 * @title StubZKVerifier
 * @notice Development/testing stub that accepts all proofs.
 * @dev DO NOT deploy to mainnet. Replace with the snarkjs-generated verifier.
 */
contract StubZKVerifier is IZKVerifier {
    function verifyProof(
        uint256[2]    calldata,
        uint256[2][2] calldata,
        uint256[2]    calldata,
        uint256[]     calldata
    ) external pure override returns (bool) {
        return true; // stub: always valid
    }
}
