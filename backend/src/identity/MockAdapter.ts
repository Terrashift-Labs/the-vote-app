import { BaseIdentityAdapter, type IdentityResult } from "./BaseIdentityAdapter.js";
import logger from "../utils/logger.js";

/**
 * MockAdapter — development and test identity adapter.
 *
 * Accepts a plain JSON "token" of the form:
 *   { "sub": "test-user-001", "countryCode": "GB" }
 *
 * Only active when NODE_ENV !== "production".
 * Rejects all requests in production to prevent accidental use.
 */
export class MockAdapter extends BaseIdentityAdapter {
  readonly name = "mock";

  async verify(token: string): Promise<IdentityResult> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MockAdapter is disabled in production");
    }

    let parsed: { sub?: string; countryCode?: string };
    try {
      parsed = JSON.parse(token);
    } catch {
      throw new Error("MockAdapter: token must be JSON { sub, countryCode }");
    }

    const sub         = parsed.sub ?? "mock-user";
    const countryCode = (parsed.countryCode ?? "GB").toUpperCase();
    const commitment  = this.deriveCommitment(sub, countryCode);

    logger.info({ adapter: this.name, countryCode }, "Mock identity verified");
    return { commitment, countryCode, adapterName: this.name };
  }
}

export const mockAdapter = new MockAdapter();
