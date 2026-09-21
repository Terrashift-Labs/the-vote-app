import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { VoterRegistry } from "../typechain-types";

describe("VoterRegistry", () => {
  const GB = "0x4742";
  const commitment = ethers.keccak256(ethers.toUtf8Bytes("voter-1"));
  let registry: VoterRegistry;
  let owner: any, registrar: any, other: any;

  beforeEach(async () => {
    [owner, registrar, other] = await ethers.getSigners();
    const VR = await ethers.getContractFactory("VoterRegistry");
    registry = (await upgrades.deployProxy(VR, [owner.address], { kind: "uups" })) as unknown as VoterRegistry;
  });

  it("rejects registration when no registrar is set for the country", async () => {
    await expect(registry.connect(other).register(commitment, GB))
      .to.be.revertedWithCustomError(registry, "UnauthorisedRegistrar");
    await expect(registry.connect(owner).register(commitment, GB))
      .to.be.revertedWithCustomError(registry, "UnauthorisedRegistrar");
  });

  it("only the configured registrar can register", async () => {
    await registry.setCountryRegistrar(GB, registrar.address);
    await expect(registry.connect(other).register(commitment, GB))
      .to.be.revertedWithCustomError(registry, "UnauthorisedRegistrar");
    await registry.connect(registrar).register(commitment, GB);
    expect(await registry.isRegistered(commitment, GB)).to.equal(true);
  });

  it("rejects duplicate commitments", async () => {
    await registry.setCountryRegistrar(GB, registrar.address);
    await registry.connect(registrar).register(commitment, GB);
    await expect(registry.connect(registrar).register(commitment, GB))
      .to.be.revertedWithCustomError(registry, "AlreadyRegistered");
  });
});
