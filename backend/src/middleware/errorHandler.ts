import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Never expose internal error details to the client
  const safe = sanitizeError(err);
  logger.error({ message: safe.internal, path: req.path, method: req.method });

  res.status(safe.status).json({ error: safe.client });
}

function sanitizeError(err: Error): {
  status: number;
  client: string;
  internal: string;
} {
  const msg = err.message ?? "Unknown error";

  if (msg.includes("NullifierSpent"))
    return { status: 409, client: "This vote has already been cast.", internal: msg };

  if (msg.includes("PollClosed"))
    return { status: 410, client: "This poll is closed.", internal: msg };

  if (msg.includes("InvalidZKProof") || msg.includes("verification failed"))
    return { status: 400, client: "Invalid vote proof.", internal: msg };

  if (msg.includes("Invalid vote signature"))
    return { status: 400, client: "Invalid vote signature.", internal: msg };

  if (msg.includes("stale"))
    return { status: 400, client: "Vote payload has expired.", internal: msg };

  if (msg.includes("validation"))
    return { status: 422, client: msg, internal: msg };

  // Generic — don't leak internals
  return {
    status: 500,
    client: "An unexpected error occurred.",
    internal: msg,
  };
}
