/**
 * migrate-to-plonk.ts
 *
 * Migration script: replaces the Groth16 ZK verifier in VoteLedger with the
 * new Plonk verifier via a DAO governance proposal.
 *
 * Steps:
 *   1. Deploy the new PlonkVerifier contract
 *   2. Encode the VoteLedger.setZKVerifier(newAddress) call
 *   3. Submit a governance proposal via VoteGovernor
 *   4. Wait for the voting period to pass and the proposal to succeed
 *   5. Queue and execute via Timelock
 *
 * Pre-requisites:
 *   - VOTE_GOVERNOR_ADDRESS, VOTE_LEDGER_ADDRESS, TIMELOCK_ADDRESS set in env
 *   - Deployer wallet has PROPOSER_ROLE or sufficient VoteToken balance
 *
 * Run:
 *   npx hardhat run scripts/migrate-to-plonk.ts --network sepolia
 */

import { ethers } from "hardhat";

const GOVERNOR_ABI = [
  "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
  "function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)",
  "function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function votingDelay() view returns (uint256)",
  "function votingPeriod() view returns (uint256)",
];

const VOTE_LEDGER_ABI = [
  "function setZKVerifier(address newVerifier) external",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1. Deploy PlonkVerifier
  const PlonkVerifier = await ethers.getContractFactory("PlonkVerifier");
  const plonkVerifier = await PlonkVerifier.deploy();
  await plonkVerifier.waitForDeployment();
  const plonkAddress = await plonkVerifier.getAddress();
  console.log("PlonkVerifier deployed:", plonkAddress);

  // 2. Encode the upgrade call
  const ledgerIface = new ethers.Interface(VOTE_LEDGER_ABI);
  const calldata = ledgerIface.encodeFunctionData("setZKVerifier", [plonkAddress]);

  const ledgerAddress   = process.env.VOTE_LEDGER_ADDRESS!;
  const governorAddress = process.env.VOTE_GOVERNOR_ADDRESS!;

  const targets     = [ledgerAddress];
  const values      = [0n];
  const calldatas   = [calldata];
  const description = `Upgrade ZK verifier from Groth16 to Plonk — PlonkVerifier at ${plonkAddress}`;

  // 3. Submit governance proposal
  const governor = new ethers.Contract(governorAddress, GOVERNOR_ABI, deployer);
  const tx = await governor.propose(targets, values, calldatas, description);
  const receipt = await tx.wait();
  console.log("Proposal TX:", receipt.hash);

  // Extract proposalId from event
  const iface = new ethers.Interface([
    "event ProposalCreated(uint256 indexed proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
  ]);
  const log = receipt.logs.find((l: any) => {
    try { iface.parseLog(l); return true; } catch { return false; }
  });
  const parsed   = log ? iface.parseLog(log) : null;
  const proposalId = parsed?.args[0];
  console.log("ProposalId:", proposalId?.toString());
  console.log("\nNext steps:");
  console.log("1. VoteToken holders vote FOR proposalId", proposalId?.toString());
  console.log("2. After voting period, call queue() then execute()");
  console.log("3. PlonkVerifier will be live at:", plonkAddress);
}

main().catch((err) => { console.error(err); process.exit(1); });
