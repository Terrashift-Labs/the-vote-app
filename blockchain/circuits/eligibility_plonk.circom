pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/mux1.circom";

/**
 * EligibilityPlonk — Plonk-based ZK circuit for voter eligibility.
 *
 * Proves that:
 *   1. The voter knows a secret `voterSecret` such that
 *      commitment = Poseidon(voterSecret, countryCode) is in the
 *      VoterRegistry Merkle tree (proven via Merkle path).
 *   2. The nullifier = Poseidon(voterSecret, pollId) has not been used
 *      before (uniqueness enforced by the contract, not the circuit).
 *
 * Why Plonk over Groth16?
 *   - No per-circuit trusted setup ceremony (uses universal SRS)
 *   - Proof size is ~750 bytes vs ~256 bytes for Groth16, but the
 *     tradeoff is eliminated trusted setup risk
 *   - snarkjs supports Plonk with the PTAU universal SRS
 *
 * Public inputs (signals exposed on-chain):
 *   - merkleRoot   : Merkle root of VoterRegistry commitments
 *   - nullifier    : Poseidon(voterSecret, pollId)
 *   - pollId       : keccak256 of the policy identifier (as field element)
 *   - countryCode  : ISO country code as field element
 *
 * Private inputs:
 *   - voterSecret  : voter's random secret (never leaves device)
 *   - pathElements : Merkle proof sibling hashes
 *   - pathIndices  : Merkle proof direction bits (0=left, 1=right)
 */

// Merkle tree depth — must match VoterRegistry tree height
// 20 levels supports up to 2^20 = 1,048,576 registered voters
template EligibilityPlonk(levels) {
    // ── Public signals ──────────────────────────────────────────────────────
    signal input  merkleRoot;
    signal input  nullifier;
    signal input  pollId;
    signal input  countryCode;

    // ── Private signals ─────────────────────────────────────────────────────
    signal input  voterSecret;
    signal input  pathElements[levels];
    signal input  pathIndices[levels];

    // ── Verify commitment derivation ────────────────────────────────────────
    // commitment = Poseidon(voterSecret, countryCode)
    component commitHasher = Poseidon(2);
    commitHasher.inputs[0] <== voterSecret;
    commitHasher.inputs[1] <== countryCode;
    signal commitment <== commitHasher.out;

    // ── Verify nullifier derivation ─────────────────────────────────────────
    // nullifier = Poseidon(voterSecret, pollId)
    component nullHasher = Poseidon(2);
    nullHasher.inputs[0] <== voterSecret;
    nullHasher.inputs[1] <== pollId;
    nullHasher.out === nullifier; // constrain public nullifier

    // ── Merkle proof verification ───────────────────────────────────────────
    // Walk the path from commitment to root, hashing pairs at each level
    component hashers[levels];
    component mux[levels];

    signal levelHashes[levels + 1];
    levelHashes[0] <== commitment;

    for (var i = 0; i < levels; i++) {
        // pathIndices[i] = 0 → current node is left child
        // pathIndices[i] = 1 → current node is right child
        pathIndices[i] * (pathIndices[i] - 1) === 0; // must be binary

        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== levelHashes[i];      // left when index=0
        mux[i].c[0][1] <== pathElements[i];      // right when index=0
        mux[i].c[1][0] <== pathElements[i];      // left when index=1
        mux[i].c[1][1] <== levelHashes[i];       // right when index=1
        mux[i].s       <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];
        levelHashes[i + 1]   <== hashers[i].out;
    }

    // Constrain computed root to match the public merkleRoot input
    levelHashes[levels] === merkleRoot;
}

// Instantiate with depth 20
component main {public [merkleRoot, nullifier, pollId, countryCode]}
    = EligibilityPlonk(20);
