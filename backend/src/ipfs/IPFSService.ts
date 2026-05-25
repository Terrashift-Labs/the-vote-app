import { createHelia } from "helia";
import { unixfs } from "@helia/unixfs";
import { MemoryBlockstore } from "blockstore-core";
import { CID } from "multiformats/cid";
import logger from "../utils/logger.js";

/**
 * IPFSService — Helia-based IPFS client for policy document storage.
 *
 * Policy documents are pinned to IPFS and their CIDs are stored
 * on-chain in PolicyRegistry. Documents are content-addressed:
 * any tampering changes the CID and breaks the on-chain reference.
 */
export class IPFSService {
  private helia: Awaited<ReturnType<typeof createHelia>> | null = null;
  private fs: ReturnType<typeof unixfs> | null = null;

  async init(): Promise<void> {
    const blockstore = new MemoryBlockstore();
    this.helia = await createHelia({ blockstore });
    this.fs = unixfs(this.helia);
    logger.info("IPFS node initialised");
  }

  async stop(): Promise<void> {
    await this.helia?.stop();
    logger.info("IPFS node stopped");
  }

  /**
   * Pin a policy document buffer to IPFS.
   * Returns the CIDv1 base32 string suitable for on-chain storage.
   */
  async pinDocument(content: Uint8Array, filename: string): Promise<string> {
    if (!this.fs) throw new Error("IPFSService not initialised");

    const cid = await this.fs.addFile({
      path: filename,
      content,
    });

    logger.info({ cid: cid.toString(), filename }, "Policy document pinned to IPFS");
    return cid.toString();
  }

  /**
   * Retrieve a document by CID.
   * Streams chunks into a single Buffer.
   */
  async getDocument(cidStr: string): Promise<Uint8Array> {
    if (!this.fs) throw new Error("IPFSService not initialised");

    const cid = CID.parse(cidStr);
    const chunks: Uint8Array[] = [];
    for await (const chunk of this.fs.cat(cid)) {
      chunks.push(chunk);
    }

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  /**
   * Verify that a document matches its on-chain CID.
   * Returns true if the content hashes to the given CID.
   */
  async verifyDocument(cidStr: string, content: Uint8Array): Promise<boolean> {
    try {
      const stored = await this.getDocument(cidStr);
      if (stored.length !== content.length) return false;
      return stored.every((byte, i) => byte === content[i]);
    } catch {
      return false;
    }
  }
}

export const ipfsService = new IPFSService();
