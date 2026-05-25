import { Router, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const router = Router();

const __dir = dirname(fileURLToPath(import.meta.url));
const spec  = yaml.load(
  readFileSync(join(__dir, "../../openapi.yaml"), "utf8")
) as object;

/** GET /docs — Swagger UI interactive API explorer */
router.use("/", swaggerUi.serve);
router.get("/", swaggerUi.setup(spec, {
  customSiteTitle: "TheVoteApp API Docs",
  customCss: ".swagger-ui .topbar { background: #1d70b8; }",
}));

/** GET /docs/openapi.json — machine-readable spec */
router.get("/openapi.json", (_req: Request, res: Response) => {
  res.json(spec);
});

export default router;
