/**
 * Stress test — ramps to 500 VUs to find the breaking point.
 * Run against a staging environment, never production.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    { duration: "2m",  target: 100 },
    { duration: "2m",  target: 200 },
    { duration: "2m",  target: 300 },
    { duration: "2m",  target: 500 },
    { duration: "2m",  target: 500 },  // hold at peak
    { duration: "1m",  target: 0   },  // ramp down
  ],
  thresholds: {
    http_req_failed:   ["rate<0.10"],  // tolerate up to 10% errors under stress
    http_req_duration: ["p(99)<3000"],
  },
};

export default function () {
  const r = http.get(`${BASE}/api/v1/policy`, { tags: { name: "policy_list" } });
  check(r, { "2xx or 429": (res) => res.status < 500 });
  sleep(1);
}
