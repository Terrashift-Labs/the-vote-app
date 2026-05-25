/**
 * deploy-crosschain.ts
 *
 * Deploys the cross-chain vote aggregation infrastructure:
 *
 *   L1 (Ethereum / Sepolia):
 *     CrossChainVoteRelay — receives messages from L2s
 *
 *   L2 (Optimism Sepolia):
 *     L2VoteCaster — accepts votes, sends cross-chain messages
 *
 *   L2 (Arbitrum Sepolia):
 *     L2VoteCaster — accepts votes, sends cross-chain messages
 *
 * LayerZero V2 endpoint IDs:
 *   Ethereum Sepolia:  40161
 *   Optimism Sepolia:  40232
 *   Arbitrum Sepolia:  40231
 *   Ethereum mainnet:  30101
 *   Optimism mainnet:  30111
 *   Arbitrum mainnet:  30110
 *
 * Usage:
 *   npx hardhat run scripts/deploy-crosschain.ts --network sepolia
 *
 * Then manually set peers on each contract:
 *   relay.setPeer(40232, addressToBytes32(opL2VoteCaster.address))
 *   relay.setPeer(40231, addressToBytes32(arbL2VoteCaster.address))
 *   opL2VoteCaster.setPeer(40161, addressToBytes32(relay.address))
 *   arbL2VoteCaster.setPeer(40161, addressToBytes32(relay.address))
 */

import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

// LayerZero V2 endpoint addresses
const LZ_ENDPOINTS: Record<string, string> = {
  sepolia:          "0x6EDCE65403992e310A62460808c4b910D972f10f",
  optimismSepolia:  "0x6EDCE65403992e310A62460808c4b910D972f10f",
  arbitrumSepolia:  "0x6EDCE65403992e310A62460808c4b910D972f10f",
  // mainnet
  mainnet:          "0x1a44076050125825900e736c501f859c50fE728c",
  optimism:         "0x1a44076050125825900e736c501f859c50fE728c",
  arbitrum:         "0x1a44076050125825900e736c501f859c50fE728c",
};

const L1_EID: Record<string, number> = {
  sepolia:  40161,
  mainnet:  30101,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;
  console.log(`Deploying on ${networkName} as ${deployer.address}`);

  const endpoint = LZ_ENDPOINTS[networkName];
  if (!endpoint) throw new Error(`No LZ endpoint configured for ${networkName}`);

  const manifest: Record<string, string> = {};

  if (networkName === "sepolia" || networkName === "mainnet") {
    // ── Deploy L1 relay ──────────────────────────────────────────────────────
    const Relay = await ethers.getContractFactory("CrossChainVoteRelay");
    const relay = await Relay.deploy(endpoint, deployer.address);
    await relay.waitForDeployment();
    const relayAddr = await relay.getAddress();
    console.log("CrossChainVoteRelay:", relayAddr);
    manifest.CrossChainVoteRelay = relayAddr;

    // Wire to VoteLedger
    const voteLedgerAddr = process.env.VOTE_LEDGER_ADDRESS;
    if (voteLedgerAddr) {
      await relay.setVoteLedger(voteLedgerAddr);
      console.log("VoteLedger set on relay:", voteLedgerAddr);
    }

    // Save manifest for L2 deployments to reference
    const manifestPath = path.join(__dirname, "../deployments/crosschain-l1.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ network: networkName, ...manifest }, null, 2));
    console.log("L1 manifest saved:", manifestPath);

  } else if (networkName === "optimismSepolia" || networkName === "optimism" ||
             networkName === "arbitrumSepolia"  || networkName === "arbitrum") {
    // ── Deploy L2 VoteCaster ─────────────────────────────────────────────────
    const isTestnet = networkName.includes("Sepolia");
    const l1EidKey  = isTestnet ? "sepolia" : "mainnet";
    const l1Eid     = L1_EID[l1EidKey];

    const L2VoteCaster = await ethers.getContractFactory("L2VoteCaster");
    const caster = await L2VoteCaster.deploy(endpoint, deployer.address, l1Eid);
    await caster.waitForDeployment();
    const casterAddr = await caster.getAddress();
    console.log(`L2VoteCaster (${networkName}):`, casterAddr);
    manifest.L2VoteCaster = casterAddr;
    manifest.l1Eid = l1Eid.toString();

    // Wire ZK verifier on L2 (use same StubZKVerifier for testnet)
    const StubVerifier = await ethers.getContractFactory("StubZKVerifier");
    const stub = await StubVerifier.deploy();
    await stub.waitForDeployment();
    await caster.setZKVerifier(await stub.getAddress());
    console.log("L2 ZK verifier set:", await stub.getAddress());

    const manifestPath = path.join(__dirname, `../deployments/crosschain-${networkName}.json`);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ network: networkName, ...manifest }, null, 2));
    console.log("L2 manifest saved:", manifestPath);

    console.log("\nNext: set peers on both contracts:");
    console.log(`relay.setPeer(${isTestnet ? 40232 : 30111}, bytes32(${casterAddr}))  // if optimism`);
    console.log(`caster.setPeer(${l1Eid}, bytes32(<relay_address>))`);
  } else {
    throw new Error(`Unsupported network: ${networkName}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
