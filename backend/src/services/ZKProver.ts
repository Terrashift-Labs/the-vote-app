import * as snarkjs from "snarkjs";
import * as path from "path";

interface ZKProofInput {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  publicSignals: string[];
}

/**
 * ZKProver — verifies Groth16 proofs server-side before relaying to the chain.
 *
 * This provides a second layer of validation: if the server rejects an invalid
 * proof, it saves the gas cost of a failed on-chain transaction.
 *
 * The circuit proves: "I know a voter secret whose commitment is in the
 * VoterRegistry Merkle tree, and my nullifier for this poll is correct."
 */
export class ZKProver {
  private vkeyPath: string;

  constructor(
    vkeyPath = path.join(process.cwd(), "circuits", "eligibility_vkey.json")
  ) {
    this.vkeyPath = vkeyPath;
  }

  async verify(proof: ZKProofInput): Promise<void> {
    let vkey: object;
    try {
      vkey = require(this.vkeyPath);
    } catch {
      // In development without a real circuit, skip verification
      if (process.env.NODE_ENV === "development") {
        return;
      }
      throw new Error("ZK verification key not found — cannot verify proof");
    }

    const isValid = await snarkjs.groth16.verify(
      vkey,
      proof.publicSignals,
      {
        pi_a: proof.pi_a,
        pi_b: proof.pi_b,
        pi_c: proof.pi_c,
        protocol: "groth16",
        curve: "bn128",
      }
    );

    if (!isValid) {
      throw new Error("Zero-knowledge proof verification failed");
    }
  }
}
