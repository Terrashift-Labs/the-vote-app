import { expect } from "chai";
import { createClient } from "redis";
import { USSDVoteService } from "../../ussd/USSDVoteService.js";
import * as RedisClient from "../../redis/RedisClient.js";
import sinon from "sinon";

/**
 * Unit tests for USSDVoteService.
 *
 * Redis is stubbed with an in-memory Map so the suite runs without
 * a live Redis instance (matching the existing test pattern in this repo).
 */

function makeRedisStub() {
  const store = new Map<string, string>();
  const sets  = new Map<string, Set<string>>();

  return {
    setex: async (_key: string, _ttl: number, val: string) => { store.set(_key, val); },
    get:   async (key: string) => store.get(key) ?? null,
    del:   async (key: string) => { store.delete(key); sets.delete(key); },
    sadd:  async (key: string, member: string) => {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(member);
    },
    sismember: async (key: string, member: string) => (sets.get(key)?.has(member) ? 1 : 0),
    smembers:  async (key: string) => [...(sets.get(key) ?? [])],
  };
}

describe("USSDVoteService", () => {
  let service: USSDVoteService;
  let stub: ReturnType<typeof makeRedisStub>;
  const SESSION = "sess-001";
  const PHONE   = "+254700000001";

  beforeEach(() => {
    stub = makeRedisStub();
    sinon.stub(RedisClient, "getRedis").returns(stub as any);
    service = new USSDVoteService();
  });

  afterEach(() => { sinon.restore(); });

  it("returns CON with policy menu on empty input", async () => {
    const r = await service.handle(SESSION, PHONE, "");
    expect(r.continue).to.be.true;
    expect(r.text).to.include("TheVoteApp");
  });

  it("shows policy detail on selecting a policy", async () => {
    const r = await service.handle(SESSION, PHONE, "1");
    expect(r.continue).to.be.true;
    expect(r.text).to.match(/Support|Oppose|Abstain/);
  });

  it("shows confirmation on selecting an option", async () => {
    await service.handle(SESSION, PHONE, "");
    await service.handle(SESSION, PHONE, "1");       // select policy
    const r = await service.handle(SESSION, PHONE, "1*1"); // select Support
    expect(r.continue).to.be.true;
    expect(r.text).to.include("Confirm");
  });

  it("records vote and returns receipt on confirmation", async () => {
    await service.handle(SESSION, PHONE, "");
    await service.handle(SESSION, PHONE, "1");
    await service.handle(SESSION, PHONE, "1*1");
    const r = await service.handle(SESSION, PHONE, "1*1*1"); // confirm
    expect(r.continue).to.be.false;
    expect(r.text).to.include("Receipt");
  });

  it("prevents double voting on same policy", async () => {
    // First vote
    await service.handle("s1", PHONE, "");
    await service.handle("s1", PHONE, "1");
    await service.handle("s1", PHONE, "1*1");
    await service.handle("s1", PHONE, "1*1*1");

    // Second attempt
    await service.handle("s2", PHONE, "");
    await service.handle("s2", PHONE, "1");
    await service.handle("s2", PHONE, "1*1");
    const r = await service.handle("s2", PHONE, "1*1*1");
    expect(r.text).to.include("already voted");
  });

  it("cancels session on # input", async () => {
    await service.handle(SESSION, PHONE, "");
    const r = await service.handle(SESSION, PHONE, "#");
    expect(r.continue).to.be.false;
    expect(r.text).to.include("ended");
  });
});
