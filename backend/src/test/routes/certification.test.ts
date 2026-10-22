import request from "supertest";
import { expect } from "chai";
import sinon from "sinon";
import app from "../../app.js";
import { BlockchainService } from "../../services/BlockchainService.js";
import { certificationService } from "../../services/CertificationService.js";

const HASH = "0x" + "ab".repeat(32);
const body = {
  policyTitle: "Test policy",
  countryCode: "GB",
  txHash: HASH,
  merkleRoot: HASH,
};

describe("POST /api/v1/certification/:pollId", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.RPC_URL = "http://127.0.0.1:0";
    process.env.RELAY_PRIVATE_KEY = "0x" + "11".repeat(32);
    process.env.VOTE_LEDGER_ADDRESS = "0x" + "22".repeat(20);
    process.env.POLICY_REGISTRY_ADDRESS = "0x" + "33".repeat(20);
  });

  afterEach(() => {
    sinon.restore();
    process.env = { ...saved };
  });

  it("returns 503 when ADMIN_API_TOKEN is not configured", async () => {
    delete process.env.ADMIN_API_TOKEN;
    const res = await request(app).post("/api/v1/certification/p1").send(body);
    expect(res.status).to.equal(503);
  });

  it("returns 401 without a valid bearer token", async () => {
    process.env.ADMIN_API_TOKEN = "secret";
    const none = await request(app).post("/api/v1/certification/p1").send(body);
    const bad = await request(app)
      .post("/api/v1/certification/p1")
      .set("Authorization", "Bearer wrong")
      .send(body);
    expect(none.status).to.equal(401);
    expect(bad.status).to.equal(401);
  });

  it("returns 400 for a malformed txHash", async () => {
    process.env.ADMIN_API_TOKEN = "secret";
    const res = await request(app)
      .post("/api/v1/certification/p1")
      .set("Authorization", "Bearer secret")
      .send({ ...body, txHash: "nope" });
    expect(res.status).to.equal(400);
  });

  it("returns 422 when the transaction is not confirmed on-chain", async () => {
    process.env.ADMIN_API_TOKEN = "secret";
    sinon.stub(BlockchainService.prototype, "getReceipt").resolves(null);
    const res = await request(app)
      .post("/api/v1/certification/p1")
      .set("Authorization", "Bearer secret")
      .send(body);
    expect(res.status).to.equal(422);
  });

  it("returns 201 with a CID for a confirmed transaction", async () => {
    process.env.ADMIN_API_TOKEN = "secret";
    sinon.stub(BlockchainService.prototype, "getReceipt").resolves({
      transactionHash: HASH, blockNumber: 1, status: "success",
    });
    sinon.stub(certificationService, "certify").resolves({
      cid: "bafytest", signature: "sig", issuedAt: "2026-01-01T00:00:00.000Z",
    });
    const res = await request(app)
      .post("/api/v1/certification/p1")
      .set("Authorization", "Bearer secret")
      .send(body);
    expect(res.status).to.equal(201);
    expect(res.body.cid).to.equal("bafytest");
  });
});
