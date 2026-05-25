import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === "production"
      ? winston.format.json()          // structured JSON in prod
      : winston.format.simple()        // human-readable in dev
  ),
  transports: [
    new winston.transports.Console(),
  ],
  // In production, add a file transport or ship to a log aggregator.
  // Ensure the log aggregator never stores vote payloads (see requestLogger.ts).
});
