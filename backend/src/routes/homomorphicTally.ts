import { Router, Request, Response, NextFunction } from "express";
import { homomorphicTallyService } from "../services/HomomorphicTallyService";

const router = Router();

/**
 * GET /api/v1/htally/:pollId/ciphertexts
 * Returns the accumulated ElGamal ciphertexts for all options of a poll.
 * These are public — anyone can verify the accumulation by replaying events.
 */
router.get("/:pollId/ciphertexts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const snapshots = await homomorphicTallyService.getCiphertexts(req.params.pollId);
    res.json(snapshots);
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/htally/:pollId/results
 * Returns decrypted tally results after the poll has been finalised.
 * Individual votes remain hidden; only the aggregate count is revealed.
 */
router.get("/:pollId/results", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await homomorphicTallyService.getTallyResults(req.params.pollId);
    res.json(results);
  } catch (err) { next(err); }
});

export default router;
