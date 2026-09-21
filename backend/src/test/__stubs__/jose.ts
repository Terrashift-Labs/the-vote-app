// jose is ESM-only; identity adapters that use it are not exercised by route tests.
export const createRemoteJWKSet = () => () => Promise.reject(new Error("jose stubbed"));
export const jwtVerify = () => Promise.reject(new Error("jose stubbed"));
