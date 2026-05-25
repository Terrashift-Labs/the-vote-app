/**
 * Load test — 100 VUs, 5 minutes.
 * Simulates concurrent voters browsing policies and submitting votes.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    { duration: "30s", target: 100 },  // ramp up
    { duration: "4m",  target: 100 },  // hold
    { duration: "30s", target: 0   },  // ramp down
  ],
  thresholds: {
    http_req_failed:           ["rate<0.02"],
    http_req_duration:         ["p(95)<500", "p(99)<1000"],
    "http_req_duration{name:vote_submit}": ["p(95)<2000"],
  },
};

export default function () {
  const userId = `load-${__VU}-${uuidv4().slice(0, 8)}`;

  // 1. Browse policies
  let r = http.get(`${BASE}/api/v1/policy?countryCode=GB`, { tags: { name: "policy_list" } });
  check(r, { "policies ok": (res) => res.status === 200 });
  sleep(randomIntBetween(1, 3));

  // 2. Get policy detail
  r = http.get(`${BASE}/api/v1/policy/pol-001`, { tags: { name: "policy_detail" } });
  check(r, { "policy detail ok": (res) => [200, 404].includes(res.status) });
  sleep(randomIntBetween(1, 2));

  // 3. Get vote results
  r = http.get(`${BASE}/api/v1/policy/pol-001/results`, { tags: { name: "results" } });
  check(r, { "results ok": (res) => [200, 404].includes(res.status) });

  // 4. Submit a vote (stub payload — ZK proof empty)
  const nullifier = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  r = http.post(`${BASE}/api/v1/vote/submit`,
    JSON.stringify({
      policyId:       "pol-001",
      optionId:       "option-support",
      voterNullifier: nullifier,
      zkProof:        { pi_a: [], pi_b: [], pi_c: [], publicSignals: [] },
      signature:      "0x" + "ab".repeat(65),
      timestamp:      Date.now(),
    }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "vote_submit" } }
  );
  check(r, { "vote response received": (res) => [200, 201, 400, 409].includes(res.status) });

  sleep(randomIntBetween(2, 5));
}
