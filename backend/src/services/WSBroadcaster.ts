import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import logger from "../utils/logger.js";
import { liveTallyService } from "./LiveTallyService.js";
import { activeWebSocketClients } from "../metrics/MetricsService.js";

/**
 * WSBroadcaster — mounts a WebSocket server and broadcasts live tally updates.
 *
 * Protocol (JSON messages):
 *
 *   Client → Server:
 *     { type: "subscribe",   policyId: string }  — receive updates for this policy
 *     { type: "unsubscribe", policyId: string }
 *     { type: "ping" }
 *
 *   Server → Client:
 *     { type: "tally",   policyId, tally, blockNumber }  — live update
 *     { type: "snapshot", policyId, tally }               — on subscribe
 *     { type: "pong" }
 *     { type: "error",  message: string }
 */

export function setupWSBroadcaster(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/tally" });

  // Map: WebSocket client → set of subscribed policyIds
  const subscriptions = new Map<WebSocket, Set<string>>();

  wss.on("connection", (ws) => {
    subscriptions.set(ws, new Set());
    activeWebSocketClients.inc();
    logger.info({ clients: wss.clients.size }, "WebSocket client connected");

    ws.on("message", (raw) => {
      let msg: { type: string; policyId?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (!msg.policyId) {
        ws.send(JSON.stringify({ type: "error", message: "policyId required" }));
        return;
      }

      const subs = subscriptions.get(ws)!;

      if (msg.type === "subscribe") {
        subs.add(msg.policyId);
        // Send current snapshot immediately
        const snapshot = liveTallyService.getSnapshot(msg.policyId);
        if (snapshot) {
          ws.send(JSON.stringify({ type: "snapshot", policyId: msg.policyId, tally: snapshot }));
        }
      } else if (msg.type === "unsubscribe") {
        subs.delete(msg.policyId);
      }
    });

    ws.on("close", () => {
      subscriptions.delete(ws);
      activeWebSocketClients.dec();
      logger.info({ clients: wss.clients.size }, "WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.warn({ err: err.message }, "WebSocket error");
    });
  });

  // Forward LiveTallyService events to subscribed clients
  liveTallyService.on("tally", (update) => {
    const payload = JSON.stringify({ type: "tally", ...update });
    for (const [ws, subs] of subscriptions) {
      if (ws.readyState === WebSocket.OPEN && subs.has(update.policyId)) {
        ws.send(payload);
      }
    }
  });

  logger.info("WebSocket tally broadcaster ready on /ws/tally");
  return wss;
}
