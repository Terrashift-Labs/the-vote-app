#!/usr/bin/env node
/**
 * verify-vote — TheVoteApp standalone auditor CLI.
 *
 * Connects directly to a public RPC node and IPFS gateway.
 * No backend server required — fully independent third-party verification.
 *
 * Commands:
 *   verify-receipt <txHash>             Confirm a vote is on-chain
 *   audit-policy   <policyId>           Show tally + document CID for a policy
 *   check-nullifier <nullifier>         Check if a nullifier has been used
 */
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";

const DEFAULT_RPC   = "https://sepolia.infura.io/v3/public";
const DEFAULT_IPFS  = "https://ipfs.io/ipfs/";
const VOTE_LEDGER   = process.env.VOTE_LEDGER_ADDRESS ?? "0x0000000000000000000000000000000000000000";
const POLICY_REG    = process.env.POLICY_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000";

const VOTE_LEDGER_ABI = [
  "event VoteCast(bytes32 indexed policyIdHash, bytes32 indexed nullifier, string optionId, uint256 blockNumber)",
  "function usedNullifiers(bytes32) view returns (bool)",
];
const POLICY_REG_ABI = [
  "function getDocumentCID(bytes32 policyIdHash) view returns (string)",
];

function makeProvider(rpc: string) {
  return new ethers.JsonRpcProvider(rpc);
}

const program = new Command()
  .name("verify-vote")
  .description("TheVoteApp independent ledger auditor — no backend required")
  .version("1.0.0")
  .option("--rpc <url>",  "Ethereum JSON-RPC URL", DEFAULT_RPC)
  .option("--ipfs <url>", "IPFS gateway base URL", DEFAULT_IPFS);

// ── verify-receipt ────────────────────────────────────────────────────────────

program
  .command("verify-receipt <txHash>")
  .description("Confirm a vote transaction is on-chain and decode its contents")
  .action(async (txHash: string, _opts, cmd) => {
    const { rpc } = cmd.parent?.opts() ?? {};
    const spinner = ora("Querying blockchain…").start();
    try {
      const provider  = makeProvider(rpc ?? DEFAULT_RPC);
      const receipt   = await provider.getTransactionReceipt(txHash);
      if (!receipt) { spinner.fail(chalk.red("Transaction not found.")); return; }

      const contract = new ethers.Contract(VOTE_LEDGER, VOTE_LEDGER_ABI, provider);
      const filter   = contract.filters.VoteCast();
      const logs     = await contract.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
      const matchLog = logs.find(l => l.transactionHash.toLowerCase() === txHash.toLowerCase());

      spinner.stop();
      if (!matchLog) {
        console.log(chalk.yellow("Transaction found but no VoteCast event — may not be a vote TX."));
        return;
      }
      const e = matchLog as ethers.EventLog;
      console.log(chalk.green("Vote confirmed on-chain\n"));
      console.log(chalk.bold("Transaction: ") + txHash);
      console.log(chalk.bold("Block:       ") + receipt.blockNumber);
      console.log(chalk.bold("Policy hash: ") + e.args[0]);
      console.log(chalk.bold("Nullifier:   ") + e.args[1]);
      console.log(chalk.bold("Option:      ") + e.args[2]);
    } catch (err: any) {
      spinner.fail(chalk.red(err.message));
    }
  });

// ── audit-policy ──────────────────────────────────────────────────────────────

program
  .command("audit-policy <policyId>")
  .description("Show vote tally and IPFS document CID for a policy")
  .action(async (policyId: string, _opts, cmd) => {
    const { rpc, ipfs } = cmd.parent?.opts() ?? {};
    const spinner = ora("Reading ledger events…").start();
    try {
      const provider = makeProvider(rpc ?? DEFAULT_RPC);
      const contract = new ethers.Contract(VOTE_LEDGER, VOTE_LEDGER_ABI, provider);
      const policyReg = new ethers.Contract(POLICY_REG, POLICY_REG_ABI, provider);

      const policyIdHash = ethers.id(policyId);
      const [events, cid] = await Promise.all([
        contract.queryFilter(contract.filters.VoteCast(policyIdHash)),
        policyReg.getDocumentCID(policyIdHash).catch(() => null),
      ]);

      const tally: Record<string, number> = {};
      const seen = new Set<string>();
      for (const ev of events) {
        const e = ev as ethers.EventLog;
        const nullifier = e.args[1] as string;
        const option    = e.args[2] as string;
        if (seen.has(nullifier)) continue;
        seen.add(nullifier);
        tally[option] = (tally[option] ?? 0) + 1;
      }

      spinner.stop();
      console.log(chalk.green(`\nPolicy: ${policyId}`));
      console.log(chalk.bold("Total votes: ") + events.length);
      for (const [opt, count] of Object.entries(tally)) {
        const pct = Math.round((count / events.length) * 100);
        console.log(`  ${opt.padEnd(20)} ${count} (${pct}%)`);
      }
      if (cid) {
        console.log(chalk.bold("\nDocument CID: ") + cid);
        console.log(chalk.bold("Document URL: ") + `${ipfs ?? DEFAULT_IPFS}${cid}`);
      }
    } catch (err: any) {
      spinner.fail(chalk.red(err.message));
    }
  });

// ── check-nullifier ───────────────────────────────────────────────────────────

program
  .command("check-nullifier <nullifier>")
  .description("Check whether a nullifier has already been used (prevents double-voting)")
  .action(async (nullifier: string, _opts, cmd) => {
    const { rpc } = cmd.parent?.opts() ?? {};
    const spinner = ora("Checking nullifier…").start();
    try {
      const provider = makeProvider(rpc ?? DEFAULT_RPC);
      const contract = new ethers.Contract(VOTE_LEDGER, VOTE_LEDGER_ABI, provider);
      const used: boolean = await contract.usedNullifiers(nullifier);
      spinner.stop();
      if (used) {
        console.log(chalk.yellow("Nullifier has been used — vote already cast."));
      } else {
        console.log(chalk.green("Nullifier is unused — no vote recorded for this identity/policy pair."));
      }
    } catch (err: any) {
      spinner.fail(chalk.red(err.message));
    }
  });

program.parseAsync(process.argv);
