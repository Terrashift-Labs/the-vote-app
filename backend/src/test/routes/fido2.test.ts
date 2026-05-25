import request from "supertest";
import { expect } from "chai";
import app from "../../app.js";

describe("POST /api/v1/fido2/register/options", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .post("/api/v1/fido2/register/options")
      .send({ displayName: "Alice" });
    expect(res.status).to.equal(400);
  });

  it("returns options object for valid user", async () => {
    const res = await request(app)
      .post("/api/v1/fido2/register/options")
      .send({ userId: "user-test-001", displayName: "Test User" });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("challenge");
    expect(res.body).to.have.property("rp");
    expect(res.body).to.have.property("user");
  });
});

describe("POST /api/v1/fido2/authenticate/options", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .post("/api/v1/fido2/authenticate/options")
      .send({});
    expect(res.status).to.equal(400);
  });

  it("returns options for known user", async () => {
    // First register to seed a user
    await request(app)
      .post("/api/v1/fido2/register/options")
      .send({ userId: "user-auth-test", displayName: "Auth Test" });

    const res = await request(app)
      .post("/api/v1/fido2/authenticate/options")
      .send({ userId: "user-auth-test" });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("challenge");
  });
});
