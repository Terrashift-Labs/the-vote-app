import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../middleware/validateRequest";
import { DIDService } from "../did/DIDService";

export const didRouter = Router();

const didService = new DIDService(process.env.RPC_URL!, process.env.DID_NETWORK ?? "sepolia");

const resolveSchema = z.object({
  did: z.string().regex(/^did:ethr:[a-z0-9]+:0x[0-9a-fA-F]{40}$/),
});

const vcSchema = z.object({
  vcJwt:       z.string().min(10),
  countryCode: z.string().length(2).toUpperCase(),
  salt:        z.string().min(16),
});

/**
 * GET /api/v1/did/resolve?did=did:ethr:sepolia:0x...
 * Resolve a DID to its W3C DID Document.
 */
didRouter.get(
  "/resolve",
  validateRequest(resolveSchema, "query"),
  async (req, res, next) => {
    try {
      const doc = await didService.resolve(req.query.did as string);
      res.json(doc);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/did/commitment
 * Derive a voter identity commitment from a DID and country code.
 * The commitment is what gets registered in VoterRegistry.
 * The DID is never stored by the backend.
 */
didRouter.post(
  "/commitment",
  validateRequest(vcSchema),
  async (req, res, next) => {
    try {
      const { vcJwt, countryCode, salt } = req.body;

      // Verify the VC issued by the national identity oracle
      const vc = await didService.verifyCredential(vcJwt);
      if (!vc.isValid) {
        res.status(400).json({ error: "Invalid verifiable credential" });
        return;
      }
      if (vc.countryCode !== countryCode) {
        res.status(400).json({ error: "Credential country mismatch" });
        return;
      }

      const commitment = didService.deriveIdentityCommitment(vc.subjectDID, countryCode, salt);

      // Never log the DID — only the commitment hash
      res.json({ commitment });
    } catch (err) {
      next(err);
    }
  }
);
