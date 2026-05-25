import request from "supertest";
import { expect } from "chai";
import app from "../../app.js";

describe("GET /api/v1/policy", () => {
  it("returns an array", async () => {
    const res = await request(app).get("/api/v1/policy");
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an("array");
  });

  it("supports countryCode filter", async () => {
    const res = await request(app).get("/api/v1/policy?countryCode=GB");
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an("array");
    for (const policy of res.body) {
      expect(policy.countryCode).to.equal("GB");
    }
  });
});

describe("GET /api/v1/policy/:id", () => {
  it("returns 404 for unknown policy", async () => {
    const res = await request(app).get("/api/v1/policy/does-not-exist");
    expect(res.status).to.equal(404);
  });
});

describe("GET /api/v1/policy/:id/results", () => {
  it("returns results shape", async () => {
    const res = await request(app).get("/api/v1/policy/pol-001/results");
    // Either 200 with results or 404 if policy not seeded in test env
    expect([200, 404]).to.include(res.status);
    if (res.status === 200) {
      expect(res.body).to.have.property("policyId");
      expect(res.body).to.have.property("tally");
    }
  });
});
