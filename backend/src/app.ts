import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { voteRouter } from "./routes/vote";
import { policyRouter } from "./routes/policy";
import { countryRouter } from "./routes/country";
import { healthRouter } from "./routes/health";
import metricsRouter from "./routes/metrics";
import docsRouter from "./routes/docs";
import { didRouter } from "./routes/did";
import fido2Router from "./routes/fido2";
import smsRouter from "./routes/sms";
import ussdRouter from "./routes/ussd";
import qrRouter from "./routes/qr";
import governanceRouter from "./routes/governance";
import auditRouter from "./routes/audit";
import notificationsRouter from "./routes/notifications";
import ipfsRouter from "./routes/ipfs";
import identityRouter from "./routes/identity";
import healthDeepRouter from "./routes/healthDeep";
import wellKnownRouter from "./routes/wellKnown";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { metricsMiddleware } from "./middleware/metricsMiddleware";
import { voteLimiter, auditLimiter, fido2Limiter } from "./middleware/rateLimitRedis";
import hTallyRouter from "./routes/homomorphicTally";

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'none'"],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? "http://localhost:3001",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));

// Global burst protection (express-rate-limit as a backstop for all routes)
const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.RATE_LIMIT_MAX ?? 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait before submitting again." },
});

app.use(express.json({ limit: "64kb" }));  // small limit — no file uploads
app.use(requestLogger);
app.use(metricsMiddleware);
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────

app.use("/metrics", metricsRouter); // Prometheus scrape — restrict to internal net in prod
app.use("/docs",    docsRouter);    // Swagger UI + /docs/openapi.json
app.use("/health",  healthRouter);
app.use("/api/v1/countries", countryRouter);
app.use("/api/v1/policy", policyRouter);
app.use("/api/v1/vote/qr", voteLimiter, qrRouter);
app.use("/api/v1/vote",   voteLimiter, voteRouter);   // Redis sliding-window per-IP per-country
app.use("/api/v1/health/deep", healthDeepRouter);
app.use("/.well-known", wellKnownRouter);
app.use("/api/v1/did", didRouter);
app.use("/api/v1/fido2", fido2Limiter, fido2Router);
app.use("/api/v1/sms", express.urlencoded({ extended: false }), smsRouter);
app.use("/api/v1/ussd", express.urlencoded({ extended: false }), ussdRouter);
app.use("/api/v1/governance", governanceRouter);
app.use("/api/v1/audit", auditLimiter, auditRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/ipfs", ipfsRouter);
app.use("/api/v1/identity", identityRouter);
app.use("/api/v1/htally", hTallyRouter);             // Homomorphic tally ciphertexts + results

// ── Error handling ─────────────────────────────────────────────────────────────

app.use(errorHandler);

export default app;
