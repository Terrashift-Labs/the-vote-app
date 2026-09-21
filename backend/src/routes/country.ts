import { Router } from "express";
import { getAllCountries, getCountry } from "../countries";

export const countryRouter = Router();

/** GET /api/v1/countries — all supported country configs */
countryRouter.get("/", (_req, res) => {
  res.json(getAllCountries());
});

/** GET /api/v1/countries/:code — a single country config (ISO 3166-1 alpha-2) */
countryRouter.get("/:code", (req, res) => {
  const country = getCountry(req.params.code);
  if (!country) return res.status(404).json({ error: "Country not found" });
  return res.json(country);
});
