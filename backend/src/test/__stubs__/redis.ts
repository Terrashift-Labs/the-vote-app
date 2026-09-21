/** In-memory stand-in for the ioredis surface used by the backend. */
export function makeRedisStub() {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  return {
    set: async (key: string, val: string) => { store.set(key, val); return "OK"; },
    setex: async (key: string, _ttl: number, val: string) => { store.set(key, val); return "OK"; },
    get: async (key: string) => store.get(key) ?? null,
    del: async (key: string) => { store.delete(key); sets.delete(key); return 1; },
    sadd: async (key: string, member: string) => {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(member);
      return 1;
    },
    sismember: async (key: string, member: string) => (sets.get(key)?.has(member) ? 1 : 0),
    smembers: async (key: string) => [...(sets.get(key) ?? [])],
  };
}
