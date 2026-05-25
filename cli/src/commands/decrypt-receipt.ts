/**
 * decrypt-receipt — fetch and decrypt an encrypted receipt from IPFS.
 *
 * Usage:
 *   verify-vote decrypt-receipt <cid> --key <hex-aes-key>
 *
 * In a real deployment the AES key is derived on-device via ECDH.
 * This CLI command accepts the raw key directly for testing and
 * operator-assisted recovery scenarios.
 */
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createDecipheriv } from "crypto";

const DEFAULT_IPFS = "https://ipfs.io/ipfs/";

export function registerDecryptReceipt(program: Command) {
  program
    .command("decrypt-receipt <cid>")
    .description("Fetch and decrypt an encrypted vote receipt from IPFS")
    .requiredOption("--key <hex>", "AES-256 key as 64-char hex string")
    .option("--ipfs <url>", "IPFS gateway base URL", DEFAULT_IPFS)
    .action(async (cid: string, opts: { key: string; ipfs: string }) => {
      if (opts.key.length !== 64) {
        console.error(chalk.red("--key must be a 64-character hex string (32 bytes)"));
        process.exit(1);
      }

      const spinner = ora("Fetching receipt from IPFS…").start();
      try {
        const res  = await fetch(`${opts.ipfs}${cid}`);
        if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
        const blob = await res.json() as { nonce: string; tag: string; ciphertext: string };

        const key        = Buffer.from(opts.key, "hex");
        const nonce      = Buffer.from(blob.nonce, "hex");
        const tag        = Buffer.from(blob.tag, "hex");
        const ciphertext = Buffer.from(blob.ciphertext, "hex");

        const decipher = createDecipheriv("aes-256-gcm", key, nonce);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const receipt   = JSON.parse(plaintext.toString("utf-8"));

        spinner.stop();
        console.log(chalk.green("Receipt decrypted successfully\n"));
        console.log(JSON.stringify(receipt, null, 2));
      } catch (err: any) {
        spinner.fail(chalk.red(err.message));
      }
    });
}
