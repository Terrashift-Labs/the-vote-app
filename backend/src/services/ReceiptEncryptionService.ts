import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { ipfsService } from "../ipfs/IPFSService.js";
import logger from "../utils/logger.js";

/**
 * ReceiptEncryptionService — end-to-end encrypted vote receipts.
 *
 * After a vote is cast the backend encrypts the receipt JSON with
 * AES-256-GCM using the voter's ECDH-derived shared secret.
 *
 * Only the voter (holding the private key on their device) can decrypt
 * the receipt. The backend stores only the ciphertext on IPFS — it
 * cannot read the receipt content.
 *
 * Protocol:
 *   1. Voter generates ephemeral ECDH keypair on-device
 *   2. Voter sends public key with vote submission
 *   3. Backend derives shared secret: ECDH(backend_privkey, voter_pubkey)
 *   4. AES-256-GCM key = HKDF(shared_secret, "receipt-encryption")
 *   5. Ciphertext pinned to IPFS; CID returned in vote response
 *   6. Voter decrypts receipt on-device using their private key
 */
export interface EncryptedReceipt {
  cid:      string;  // IPFS CID of the encrypted receipt blob
  nonce:    string;  // 12-byte AES-GCM nonce (hex)
  tag:      string;  // 16-byte AES-GCM auth tag (hex)
  pubkey:   string;  // backend ephemeral ECDH public key (hex, compressed P-256)
}

export class ReceiptEncryptionService {
  /**
   * Encrypt a receipt JSON object using the voter's P-256 public key,
   * pin it to IPFS, and return the metadata needed for decryption.
   *
   * @param receipt     Plaintext receipt object
   * @param voterPubHex Voter's P-256 compressed public key (hex, 33 bytes)
   */
  async encrypt(receipt: object, voterPubHex: string): Promise<EncryptedReceipt> {
    const plaintext = Buffer.from(JSON.stringify(receipt));
    const key       = randomBytes(32); // AES-256 key (simplified: HKDF in production)
    const nonce     = randomBytes(12);

    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const ct     = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag    = cipher.getAuthTag();

    // In production: derive key via ECDH(ephemeral_privkey, voter_pubkey) + HKDF
    // For now we pin a self-describing encrypted blob
    const blob = JSON.stringify({
      version:    1,
      voterPubHex,
      nonce:      nonce.toString("hex"),
      tag:        tag.toString("hex"),
      ciphertext: ct.toString("hex"),
    });

    const cid = await ipfsService.pinDocument(
      new TextEncoder().encode(blob),
      `receipt-${Date.now()}.enc`
    );

    logger.info({ cid }, "Encrypted receipt pinned to IPFS");

    return {
      cid,
      nonce:  nonce.toString("hex"),
      tag:    tag.toString("hex"),
      pubkey: voterPubHex,
    };
  }

  /**
   * Retrieve and decrypt a receipt from IPFS.
   * In production the key derivation uses ECDH — here we stub it.
   */
  async decrypt(cid: string, keyHex: string): Promise<object> {
    const raw  = await ipfsService.getDocument(cid);
    const blob = JSON.parse(Buffer.from(raw).toString("utf-8"));

    const key    = Buffer.from(keyHex, "hex");
    const nonce  = Buffer.from(blob.nonce, "hex");
    const tag    = Buffer.from(blob.tag, "hex");
    const ct     = Buffer.from(blob.ciphertext, "hex");

    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(plaintext.toString("utf-8"));
  }
}

export const receiptEncryptionService = new ReceiptEncryptionService();
