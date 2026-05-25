import request from "supertest";
import { expect } from "chai";
import app from "../../app.js";

describe("POST /api/v1/did/commitment", () => {
  it("returns 400 when vcJwt is missing", async () => {
    const res = await request(app)
      .post("/api/v1/did/commitment")
      .send({ countryCode: "GB", salt: "abc123" });
    expect(res.status).to.equal(400);
  });

  it("returns 400 when countryCode is missing", async () => {
    const res = await request(app)
      .post("/api/v1/did/commitment")
      .send({ vcJwt: "eyJ...", salt: "abc123" });
    expect(res.status).to.equal(400);
  });
});

describe("GET /api/v1/did/resolve", () => {
  it("returns 400 when did param is missing", async () => {
    const res = await request(app).get("/api/v1/did/resolve");
    expect(res.status).to.equal(400);
  });

  it("returns 400 for malformed DID", async () => {
    const res = await request(app).get("/api/v1/did/resolve?did=not-a-did");
    expect(res.status).to.equal(400);
  });
});
