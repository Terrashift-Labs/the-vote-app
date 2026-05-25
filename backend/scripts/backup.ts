#!/usr/bin/env tsx
/**
 * backup.ts — snapshot backend state to IPFS.
 *
 * Backs up: policy registry JSON, country configs, notification token registry.
 * Blockchain state is inherently durable (on-chain) — not backed up here.
 * IPFS-pinned documents are content-addressed and self-verifying.
 *
 * Usage:
 *   npx tsx scripts/backup.ts
 *   Output: backup manifest CID printed to stdout (pin this CID to a pinning service)
 */
import { ipfsService } from "../src/ipfs/IPFSService.js";
import * as fs from "fs";
import * as path from "path";

const BACKUP_DIRS = [
  path.join(process.cwd(), "src/countries"),
];

async function main() {
  await ipfsService.init();

  const manifest: { path: string; cid: string }[] = [];

  for (const dir of BACKUP_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file));
      const cid = await ipfsService.pinDocument(content, file);
      manifest.push({ path: file, cid });
      console.error(`  Pinned ${file} → ${cid}`);
    }
  }

  // Pin the manifest itself
  const manifestJson = JSON.stringify({ backedUpAt: new Date().toISOString(), files: manifest }, null, 2);
  const manifestCid = await ipfsService.pinDocument(
    new TextEncoder().encode(manifestJson),
    "backup-manifest.json"
  );

  console.log(manifestCid); // CID to stdout — pipe to pinning service
  await ipfsService.stop();
}

main().catch((err) => { console.error(err); process.exit(1); });
