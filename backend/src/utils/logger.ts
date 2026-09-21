import winston from "winston";

const base = winston.createLogger({
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

type Level = "debug" | "info" | "warn" | "error";
type LogFn = (objOrMsg: string | Record<string, unknown>, msg?: string) => void;

/** Accepts both `logger.info("msg")` and pino-style `logger.info({ ctx }, "msg")`. */
function wrap(level: Level): LogFn {
  return (objOrMsg, msg) => {
    if (typeof objOrMsg === "string") {
      base.log(level, objOrMsg);
    } else {
      base.log(level, msg ?? "", objOrMsg);
    }
  };
}

export const logger = {
  debug: wrap("debug"),
  info:  wrap("info"),
  warn:  wrap("warn"),
  error: wrap("error"),
};

export default logger;
