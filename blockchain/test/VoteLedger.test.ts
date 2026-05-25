import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { VoteLedger, VoterRegistry, StubZKVerifier } from "../typechain-types";

describe("VoteLedger", () => {
  let owner: SignerWithAddress;
  let voter: SignerWithAddress;
  let voterRegistry: VoterRegistry;
  let zkVerifier: StubZKVerifier;
  let voteLedger: VoteLedger;

  const countryCode = ethers.encodeBytes32String("GB").slice(0, 6) as `0x${string}`; // bytes2
  const GB: string = "0x4742";
  const policyId = "healthcare-reform-2026";
  const optionHash = ethers.keccak256(ethers.toUtf8Bytes("support"));
  const nullifier = ethers.keccak256(ethers.toUtf8Bytes("voter-secret-policy-001"));

  const futureDeadline = () => Math.floor(Date.now() / 1000) + 86400; // +1 day

  const stubProof = {
    piA: [0n, 0n] as [bigint, bigint],
    piB: [[0n, 0n], [0n, 0n]] as [[bigint, bigint], [bigint, bigint]],
    piC: [0n, 0n] as [bigint, bigint],
    publicSignals: [] as bigint[],
  };

  beforeEach(async () => {
    [owner, voter] = await ethers.getSigners();

    // Deploy VoterRegistry
    const VR = await ethers.getContractFactory("VoterRegistry");
    voterRegistry = (await upgrades.deployProxy(VR, [owner.address], { kind: "uups" })) as unknown as VoterRegistry;

    // Deploy stub ZK verifier
    const ZKV = await ethers.getContractFactory("StubZKVerifier");
    zkVerifier = await ZKV.deploy() as unknown as StubZKVerifier;

    // Deploy VoteLedger
    const VL = await ethers.getContractFactory("VoteLedger");
    voteLedger = (await upgrades.deployProxy(
      VL,
      [owner.address, await voterRegistry.getAddress(), await zkVerifier.getAddress()],
      { kind: "uups" }
    )) as unknown as VoteLedger;
  });

  describe("Poll creation", () => {
    it("creates a poll with correct metadata", async () => {
      const deadline = futureDeadline();
      await voteLedger.createPoll(policyId, GB, deadline);
      const pollId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["string", "bytes2"],
          [policyId, GB]
        )
      );
      const meta = await voteLedger.getPollMeta(pollId);
      expect(meta.finalised).to.be.false;
      expect(meta.totalVotes).to.equal(0n);
    });

    it("rejects a poll with deadline in the past", async () => {
      const pastDeadline = Math.floor(Date.now() / 1000) - 1;
      await expect(
        voteLedger.createPoll(policyId, GB, pastDeadline)
      ).to.be.revertedWithCustomError(voteLedger, "DeadlineInPast");
    });

    it("only allows owner to create polls", async () => {
      await expect(
        voteLedger.connect(voter).createPoll(policyId, GB, futureDeadline())
      ).to.be.revertedWithCustomError(voteLedger, "OwnableUnauthorizedAccount");
    });
  });

  describe("Vote casting", () => {
    let pollId: string;

    beforeEach(async () => {
      const deadline = futureDeadline();
      const tx = await voteLedger.createPoll(policyId, GB, deadline);
      await tx.wait();
      pollId = ethers.keccak256(
        ethers.solidityPacked(["string", "bytes2"], [policyId, GB])
      );
    });

    it("records a valid vote and increments tally", async () => {
      await voteLedger.castVote(pollId, optionHash, nullifier, stubProof);
      const tally = await voteLedger.getTally(pollId, optionHash);
      expect(tally).to.equal(1n);
    });

    it("prevents double-voting with the same nullifier", async () => {
      await voteLedger.castVote(pollId, optionHash, nullifier, stubProof);
      await expect(
        voteLedger.castVote(pollId, optionHash, nullifier, stubProof)
      ).to.be.revertedWithCustomError(voteLedger, "NullifierSpent");
    });

    it("marks nullifier as spent after vote", async () => {
      await voteLedger.castVote(pollId, optionHash, nullifier, stubProof);
      expect(await voteLedger.isNullifierSpent(nullifier)).to.be.true;
    });
  });

  describe("Finalisation", () => {
    it("owner can finalise a poll", async () => {
      await voteLedger.createPoll(policyId, GB, futureDeadline());
      const pollId = ethers.keccak256(
        ethers.solidityPacked(["string", "bytes2"], [policyId, GB])
      );
      await voteLedger.finalisePoll(pollId);
      const meta = await voteLedger.getPollMeta(pollId);
      expect(meta.finalised).to.be.true;
    });
  });
});
