import { ethers, upgrades } from "hardhat";

/**
 * Deploy the DAO governance layer:
 *   VoteToken (VGT) → TimelockController → VoteGovernor
 *
 * After deployment, transfer ownership of all UUPS proxies to the Timelock
 * so all upgrades require a passed DAO vote.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DAO with:", deployer.address);

  // 1. Deploy VoteToken (VGT)
  const VoteToken = await ethers.getContractFactory("VoteToken");
  const token = await VoteToken.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("VoteToken deployed to:", tokenAddr);

  // Mint 1 VGT to deployer (bootstrap governance)
  await token.mintContributor(deployer.address, ethers.parseEther("1"));
  // Self-delegate so voting power is active from genesis
  await token.delegate(deployer.address);
  console.log("Minted 1 VGT to deployer and self-delegated");

  // 2. Deploy TimelockController
  //    minDelay = 2 days; proposers and executors set to Governor (deployed next)
  const TimelockController = await ethers.getContractFactory("TimelockController");
  const timelock = await TimelockController.deploy(
    2 * 24 * 3600,  // 2 day delay
    [],             // proposers — will add Governor after deployment
    [],             // executors — will add Governor after deployment
    deployer.address
  );
  await timelock.waitForDeployment();
  const timelockAddr = await timelock.getAddress();
  console.log("TimelockController deployed to:", timelockAddr);

  // 3. Deploy VoteGovernor
  const VoteGovernor = await ethers.getContractFactory("VoteGovernor");
  const governor = await VoteGovernor.deploy(tokenAddr, timelockAddr);
  await governor.waitForDeployment();
  const governorAddr = await governor.getAddress();
  console.log("VoteGovernor deployed to:", governorAddr);

  // 4. Configure Timelock: Governor is proposer and executor
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const ADMIN_ROLE     = await timelock.DEFAULT_ADMIN_ROLE();

  await timelock.grantRole(PROPOSER_ROLE, governorAddr);
  await timelock.grantRole(EXECUTOR_ROLE, governorAddr);
  await timelock.grantRole(CANCELLER_ROLE, governorAddr);
  // Renounce admin so no single account controls the timelock
  await timelock.renounceRole(ADMIN_ROLE, deployer.address);
  console.log("Timelock configured — admin renounced");

  console.log("\n--- DAO Deployment Summary ---");
  console.log(`VOTE_TOKEN_ADDRESS=${tokenAddr}`);
  console.log(`TIMELOCK_ADDRESS=${timelockAddr}`);
  console.log(`GOVERNOR_ADDRESS=${governorAddr}`);
  console.log("\nNext: transfer ownership of VoteLedger/VoterRegistry/PolicyRegistry to Timelock");
  console.log(`  voteLedger.transferOwnership("${timelockAddr}")`);
  console.log(`  voterRegistry.transferOwnership("${timelockAddr}")`);
  console.log(`  policyRegistry.transferOwnership("${timelockAddr}")`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
