import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // 1. Deploy VoterRegistry (UUPS proxy)
  const VoterRegistry = await ethers.getContractFactory("VoterRegistry");
  const voterRegistry = await upgrades.deployProxy(VoterRegistry, [deployer.address], {
    initializer: "initialize",
    kind: "uups",
  });
  await voterRegistry.waitForDeployment();
  const vrAddress = await voterRegistry.getAddress();
  console.log("VoterRegistry proxy deployed to:", vrAddress);

  // 2. Deploy PolicyRegistry (UUPS proxy)
  const PolicyRegistry = await ethers.getContractFactory("PolicyRegistry");
  const policyRegistry = await upgrades.deployProxy(PolicyRegistry, [deployer.address], {
    initializer: "initialize",
    kind: "uups",
  });
  await policyRegistry.waitForDeployment();
  const prAddress = await policyRegistry.getAddress();
  console.log("PolicyRegistry proxy deployed to:", prAddress);

  // 3. Deploy ZK Verifier (stub for local dev — replace with snarkjs-generated contract)
  const StubVerifier = await ethers.getContractFactory("StubZKVerifier");
  const zkVerifier = await StubVerifier.deploy();
  await zkVerifier.waitForDeployment();
  const zkAddress = await zkVerifier.getAddress();
  console.log("ZKVerifier deployed to:", zkAddress);

  // 4. Deploy VoteLedger (UUPS proxy)
  const VoteLedger = await ethers.getContractFactory("VoteLedger");
  const voteLedger = await upgrades.deployProxy(
    VoteLedger,
    [deployer.address, vrAddress, zkAddress],
    { initializer: "initialize", kind: "uups" }
  );
  await voteLedger.waitForDeployment();
  const vlAddress = await voteLedger.getAddress();
  console.log("VoteLedger proxy deployed to:", vlAddress);

  console.log("\n--- Deployment Summary ---");
  console.log(`VOTER_REGISTRY_ADDRESS=${vrAddress}`);
  console.log(`POLICY_REGISTRY_ADDRESS=${prAddress}`);
  console.log(`ZK_VERIFIER_ADDRESS=${zkAddress}`);
  console.log(`VOTE_LEDGER_ADDRESS=${vlAddress}`);
  console.log("\nCopy these into your backend/.env file.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
