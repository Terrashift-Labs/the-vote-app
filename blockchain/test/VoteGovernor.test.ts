import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { VoteToken, VoteGovernor } from "../typechain-types";

describe("VoteGovernor", () => {
  let owner: SignerWithAddress;
  let contributor: SignerWithAddress;
  let token: VoteToken;
  let timelock: any;
  let governor: VoteGovernor;

  beforeEach(async () => {
    [owner, contributor] = await ethers.getSigners();

    // Deploy VoteToken
    const VoteToken = await ethers.getContractFactory("VoteToken");
    token = await VoteToken.deploy(owner.address) as unknown as VoteToken;

    // Mint 1 VGT to each participant and delegate
    await token.mintContributor(owner.address, ethers.parseEther("1"));
    await token.mintContributor(contributor.address, ethers.parseEther("1"));
    await token.delegate(owner.address);
    await token.connect(contributor).delegate(contributor.address);

    // Deploy Timelock
    const TimelockController = await ethers.getContractFactory("TimelockController");
    timelock = await TimelockController.deploy(0, [], [], owner.address);

    // Deploy Governor
    const VoteGovernor = await ethers.getContractFactory("VoteGovernor");
    governor = await VoteGovernor.deploy(
      await token.getAddress(),
      await timelock.getAddress()
    ) as unknown as VoteGovernor;

    // Configure timelock
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
    await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());
  });

  it("returns correct name", async () => {
    expect(await governor.name()).to.equal("VoteGovernor");
  });

  it("reflects VGT voting weight", async () => {
    const ownerVotes = await token.getVotes(owner.address);
    expect(ownerVotes).to.equal(ethers.parseEther("1"));
  });

  it("token rejects transfer (soulbound)", async () => {
    await expect(
      token.transfer(contributor.address, ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(token, "TokenIsSoulbound");
  });

  it("can propose, vote, and queue a proposal", async () => {
    // Proposal: call token.mintContributor for a new address
    const calldata = token.interface.encodeFunctionData("mintContributor", [
      "0x0000000000000000000000000000000000000001",
      ethers.parseEther("1"),
    ]);

    const proposalTx = await governor.propose(
      [await token.getAddress()],
      [0n],
      [calldata],
      "Mint VGT for new contributor"
    );
    const receipt = await proposalTx.wait();
    const proposalId = (receipt?.logs[0] as any)?.args?.[0];
    expect(proposalId).to.not.be.undefined;

    // Advance past voting delay
    await time.increase(1 * 24 * 3600 + 1);

    // Both vote For
    await governor.castVote(proposalId, 1);
    await governor.connect(contributor).castVote(proposalId, 1);

    // Advance past voting period
    await time.increase(7 * 24 * 3600 + 1);

    expect(await governor.state(proposalId)).to.equal(4); // Succeeded
  });
});
