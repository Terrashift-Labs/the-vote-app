import client from "prom-client";

/**
 * MetricsService — Prometheus metrics for TheVoteApp backend.
 *
 * Exposes a /metrics endpoint (Prometheus scrape target).
 * All counters and histograms are registered on the default registry.
 *
 * Metrics:
 *   votes_cast_total           — counter   {policy_id, option}
 *   votes_cast_errors_total    — counter   {policy_id, channel}
 *   http_request_duration_ms   — histogram {method, route, status_code}
 *   active_websocket_clients   — gauge
 *   redis_operations_total     — counter   {operation, status}
 *   blockchain_rpc_duration_ms — histogram {method}
 */

// Collect default Node.js metrics (heap, CPU, GC, event loop lag, etc.)
client.collectDefaultMetrics({ prefix: "thevoteapp_" });

export const votesCastTotal = new client.Counter({
  name: "thevoteapp_votes_cast_total",
  help: "Total number of votes cast, by policy and option",
  labelNames: ["policy_id", "option", "channel"] as const,
});

export const voteErrorsTotal = new client.Counter({
  name: "thevoteapp_vote_errors_total",
  help: "Total number of vote submission errors",
  labelNames: ["policy_id", "channel"] as const,
});

export const httpRequestDuration = new client.Histogram({
  name: "thevoteapp_http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
});

export const activeWebSocketClients = new client.Gauge({
  name: "thevoteapp_active_websocket_clients",
  help: "Number of currently connected WebSocket clients",
});

export const redisOperationsTotal = new client.Counter({
  name: "thevoteapp_redis_operations_total",
  help: "Total Redis operations by operation type and status",
  labelNames: ["operation", "status"] as const,
});

export const blockchainRpcDuration = new client.Histogram({
  name: "thevoteapp_blockchain_rpc_duration_ms",
  help: "Blockchain RPC call duration in milliseconds",
  labelNames: ["method"] as const,
  buckets: [50, 100, 250, 500, 1000, 3000, 10000],
});

export const nullifierSetSize = new client.Gauge({
  name: "thevoteapp_nullifier_set_size",
  help: "Number of unique vote nullifiers recorded on-chain",
});

export const { register } = client;
