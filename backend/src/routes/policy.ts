import { Router } from "express";
import { getAllCountries } from "../countries";
import { tallyService } from "../services/TallyService";

export const policyRouter = Router();

function allPolicies() {
  return getAllCountries().flatMap((c) =>
    c.policies.map((p) => ({ ...p, countryCode: c.code }))
  );
}

/** GET /api/v1/policy[?countryCode=GB] */
policyRouter.get("/", (req, res) => {
  const cc = typeof req.query.countryCode === "string" ? req.query.countryCode.toUpperCase() : null;
  const policies = allPolicies();
  res.json(cc ? policies.filter((p) => p.countryCode === cc) : policies);
});

/** GET /api/v1/policy/:id */
policyRouter.get("/:id", (req, res) => {
  const policy = allPolicies().find((p) => p.id === req.params.id);
  if (!policy) return res.status(404).json({ error: "Policy not found" });
  return res.json(policy);
});

/** GET /api/v1/policy/:id/results — public on-chain tally */
policyRouter.get("/:id/results", async (req, res, next) => {
  try {
    if (!allPolicies().some((p) => p.id === req.params.id)) {
      return res.status(404).json({ error: "Policy not found" });
    }
    const tally = await tallyService.getTally(req.params.id);
    return res.json({ policyId: req.params.id, tally });
  } catch (err) {
    return next(err);
  }
});
