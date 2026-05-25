/**
 * Smoke test — 1 VU, 1 minute.
 * Verifies all critical endpoints respond correctly before a load test run.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  vus: 1,
  duration: "1m",
  thresholds: {
    http_req_failed:   ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  // Liveness
  let r = http.get(`${BASE}/api/v1/health`);
  check(r, { "health 200": (res) => res.status === 200 });

  // Policy list
  r = http.get(`${BASE}/api/v1/policy`);
  check(r, { "policy list 200": (res) => res.status === 200, "is array": (res) => Array.isArray(JSON.parse(res.body)) });

  // Country list
  r = http.get(`${BASE}/api/v1/country`);
  check(r, { "country list 200": (res) => res.status === 200 });

  // FIDO2 options (should return a challenge)
  r = http.post(`${BASE}/api/v1/fido2/register/options`,
    JSON.stringify({ userId: `smoke-${__VU}`, displayName: "Smoke Test" }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(r, { "fido2 options 200": (res) => res.status === 200 });

  sleep(1);
}
