// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppReceiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CrossChainVoteRelay
 * @notice LayerZero V2 OApp deployed on L1 (Ethereum mainnet).
 *
 * Receives cross-chain vote messages from L2VoteCaster contracts on Optimism /
 * Arbitrum and forwards them to the canonical VoteLedger on L1.
 *
 * Message format (ABI-encoded):
 *   bytes32 pollId
 *   bytes32 optionHash
 *   bytes32 nullifier
 *   uint32  srcChainId    — LayerZero endpoint ID of the source chain
 *
 * Security:
 *   - Only whitelisted L2VoteCaster addresses (per endpoint ID) can send messages
 *   - Nullifier uniqueness enforced by VoteLedger (same as direct L1 votes)
 *   - No ZK proof forwarded — L2VoteCaster verifies the proof on L2 first;
 *     VoteLedger uses a trusted-relay mode for cross-chain votes
 */

interface IVoteLedgerRelay {
    function castVoteRelay(
        bytes32 pollId,
        bytes32 optionHash,
        bytes32 nullifier,
        uint32  srcChainId
    ) external;
}

contract CrossChainVoteRelay is OApp {

    IVoteLedgerRelay public voteLedger;

    // Whitelisted peer addresses per LayerZero endpoint ID
    // (set via OApp.setPeer — already inherited)

    event CrossChainVoteReceived(
        bytes32 indexed pollId,
        bytes32 indexed nullifier,
        uint32          srcEid
    );

    error InvalidMessageLength();
    error VoteLedgerNotSet();

    constructor(address _endpoint, address _owner)
        OApp(_endpoint, _owner)
        Ownable(_owner)
    {}

    function setVoteLedger(address _voteLedger) external onlyOwner {
        voteLedger = IVoteLedgerRelay(_voteLedger);
    }

    /**
     * @dev Called by LayerZero endpoint when a message arrives from an L2.
     *      `_origin.sender` is the peer address (L2VoteCaster) — already
     *      validated by OApp base against the registered peer.
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32,         /* guid */
        bytes calldata  _message,
        address,         /* executor */
        bytes calldata   /* extraData */
    ) internal override {
        if (_message.length != 96) revert InvalidMessageLength();
        if (address(voteLedger) == address(0)) revert VoteLedgerNotSet();

        (bytes32 pollId, bytes32 optionHash, bytes32 nullifier) =
            abi.decode(_message, (bytes32, bytes32, bytes32));

        voteLedger.castVoteRelay(pollId, optionHash, nullifier, _origin.srcEid);

        emit CrossChainVoteReceived(pollId, nullifier, _origin.srcEid);
    }
}
