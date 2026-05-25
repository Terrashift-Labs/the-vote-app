import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../middleware/validateRequest";
import { VoteService } from "../services/VoteService";
import { BlockchainService } from "../services/BlockchainService";
import { logger } from "../utils/logger";

export const voteRouter = Router();

const voteSchema = z.object({
  policyId:       z.string().min(1).max(128).regex(/^[\w-]+$/),
  optionId:       z.string().min(1).max(128).regex(/^[\w-]+$/),
  voterNullifier: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  zkProof: z.object({
    pi_a:          z.array(z.string()).length(2),
    pi_b:          z.array(z.array(z.string()).length(2)).length(2),
    pi_c:          z.array(z.string()).length(2),
    publicSignals: z.array(z.string()),
  }),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  timestamp: z.number().int().positive(),
});

const verifySchema = z.object({
  nullifier: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  policyId:  z.string().min(1).max(128),
});

/**
 * POST /api/v1/vote
 * Relay a signed, ZK-proven vote to the blockchain.
 * Returns the transaction hash and block number.
 */
voteRouter.post(
  "/",
  validateRequest(voteSchema),
  async (req, res, next) => {
    try {
      const voteService = new VoteService(new BlockchainService());
      const receipt = await voteService.submitVote(req.body);

      // Never log vote content — only the tx hash
      logger.info({ txHash: receipt.transactionHash, event: "vote_cast" });

      res.status(201).json({
        transactionHash: receipt.transactionHash,
        blockNumber:     receipt.blockNumber,
        nullifier:       receipt.nullifier,
        timestamp:       receipt.timestamp,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/vote/verify
 * Verify that a nullifier appears in the on-chain Merkle tree.
 */
voteRouter.get(
  "/verify",
  validateRequest(verifySchema, "query"),
  async (req, res, next) => {
    try {
      const blockchainService = new BlockchainService();
      const recorded = await blockchainService.isNullifierSpent(
        req.query.nullifier as string
      );
      res.json({ recorded });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/vote/results/:policyId
 * Return the current vote tally for a policy.
 */
voteRouter.get("/results/:policyId", async (req, res, next) => {
  try {
    const blockchainService = new BlockchainService();
    const results = await blockchainService.getResults(req.params.policyId);
    res.json(results);
  } catch (err) {
    next(err);
  }
});
