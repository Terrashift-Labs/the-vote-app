import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { voteRouter } from "./routes/vote";
import { policyRouter } from "./routes/policy";
import { countryRouter } from "./routes/country";
import { healthRouter } from "./routes/health";
import metricsRouter from "./routes/metrics";
import docsRouter from "./routes/docs";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { metricsMiddleware } from "./middleware/metricsMiddleware";
import { voteLimiter, auditLimiter, fido2Limiter } from "./middleware/rateLimitRedis";
import { setupWebSocket } from "./services/websocket";
import { setupWSBroadcaster } from "./services/WSBroadcaster";
import { liveTallyService } from "./services/LiveTallyService";
import { homomorphicTallyService } from "./services/HomomorphicTallyService";
import hTallyRouter from "./routes/homomorphicTally";
import { logger } from "./utils/logger";

const app = express();
const server = createServer(app);

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
app.use("/api/v1/policies", policyRouter);
app.use("/api/v1/vote",   voteLimiter, voteRouter);   // Redis sliding-window per-IP per-country
app.use("/api/v1/htally", hTallyRouter);             // Homomorphic tally ciphertexts + results

// ── Error handling ─────────────────────────────────────────────────────────────

app.use(errorHandler);

// ── WebSocket (live results) ──────────────────────────────────────────────────

setupWebSocket(server);
setupWSBroadcaster(server);  // /ws/tally — live tally feed

// Start listening for on-chain VoteCast events
liveTallyService.start().catch((err) =>
  logger.error({ err }, "LiveTallyService failed to start")
);

// Start homomorphic tally service (watches for encrypted vote accumulation + auto-finalises)
homomorphicTallyService.start().catch((err) =>
  logger.error({ err }, "HomomorphicTallyService failed to start")
);

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => {
  logger.info(`TheVoteApp API listening on port ${PORT}`);
});

export { app, server };
