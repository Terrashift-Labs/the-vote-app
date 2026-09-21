// Jest (CJS) cannot resolve the ESM-only IPFS packages; route tests never touch a real node.
export const createHelia = async () => ({ stop: async () => undefined });
export const unixfs = () => ({
  addBytes: async () => ({ toString: () => "bafkstub" }),
  cat: async function* () {},
});
export class MemoryBlockstore {}
export const CID = { parse: (s: string) => ({ toString: () => s }) };
