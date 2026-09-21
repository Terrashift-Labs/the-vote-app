import "dotenv/config";
import { createServer } from "http";
import app from "./app";
import { setupWSBroadcaster } from "./services/WSBroadcaster";
import { liveTallyService } from "./services/LiveTallyService";
import { homomorphicTallyService } from "./services/HomomorphicTallyService";
import { logger } from "./utils/logger";

const server = createServer(app);

// ── WebSocket (live results) ──────────────────────────────────────────────────

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
