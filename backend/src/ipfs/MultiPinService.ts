import { createHelia } from "helia";
import { unixfs } from "@helia/unixfs";
import { MemoryBlockstore } from "blockstore-core";
import { CID } from "multiformats/cid";
import logger from "../utils/logger.js";

/**
 * MultiPinService — pins every document to three independent IPFS pinning
 * services in parallel: Pinata, Web3.Storage, and Filebase.
 *
 * If one provider is unavailable the pin still proceeds via the remaining two.
 * All three should return the same CID (content-addressed).
 * A consistency check warns if CIDs diverge (should never happen in practice).
 *
 * Environment variables required:
 *   PINATA_JWT         — Bearer token from Pinata dashboard
 *   WEB3_STORAGE_TOKEN — API token from Web3.Storage
 *   FILEBASE_KEY       — Filebase S3-compatible access key
 *   FILEBASE_SECRET    — Filebase S3-compatible secret key
 *   FILEBASE_BUCKET    — Filebase bucket name
 */

interface PinResult {
  provider: string;
  cid: string | null;
  error?: string;
}

export class MultiPinService {
  private helia: Awaited<ReturnType<typeof createHelia>> | null = null;
  private fs: ReturnType<typeof unixfs> | null = null;

  async init(): Promise<void> {
    const blockstore = new MemoryBlockstore();
    this.helia = await createHelia({ blockstore });
    this.fs = unixfs(this.helia);
    logger.info("MultiPinService (Helia) initialised");
  }

  async stop(): Promise<void> {
    await this.helia?.stop();
  }

  /**
   * Pin `content` to all configured providers in parallel.
   * Returns the canonical CID (from the first successful pin).
   * Throws only if ALL providers fail.
   */
  async pin(content: Uint8Array, filename: string): Promise<string> {
    if (!this.fs) throw new Error("MultiPinService not initialised");

    // Step 1: add to local Helia node to get the CID
    const localCid = await this.fs.addFile({ path: filename, content });
    const cidStr = localCid.toString();

    // Step 2: fan out to all remote pinning services
    const results = await Promise.all([
      this.pinToPinata(content, filename, cidStr),
      this.pinToWeb3Storage(content, filename),
      this.pinToFilebase(content, filename, cidStr),
    ]);

    const succeeded = results.filter((r) => r.cid !== null);
    const failed    = results.filter((r) => r.cid === null);

    if (succeeded.length === 0) {
      throw new Error(
        `All pinning providers failed: ${failed.map((f) => `${f.provider}: ${f.error}`).join("; ")}`
      );
    }

    // Warn on CID divergence (should never occur with identical content)
    const cids = new Set(succeeded.map((r) => r.cid));
    if (cids.size > 1) {
      logger.warn({ cids: [...cids] }, "MultiPinService: CID divergence between providers");
    }

    if (failed.length > 0) {
      logger.warn(
        { failed: failed.map((f) => f.provider) },
        "MultiPinService: some providers failed — pinned to partial set"
      );
    }

    logger.info({ cid: cidStr, providers: succeeded.map((r) => r.provider) }, "Document multi-pinned");
    return cidStr;
  }

  /**
   * Retrieve a document by CID (from local Helia node / any gateway).
   */
  async get(cidStr: string): Promise<Uint8Array> {
    if (!this.fs) throw new Error("MultiPinService not initialised");

    const cid = CID.parse(cidStr);
    const chunks: Uint8Array[] = [];
    for await (const chunk of this.fs.cat(cid)) {
      chunks.push(chunk);
    }

    const total  = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  // MARK: - Provider implementations

  private async pinToPinata(
    content: Uint8Array,
    filename: string,
    _expectedCid: string
  ): Promise<PinResult> {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) return { provider: "pinata", cid: null, error: "PINATA_JWT not set" };

    try {
      const form = new FormData();
      form.append("file", new Blob([content as BlobPart]), filename);
      form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

      const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: form,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json() as { IpfsHash: string };
      logger.info({ cid: json.IpfsHash }, "Pinned to Pinata");
      return { provider: "pinata", cid: json.IpfsHash };
    } catch (err: any) {
      logger.warn({ err: err.message }, "Pinata pin failed");
      return { provider: "pinata", cid: null, error: err.message };
    }
  }

  private async pinToWeb3Storage(
    content: Uint8Array,
    filename: string
  ): Promise<PinResult> {
    const token = process.env.WEB3_STORAGE_TOKEN;
    if (!token) return { provider: "web3storage", cid: null, error: "WEB3_STORAGE_TOKEN not set" };

    try {
      const form = new FormData();
      form.append("file", new Blob([content as BlobPart]), filename);

      const res = await fetch("https://api.web3.storage/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json() as { cid: string };
      logger.info({ cid: json.cid }, "Pinned to Web3.Storage");
      return { provider: "web3storage", cid: json.cid };
    } catch (err: any) {
      logger.warn({ err: err.message }, "Web3.Storage pin failed");
      return { provider: "web3storage", cid: null, error: err.message };
    }
  }

  private async pinToFilebase(
    content: Uint8Array,
    filename: string,
    cidHint: string
  ): Promise<PinResult> {
    const key    = process.env.FILEBASE_KEY;
    const secret = process.env.FILEBASE_SECRET;
    const bucket = process.env.FILEBASE_BUCKET ?? "thevoteapp-ipfs";

    if (!key || !secret) {
      return { provider: "filebase", cid: null, error: "FILEBASE_KEY/SECRET not set" };
    }

    try {
      // Filebase exposes an S3-compatible API that pins to IPFS automatically.
      // The returned x-amz-meta-cid header contains the IPFS CID.
      const url = `https://s3.filebase.com/${bucket}/${encodeURIComponent(filename)}`;

      // Build AWS Signature v4 manually (minimal — only what Filebase needs)
      const { signature, headers } = await signS3Request({
        method: "PUT",
        url,
        body: content,
        accessKey: key,
        secretKey: secret,
        region: "us-east-1",
        service: "s3",
      });

      const res = await fetch(url, {
        method: "PUT",
        headers: { ...headers, "x-amz-meta-import": "car" },
        body: content as unknown as BodyInit,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const cid = res.headers.get("x-amz-meta-cid") ?? cidHint;
      logger.info({ cid }, "Pinned to Filebase");
      return { provider: "filebase", cid };
    } catch (err: any) {
      logger.warn({ err: err.message }, "Filebase pin failed");
      return { provider: "filebase", cid: null, error: err.message };
    }
  }
}

// MARK: - Minimal AWS SigV4 signing for Filebase S3

async function signS3Request(opts: {
  method: string;
  url: string;
  body: Uint8Array;
  accessKey: string;
  secretKey: string;
  region: string;
  service: string;
}): Promise<{ signature: string; headers: Record<string, string> }> {
  const { createHmac, createHash } = await import("crypto");

  const now = new Date();
  const datestamp  = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzdate    = now.toISOString().replace(/[:-]/g, "").slice(0, 15) + "Z";
  const parsed     = new URL(opts.url);
  const host       = parsed.host;
  const payloadHash = createHash("sha256").update(opts.body).digest("hex");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzdate,
  };

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort()
    .map((k) => `${k}:${headers[k]}\n`).join("");
  const canonicalRequest = [
    opts.method,
    parsed.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${datestamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzdate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const sign = (key: Buffer | string, msg: string) =>
    createHmac("sha256", key).update(msg).digest();

  const signingKey = sign(
    sign(sign(sign(`AWS4${opts.secretKey}`, datestamp), opts.region), opts.service),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  headers["Authorization"] =
    `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { signature, headers };
}

export const multiPinService = new MultiPinService();
