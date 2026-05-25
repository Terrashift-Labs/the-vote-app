import { expect } from "chai";
import { AnonymityService } from "../../services/AnonymityService.js";

const dummy = (total: number) => ({
  policyId: "pol-001", support: Math.floor(total * 0.6),
  oppose: Math.floor(total * 0.3), abstain: total - Math.floor(total * 0.6) - Math.floor(total * 0.3),
  total, lastBlock: 100, finalized: false,
});

describe("AnonymityService", () => {
  const svc = new AnonymityService(5, { NZ: 10 });

  it("suppresses results below default k=5", () => {
    const r = svc.anonymise(dummy(4));
    expect(r.status).to.equal("insufficient_votes");
    expect(r.minimumRequired).to.equal(5);
    expect(r.tally).to.be.undefined;
  });

  it("reveals results at exactly k=5", () => {
    const r = svc.anonymise(dummy(5));
    expect(r.status).to.equal("available");
    expect(r.tally).to.exist;
  });

  it("uses country-specific threshold for NZ (k=10)", () => {
    expect(svc.anonymise(dummy(7), "NZ").status).to.equal("insufficient_votes");
    expect(svc.anonymise(dummy(10), "NZ").status).to.equal("available");
  });

  it("anonymiseAll filters mixed tallies correctly", () => {
    const results = svc.anonymiseAll([dummy(3), dummy(8)]);
    expect(results[0].status).to.equal("insufficient_votes");
    expect(results[1].status).to.equal("available");
  });
});
