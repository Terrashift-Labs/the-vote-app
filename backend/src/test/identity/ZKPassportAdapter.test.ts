jest.mock("@zkpassport/sdk", () => ({
  ZKPassport: class {},
  NullifierType: { NON_SALTED: 0, SALTED: 1, NON_SALTED_MOCK: 2, SALTED_MOCK: 3, NONE: 4 },
}));

import { ZKPassportAdapter, scopeFor, type ZKPassportVerifyFn } from "../../identity/ZKPassportAdapter";
import { InMemoryUsedIdentifierStore } from "../../repositories/UsedIdentifierStore";

const COMMITMENT = "0x" + "ab".repeat(32);

const goodResult = (over: Record<string, any> = {}) => ({
  nationality: { eq: { expected: "GBR", result: true } },
  age: { gte: { expected: 18, result: true } },
  bind: { custom_data: COMMITMENT },
  ...over,
});

const token = (over: Record<string, any> = {}) =>
  JSON.stringify({
    country: "GB",
    commitment: COMMITMENT,
    proofs: [{ name: "p" }],
    queryResult: goodResult(),
    ...over,
  });

const okVerify = (over: Record<string, any> = {}): ZKPassportVerifyFn =>
  jest.fn(async () => ({ verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 1, ...over }));

describe("ZKPassportAdapter", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env = { ...env, NODE_ENV: "test", ZKP_OPRF_KEY_ID: "oprf-1" };
    delete process.env.ZKPASSPORT_DEV_MODE;
  });
  afterAll(() => { process.env = env; });

  it("returns client-supplied commitment, sybilKey and country", async () => {
    const res = await new ZKPassportAdapter(okVerify()).verify(token());
    expect(res).toEqual({ sybilKey: "uid-1", commitment: COMMITMENT, countryCode: "GB", adapterName: "zkpassport" });
  });

  it("verifies against a server-built query and per-country scope, not client input", async () => {
    const fn = okVerify();
    await new ZKPassportAdapter(fn).verify(token({ originalQuery: { nothing: {} } }));
    const arg = (fn as jest.Mock).mock.calls[0][0];
    expect(arg.scope).toBe(scopeFor("GBR"));
    expect(arg.originalQuery.nationality.eq).toBe("GBR");
    expect(arg.originalQuery.bind.custom_data).toBe(COMMITMENT);
    expect(arg.originalQuery).not.toHaveProperty("nothing");
  });

  it("rejects unverified proofs", async () => {
    await expect(new ZKPassportAdapter(okVerify({ verified: false })).verify(token())).rejects.toThrow("invalid proof");
    await expect(new ZKPassportAdapter(okVerify({ queryResultErrors: { age: {} } })).verify(token())).rejects.toThrow("invalid proof");
  });

  it("rejects non-salted identifiers", async () => {
    await expect(new ZKPassportAdapter(okVerify({ uniqueIdentifierType: 0 })).verify(token())).rejects.toThrow("salted");
  });

  it("rejects when nationality does not match the requested country", async () => {
    const qr = goodResult({ nationality: { eq: { expected: "FRA", result: true } } });
    await expect(new ZKPassportAdapter(okVerify()).verify(token({ queryResult: qr }))).rejects.toThrow("nationality");
    const qr2 = goodResult({ nationality: { eq: { expected: "GBR", result: false } } });
    await expect(new ZKPassportAdapter(okVerify()).verify(token({ queryResult: qr2 }))).rejects.toThrow("nationality");
  });

  it("rejects under-age or weakened age check", async () => {
    const qr = goodResult({ age: { gte: { expected: 18, result: false } } });
    await expect(new ZKPassportAdapter(okVerify()).verify(token({ queryResult: qr }))).rejects.toThrow("age");
    const weak = goodResult({ age: { gte: { expected: 1, result: true } } });
    await expect(new ZKPassportAdapter(okVerify()).verify(token({ queryResult: weak }))).rejects.toThrow("age");
  });

  it("rejects a proof bound to a different commitment", async () => {
    const qr = goodResult({ bind: { custom_data: "0x" + "cd".repeat(32) } });
    await expect(new ZKPassportAdapter(okVerify()).verify(token({ queryResult: qr }))).rejects.toThrow("bound");
  });

  it("rejects malformed tokens, bad commitments and unsupported countries", async () => {
    const a = new ZKPassportAdapter(okVerify());
    await expect(a.verify("not json")).rejects.toThrow("malformed");
    await expect(a.verify(token({ commitment: "0x1234" }))).rejects.toThrow("malformed");
    await expect(a.verify(token({ country: "ZZ" }))).rejects.toThrow("unsupported country");
  });

  it("requires ZKP_OPRF_KEY_ID outside dev mode", async () => {
    delete process.env.ZKP_OPRF_KEY_ID;
    await expect(new ZKPassportAdapter(okVerify()).verify(token())).rejects.toThrow("ZKP_OPRF_KEY_ID");
  });

  it("dev mode accepts mock-salted ids but is refused in production", async () => {
    process.env.ZKPASSPORT_DEV_MODE = "true";
    delete process.env.ZKP_OPRF_KEY_ID;
    const ok = await new ZKPassportAdapter(okVerify({ uniqueIdentifierType: 3 })).verify(token());
    expect(ok.sybilKey).toBe("uid-1");
    process.env.NODE_ENV = "production";
    await expect(new ZKPassportAdapter(okVerify()).verify(token())).rejects.toThrow("production");
  });
});

describe("InMemoryUsedIdentifierStore", () => {
  it("claims once, reports the holder, and releases only own claims", async () => {
    const s = new InMemoryUsedIdentifierStore();
    expect(await s.claim("k", "c1")).toEqual({ claimed: true });
    expect(await s.claim("k", "c2")).toEqual({ claimed: false, existing: "c1" });
    await s.release("k", "c2");
    expect((await s.claim("k", "c3")).claimed).toBe(false);
    await s.release("k", "c1");
    expect(await s.claim("k", "c3")).toEqual({ claimed: true });
  });
});
