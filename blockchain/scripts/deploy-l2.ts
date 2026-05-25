/**
 * deploy-l2.ts — deploy VoteLedger, VoterRegistry, PolicyRegistry to an L2.
 *
 * Supports Optimism (chainId 10 / 11155420) and Arbitrum (42161 / 421614).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-l2.ts --network optimismSepolia
 *   npx hardhat run scripts/deploy-l2.ts --network arbitrumSepolia
 *   npx hardhat run scripts/deploy-l2.ts --network optimism        (mainnet)
 *   npx hardhat run scripts/deploy-l2.ts --network arbitrum        (mainnet)
 */
import { ethers, network, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const CHAIN_NAMES: Record<number, string> = {
  10:       "Optimism Mainnet",
  420:      "Optimism Goerli (deprecated)",
  11155420: "Optimism Sepolia",
  42161:    "Arbitrum One",
  421614:   "Arbitrum Sepolia",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId    = (await ethers.provider.getNetwork()).chainId;
  const chainName  = CHAIN_NAMES[Number(chainId)] ?? `Chain ${chainId}`;

  console.log(`\nDeploying to ${chainName}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // 1. Deploy ZK Verifier stub (replace with real Groth16 verifier before mainnet)
  const StubVerifier = await ethers.getContractFactory("StubZKVerifier");
  const verifier = await StubVerifier.deploy();
  await verifier.waitForDeployment();
  console.log(`StubZKVerifier:  ${await verifier.getAddress()}`);

  // 2. Deploy VoterRegistry (UUPS upgradeable)
  const VoterRegistry = await ethers.getContractFactory("VoterRegistry");
  const voterRegistry = await upgrades.deployProxy(VoterRegistry, [deployer.address], { kind: "uups" });
  await voterRegistry.waitForDeployment();
  console.log(`VoterRegistry:   ${await voterRegistry.getAddress()}`);

  // 3. Deploy PolicyRegistry (UUPS upgradeable)
  const PolicyRegistry = await ethers.getContractFactory("PolicyRegistry");
  const policyRegistry = await upgrades.deployProxy(PolicyRegistry, [deployer.address], { kind: "uups" });
  await policyRegistry.waitForDeployment();
  console.log(`PolicyRegistry:  ${await policyRegistry.getAddress()}`);

  // 4. Deploy VoteLedger (UUPS upgradeable)
  const VoteLedger = await ethers.getContractFactory("VoteLedger");
  const voteLedger = await upgrades.deployProxy(
    VoteLedger,
    [await verifier.getAddress(), await voterRegistry.getAddress(), await policyRegistry.getAddress()],
    { kind: "uups" }
  );
  await voteLedger.waitForDeployment();
  console.log(`VoteLedger:      ${await voteLedger.getAddress()}`);

  // 5. Write deployment manifest for backend config
  const manifest = {
    network: network.name,
    chainId:          chainId.toString(),
    chainName,
    deployedAt:       new Date().toISOString(),
    deployer:         deployer.address,
    contracts: {
      StubZKVerifier:  await verifier.getAddress(),
      VoterRegistry:   await voterRegistry.getAddress(),
      PolicyRegistry:  await policyRegistry.getAddress(),
      VoteLedger:      await voteLedger.getAddress(),
    },
  };

  const outPath = path.join(__dirname, `../deployments/${network.name}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`\nDeployment manifest written to deployments/${network.name}.json`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
