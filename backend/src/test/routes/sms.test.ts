import request from "supertest";
import { expect } from "chai";
import app from "../../app.js";

// Twilio signature validation is bypassed in NODE_ENV=test (see routes/sms.ts)
process.env.NODE_ENV = "test";

describe("POST /api/v1/sms/inbound", () => {
  const base = { From: "+447700900001", To: "+447700900999" };

  it("replies with help text for HELP command", async () => {
    const res = await request(app)
      .post("/api/v1/sms/inbound")
      .type("form")
      .send({ ...base, Body: "HELP" });
    expect(res.status).to.equal(200);
    expect(res.text).to.include("TheVoteApp SMS Voting");
  });

  it("rejects unknown command", async () => {
    const res = await request(app)
      .post("/api/v1/sms/inbound")
      .type("form")
      .send({ ...base, Body: "GIBBERISH" });
    expect(res.status).to.equal(200);
    expect(res.text).to.include("Unrecognised");
  });

  it("accepts a valid vote command", async () => {
    const res = await request(app)
      .post("/api/v1/sms/inbound")
      .type("form")
      .send({ ...base, Body: "VOTE POL-001 SUPPORT" });
    expect(res.status).to.equal(200);
    expect(res.text).to.include("Vote recorded");
  });

  it("prevents double-voting from same number", async () => {
    await request(app)
      .post("/api/v1/sms/inbound")
      .type("form")
      .send({ ...base, Body: "VOTE POL-DUP OPPOSE" });

    const res = await request(app)
      .post("/api/v1/sms/inbound")
      .type("form")
      .send({ ...base, Body: "VOTE POL-DUP OPPOSE" });
    expect(res.text).to.include("already voted");
  });

  it("returns 400 for missing From", async () => {
    const res = await request(app)
      .post("/api/v1/sms/inbound")
      .type("form")
      .send({ Body: "VOTE POL-001 SUPPORT" });
    expect(res.status).to.equal(400);
  });
});
