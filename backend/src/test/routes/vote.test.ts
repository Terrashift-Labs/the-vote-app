import request from "supertest";
import { expect } from "chai";
import app from "../../app.js";

describe("POST /api/v1/vote/submit", () => {
  const validPayload = {
    policyId: "pol-001",
    optionId: "option-support",
    voterNullifier: "0x" + "ab".repeat(32),
    zkProof: { pi_a: ["1", "2"], pi_b: ["3", "4"], pi_c: ["5", "6"], publicSignals: ["7"] },
    signature: "0x" + "cd".repeat(65),
    timestamp: Date.now(),
  };

  it("returns 400 when body is empty", async () => {
    const res = await request(app).post("/api/v1/vote/submit").send({});
    expect(res.status).to.equal(400);
  });

  it("returns 400 when policyId is missing", async () => {
    const { policyId: _, ...body } = validPayload;
    const res = await request(app).post("/api/v1/vote/submit").send(body);
    expect(res.status).to.equal(400);
  });

  it("returns 400 when nullifier is malformed", async () => {
    const res = await request(app)
      .post("/api/v1/vote/submit")
      .send({ ...validPayload, voterNullifier: "not-a-hex" });
    expect(res.status).to.equal(400);
  });
});

describe("GET /api/v1/vote/receipt/:txHash", () => {
  it("returns 400 for invalid tx hash", async () => {
    const res = await request(app).get("/api/v1/vote/receipt/not-a-hash");
    expect(res.status).to.equal(400);
  });

  it("returns 404 for unknown tx hash", async () => {
    const res = await request(app).get("/api/v1/vote/receipt/0x" + "00".repeat(32));
    expect(res.status).to.equal(404);
  });
});
