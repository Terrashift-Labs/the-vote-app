import type { BaseIdentityAdapter } from "./BaseIdentityAdapter.js";
import { eidasAdapter }  from "./eIDASAdapter.js";
import { govUKAdapter }  from "./GovUKAdapter.js";
import { mockAdapter }   from "./MockAdapter.js";

/**
 * Central registry of all configured identity adapters.
 * Add new national adapters here as they are implemented.
 */
const adapters = new Map<string, BaseIdentityAdapter>([
  ["eidas",  eidasAdapter],
  ["govuk",  govUKAdapter],
  ["mock",   mockAdapter],
]);

export function getAdapter(name: string): BaseIdentityAdapter {
  const adapter = adapters.get(name.toLowerCase());
  if (!adapter) {
    throw new Error(`Unknown identity adapter '${name}'. Available: ${[...adapters.keys()].join(", ")}`);
  }
  return adapter;
}

export function listAdapters(): string[] {
  return [...adapters.keys()].filter((k) => k !== "mock" || process.env.NODE_ENV !== "production");
}
