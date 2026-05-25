// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSender.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title L2VoteCaster
 * @notice LayerZero V2 OApp deployed on L2 (Optimism or Arbitrum).
 *
 * Accepts vote submissions on L2 (lower gas cost), verifies the ZK proof
 * locally, records the nullifier to prevent double-voting on this L2, and
 * then sends a cross-chain message to CrossChainVoteRelay on L1.
 *
 * The L1 VoteLedger is the canonical authority — the L2 nullifier set is a
 * secondary guard to prevent duplicate messages being sent cross-chain.
 *
 * Fee model:
 *   Callers must supply msg.value >= quote(pollId, optionHash, nullifier)
 *   to cover the LayerZero messaging fee.
 */

interface IL2ZKVerifier {
    function verifyProof(
        uint256[2]    calldata piA,
        uint256[2][2] calldata piB,
        uint256[2]    calldata piC,
        uint256[]     calldata publicSignals
    ) external view returns (bool);
}

struct ZKProofData {
    uint256[2]    piA;
    uint256[2][2] piB;
    uint256[2]    piC;
    uint256[]     publicSignals;
}

contract L2VoteCaster is OApp {

    IL2ZKVerifier public zkVerifier;
    uint32        public l1Eid;           // LayerZero endpoint ID of L1

    // Nullifiers spent on this L2 — prevents duplicate cross-chain messages
    mapping(bytes32 => bool) private _l2Nullifiers;

    event L2VoteSent(
        bytes32 indexed pollId,
        bytes32 indexed nullifier,
        bytes32         guid
    );

    error NullifierSpentL2();
    error InvalidZKProof();
    error InsufficientFee();

    constructor(address _endpoint, address _owner, uint32 _l1Eid)
        OApp(_endpoint, _owner)
        Ownable(_owner)
    {
        l1Eid = _l1Eid;
    }

    function setZKVerifier(address _verifier) external onlyOwner {
        zkVerifier = IL2ZKVerifier(_verifier);
    }

    /**
     * @notice Submit a vote on L2. Verifies ZK proof, records L2 nullifier,
     *         and sends a cross-chain message to L1.
     * @param pollId     Target poll
     * @param optionHash keccak256(optionId)
     * @param nullifier  H(voterSecret || pollId)
     * @param proof      Groth16/Plonk proof (verified locally on L2)
     */
    function castVote(
        bytes32     pollId,
        bytes32     optionHash,
        bytes32     nullifier,
        ZKProofData calldata proof
    ) external payable {
        if (_l2Nullifiers[nullifier]) revert NullifierSpentL2();

        // Verify ZK proof on L2
        bool valid = zkVerifier.verifyProof(
            proof.piA, proof.piB, proof.piC, proof.publicSignals
        );
        if (!valid) revert InvalidZKProof();

        // Record L2 nullifier
        _l2Nullifiers[nullifier] = true;

        // Build LayerZero message
        bytes memory message = abi.encode(pollId, optionHash, nullifier);
        bytes memory options = abi.encodePacked(
            uint16(1),                 // type 1 = executor lz-receive option
            uint128(200_000)           // gas limit on L1 for lzReceive
        );

        // Quote the fee and validate
        MessagingFee memory fee = _quote(l1Eid, message, options, false);
        if (msg.value < fee.nativeFee) revert InsufficientFee();

        // Send cross-chain message
        MessagingReceipt memory receipt = _lzSend(
            l1Eid,
            message,
            options,
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );

        emit L2VoteSent(pollId, nullifier, receipt.guid);
    }

    /**
     * @notice Returns the native fee required to submit a vote cross-chain.
     */
    function quote(
        bytes32 pollId,
        bytes32 optionHash,
        bytes32 nullifier
    ) external view returns (uint256 nativeFee) {
        bytes memory message = abi.encode(pollId, optionHash, nullifier);
        bytes memory options = abi.encodePacked(uint16(1), uint128(200_000));
        MessagingFee memory fee = _quote(l1Eid, message, options, false);
        return fee.nativeFee;
    }

    // Required by OApp — L2VoteCaster only sends, never receives
    function _lzReceive(
        Origin calldata,
        bytes32,
        bytes calldata,
        address,
        bytes calldata
    ) internal override {}
}
