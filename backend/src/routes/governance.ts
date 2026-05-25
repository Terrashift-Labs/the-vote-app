import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import logger from "../utils/logger.js";

const router = Router();

// Minimal Governor ABI — only what the mobile UI needs
const GOVERNOR_ABI = [
  "function proposalCount() view returns (uint256)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
  "function castVote(uint256 proposalId, uint8 support) returns (uint256)",
  "function hasVoted(uint256 proposalId, address account) view returns (bool)",
  "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
  "event ProposalCreated(uint256 indexed proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
];

// Proposal states from OpenZeppelin Governor
const PROPOSAL_STATES = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"] as const;

function getGovernor() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL ?? "http://localhost:8545");
  const address  = process.env.VOTE_GOVERNOR_ADDRESS ?? ethers.ZeroAddress;
  return new ethers.Contract(address, GOVERNOR_ABI, provider);
}

function getGovernorSigner() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL ?? "http://localhost:8545");
  const wallet   = new ethers.Wallet(process.env.RELAY_PRIVATE_KEY ?? "", provider);
  const address  = process.env.VOTE_GOVERNOR_ADDRESS ?? ethers.ZeroAddress;
  return new ethers.Contract(address, GOVERNOR_ABI, wallet);
}

/**
 * GET /api/v1/governance/proposals
 * Returns all proposals with their current state and vote totals.
 * Queries on-chain events for proposal metadata.
 */
router.get("/proposals", async (_req: Request, res: Response) => {
  try {
    const gov = getGovernor();
    const filter = gov.filters.ProposalCreated();
    const events = await gov.queryFilter(filter);

    const proposals = await Promise.all(
      events.map(async (evt) => {
        const e = evt as ethers.EventLog;
        const proposalId  = e.args[0] as bigint;
        const proposer    = e.args[1] as string;
        const description = e.args[8] as string;
        const voteStart   = Number(e.args[6]);
        const voteEnd     = Number(e.args[7]);

        const [stateNum, votes, deadline] = await Promise.all([
          gov.state(proposalId).catch(() => 0),
          gov.proposalVotes(proposalId).catch(() => [0n, 0n, 0n]),
          gov.proposalDeadline(proposalId).catch(() => 0n),
        ]);

        return {
          proposalId: proposalId.toString(),
          proposer,
          description,
          state: PROPOSAL_STATES[stateNum as number] ?? "Unknown",
          voteStart,
          voteEnd:  Number(deadline),
          votes: {
            for:     votes[1].toString(),
            against: votes[0].toString(),
            abstain: votes[2].toString(),
          },
        };
      })
    );

    res.json({ proposals });
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to fetch governance proposals");
    res.status(500).json({ error: "Failed to fetch proposals" });
  }
});

/**
 * GET /api/v1/governance/proposals/:proposalId
 */
router.get("/proposals/:proposalId", async (req: Request, res: Response) => {
  const { proposalId } = req.params;
  try {
    const gov = getGovernor();
    const id  = BigInt(proposalId);

    const [stateNum, votes, deadline, snapshot] = await Promise.all([
      gov.state(id),
      gov.proposalVotes(id),
      gov.proposalDeadline(id),
      gov.proposalSnapshot(id),
    ]);

    res.json({
      proposalId,
      state:    PROPOSAL_STATES[stateNum as number] ?? "Unknown",
      snapshot: Number(snapshot),
      deadline: Number(deadline),
      votes: {
        for:     votes[1].toString(),
        against: votes[0].toString(),
        abstain: votes[2].toString(),
      },
    });
  } catch (err: any) {
    res.status(404).json({ error: "Proposal not found" });
  }
});

/**
 * POST /api/v1/governance/proposals/:proposalId/vote
 * Body: { support: 0 | 1 | 2 }  (0=against, 1=for, 2=abstain)
 */
const CastVoteBody = z.object({ support: z.union([z.literal(0), z.literal(1), z.literal(2)]) });

router.post("/proposals/:proposalId/vote", async (req: Request, res: Response) => {
  const parsed = CastVoteBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "support must be 0 (against), 1 (for), or 2 (abstain)" });
  }

  const { proposalId } = req.params;
  const { support }    = parsed.data;

  try {
    const gov = getGovernorSigner();
    const tx  = await gov.castVote(BigInt(proposalId), support);
    const receipt = await tx.wait();
    logger.info({ proposalId, support, txHash: receipt.hash }, "Governance vote cast");
    res.json({ txHash: receipt.hash });
  } catch (err: any) {
    logger.error({ proposalId, err: err.message }, "Governance vote failed");
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/governance/proposals
 * Body: { targets, values, calldatas, description }
 * Admin only — requires PROPOSER_ROLE or sufficient VoteToken balance.
 */
const ProposeBody = z.object({
  targets:     z.array(z.string()),
  values:      z.array(z.string()),
  calldatas:   z.array(z.string()),
  description: z.string().min(10).max(4096),
});

router.post("/proposals", async (req: Request, res: Response) => {
  const parsed = ProposeBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid proposal", details: parsed.error.flatten() });
  }

  const { targets, values, calldatas, description } = parsed.data;

  try {
    const gov = getGovernorSigner();
    const tx  = await gov.propose(
      targets,
      values.map(BigInt),
      calldatas.map((c) => ethers.getBytes(c)),
      description
    );
    const receipt = await tx.wait();
    logger.info({ txHash: receipt.hash, description: description.slice(0, 60) }, "Governance proposal created");
    res.status(201).json({ txHash: receipt.hash });
  } catch (err: any) {
    logger.error({ err: err.message }, "Governance proposal failed");
    res.status(500).json({ error: err.message });
  }
});

export default router;
