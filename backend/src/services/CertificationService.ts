import PDFDocument from "pdfkit";
import { createSign } from "crypto";
import { Readable } from "stream";
import { multiPinService } from "../ipfs/MultiPinService.js";
import { tallyService } from "./TallyService.js";
import logger from "../utils/logger.js";

/**
 * CertificationService — generates a signed PDF election result certificate.
 *
 * The certificate is:
 *   1. Generated with pdfkit
 *   2. Signed with the backend ECDSA private key (P-256)
 *   3. Pinned to IPFS via MultiPinService (all three providers)
 *
 * The resulting document is a verifiable, tamper-evident record of the
 * election result, anchored to IPFS and signed by the election authority.
 */

export interface CertificateResult {
  cid:       string;
  signature: string; // hex ECDSA signature of sha256(pdf bytes)
  issuedAt:  string; // ISO 8601
}

export class CertificationService {

  async certify(
    pollId:       string,
    policyTitle:  string,
    countryCode:  string,
    txHash:       string,
    merkleRoot:   string,
  ): Promise<CertificateResult> {

    const tally = await tallyService.getTally(pollId);
    const issuedAt = new Date().toISOString();

    // Build PDF
    const pdfBytes = await this.buildPDF({
      pollId,
      policyTitle,
      countryCode,
      txHash,
      merkleRoot,
      tally,
      issuedAt,
    });

    // Sign
    const signature = this.sign(pdfBytes);

    // Pin to IPFS
    const filename = `certificate-${pollId}-${Date.now()}.pdf`;
    const cid = await multiPinService.pin(pdfBytes, filename);

    logger.info({ pollId, cid, issuedAt }, "Election certificate issued");
    return { cid, signature, issuedAt };
  }

  private sign(data: Uint8Array): string {
    const privateKeyPem = process.env.CERT_SIGNING_KEY_PEM;
    if (!privateKeyPem) {
      // In dev, return a deterministic placeholder
      return "0x" + Buffer.from("dev-signature").toString("hex");
    }
    const sign = createSign("SHA256");
    sign.update(data);
    return sign.sign(privateKeyPem, "hex");
  }

  private async buildPDF(opts: {
    pollId:      string;
    policyTitle: string;
    countryCode: string;
    txHash:      string;
    merkleRoot:  string;
    tally:       { support: number; oppose: number; abstain: number; total: number; finalized: boolean };
    issuedAt:    string;
  }): Promise<Uint8Array> {

    return new Promise((resolve, reject) => {
      const doc    = new PDFDocument({ size: "A4", margin: 60 });
      const chunks: Buffer[] = [];

      doc.on("data",  (chunk) => chunks.push(chunk));
      doc.on("end",   () => resolve(new Uint8Array(Buffer.concat(chunks))));
      doc.on("error", reject);

      // ── Header ────────────────────────────────────────────────────────────
      doc
        .fontSize(22).font("Helvetica-Bold")
        .text("ELECTION RESULT CERTIFICATE", { align: "center" })
        .moveDown(0.5);

      doc
        .fontSize(12).font("Helvetica")
        .fillColor("#555555")
        .text("TheVoteApp · Blockchain-Secured Democratic Voting", { align: "center" })
        .fillColor("#000000")
        .moveDown(1.5);

      // ── Divider ───────────────────────────────────────────────────────────
      doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor("#cccccc").stroke().moveDown(1);

      // ── Policy details ────────────────────────────────────────────────────
      this.row(doc, "Policy",       opts.policyTitle);
      this.row(doc, "Poll ID",      opts.pollId);
      this.row(doc, "Country",      opts.countryCode);
      this.row(doc, "Status",       opts.tally.finalized ? "Finalised" : "Open");
      this.row(doc, "Issued At",    opts.issuedAt);
      doc.moveDown(1);

      // ── Results table ─────────────────────────────────────────────────────
      doc.fontSize(14).font("Helvetica-Bold").text("Election Results").moveDown(0.5);

      const total = Math.max(opts.tally.total, 1);
      this.resultRow(doc, "Support", opts.tally.support, total, "#00703c");
      this.resultRow(doc, "Oppose",  opts.tally.oppose,  total, "#d4351c");
      this.resultRow(doc, "Abstain", opts.tally.abstain, total, "#f47738");
      this.row(doc, "Total Votes",  opts.tally.total.toLocaleString());
      doc.moveDown(1);

      // ── On-chain provenance ───────────────────────────────────────────────
      doc.fontSize(14).font("Helvetica-Bold").text("On-Chain Provenance").moveDown(0.5);
      doc.fontSize(9).font("Helvetica");
      this.row(doc, "Transaction",  opts.txHash);
      this.row(doc, "Merkle Root",  opts.merkleRoot);
      doc.moveDown(1);

      // ── Verification ──────────────────────────────────────────────────────
      doc.fontSize(10).font("Helvetica").fillColor("#555555")
        .text(
          "This certificate can be independently verified by querying the on-chain " +
          "VoteLedger contract with the Poll ID above. The cryptographic hash of this " +
          "document is recorded on IPFS. Any alteration will invalidate the ECDSA signature.",
          { align: "justify" }
        )
        .fillColor("#000000");

      doc.end();
    });
  }

  private row(doc: PDFKit.PDFDocument, label: string, value: string | number) {
    doc.fontSize(11);
    doc.font("Helvetica-Bold").text(label + ": ", { continued: true });
    doc.font("Helvetica").text(String(value));
    doc.moveDown(0.3);
  }

  private resultRow(
    doc:   PDFKit.PDFDocument,
    label: string,
    count: number,
    total: number,
    color: string
  ) {
    const pct = ((count / total) * 100).toFixed(1);
    doc.fontSize(11);
    doc.font("Helvetica-Bold").fillColor(color).text(`${label}: `, { continued: true });
    doc.font("Helvetica").fillColor("#000000")
      .text(`${count.toLocaleString()}  (${pct}%)`);
    doc.moveDown(0.3);
  }
}

export const certificationService = new CertificationService();
