import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PauseGuardian (3-of-5 multisig)", () => {
  let guardians: SignerWithAddress[];
  let outsider: SignerWithAddress;
  let guardian: typeof import("../typechain-types").PauseGuardian.prototype;
  let mockTarget: any;

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    guardians = signers.slice(0, 5);
    outsider  = signers[5];

    // Deploy a minimal mock pausable target
    const Mock = await ethers.getContractFactory("MockPausable");
    mockTarget = await Mock.deploy();

    const PauseGuardian = await ethers.getContractFactory("PauseGuardian");
    guardian = await PauseGuardian.deploy(
      await mockTarget.getAddress(),
      guardians.map((g) => g.address),
      3 // threshold
    ) as any;
  });

  it("allows a guardian to propose a pause", async () => {
    await expect(guardian.connect(guardians[0]).proposePause("security test"))
      .to.emit(guardian, "ProposalCreated");
  });

  it("rejects pause proposal from non-guardian", async () => {
    await expect(guardian.connect(outsider).proposePause("attack"))
      .to.be.reverted;
  });

  it("requires threshold approvals before execution", async () => {
    const tx = await guardian.connect(guardians[0]).proposePause("test");
    const receipt = await tx.wait();
    const id = (receipt?.logs[0] as any)?.args?.[0];

    // Only 1 approval (from proposer) — should fail
    await expect(guardian.connect(guardians[0]).executePause(id))
      .to.be.revertedWithCustomError(guardian, "ThresholdNotMet");
  });

  it("executes pause after 3 approvals", async () => {
    const tx = await guardian.connect(guardians[0]).proposePause("critical bug");
    const receipt = await tx.wait();
    const id = (receipt?.logs[0] as any)?.args?.[0];

    await guardian.connect(guardians[1]).approvePause(id);
    await guardian.connect(guardians[2]).approvePause(id);

    await expect(guardian.connect(guardians[0]).executePause(id))
      .to.emit(guardian, "ProposalExecuted");

    expect(await mockTarget.paused()).to.be.true;
  });

  it("prevents double approval from same guardian", async () => {
    const tx = await guardian.connect(guardians[0]).proposePause("test");
    const receipt = await tx.wait();
    const id = (receipt?.logs[0] as any)?.args?.[0];

    await expect(guardian.connect(guardians[0]).approvePause(id))
      .to.be.revertedWithCustomError(guardian, "AlreadyApproved");
  });

  it("prevents executing twice", async () => {
    const tx = await guardian.connect(guardians[0]).proposePause("test");
    const receipt = await tx.wait();
    const id = (receipt?.logs[0] as any)?.args?.[0];

    await guardian.connect(guardians[1]).approvePause(id);
    await guardian.connect(guardians[2]).approvePause(id);
    await guardian.connect(guardians[0]).executePause(id);

    await expect(guardian.connect(guardians[0]).executePause(id))
      .to.be.revertedWithCustomError(guardian, "AlreadyExecuted");
  });
});
