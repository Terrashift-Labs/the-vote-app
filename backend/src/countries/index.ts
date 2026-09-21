import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { CountryConfig, CountryConfigSchema } from "./schema";

const COUNTRIES_DIR = __dirname;

let _cache: Map<string, CountryConfig> | null = null;

function loadAll(): Map<string, CountryConfig> {
  if (_cache) return _cache;

  _cache = new Map();
  const files = readdirSync(COUNTRIES_DIR).filter(
    (f) => f.endsWith(".json") && f !== "schema.json"
  );

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(COUNTRIES_DIR, file), "utf8"));
    const result = CountryConfigSchema.safeParse(raw);
    if (result.success) {
      _cache.set(result.data.code.toUpperCase(), result.data);
    } else {
      console.warn(`[countries] Skipping invalid config ${file}:`, result.error.issues[0]);
    }
  }

  return _cache;
}

export function getCountry(code: string): CountryConfig | undefined {
  return loadAll().get(code.toUpperCase());
}

export function getAllCountries(): CountryConfig[] {
  return Array.from(loadAll().values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getCountriesByRegion(region: CountryConfig["region"]): CountryConfig[] {
  return getAllCountries().filter((c) => c.region === region);
}
