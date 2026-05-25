"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface ReceiptResult {
  found: boolean;
  txHash?: string;
  blockNumber?: number;
  nullifier?: string;
  policyId?: string;
  timestamp?: string;
}

export default function VerifyPage() {
  const [txHash, setTxHash] = useState("");
  const [result, setResult] = useState<ReceiptResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    if (!txHash.match(/^0x[0-9a-fA-F]{64}$/)) {
      setError("Enter a valid 0x-prefixed 32-byte transaction hash.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/v1/vote/receipt/${txHash}`);
      if (res.status === 404) { setResult({ found: false }); return; }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setResult({ found: true, ...data });
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Verify Your Vote</h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "1.5rem" }}>
        Enter the transaction hash from your vote receipt to confirm it is permanently
        recorded on the blockchain.
      </p>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: ".75rem" }}>
          <input
            type="text"
            placeholder="0x..."
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verify()}
          />
          <button onClick={verify} disabled={loading} style={{ whiteSpace: "nowrap" }}>
            {loading ? "Checking…" : "Verify"}
          </button>
        </div>
        {error && <p style={{ color: "var(--color-danger)", marginTop: ".5rem", fontSize: ".9rem" }}>{error}</p>}
      </div>

      {result && (
        <div className="card">
          {result.found ? (
            <>
              <p style={{ color: "var(--color-success)", fontWeight: 600, marginBottom: "1rem" }}>
                Vote confirmed on-chain
              </p>
              <table>
                <tbody>
                  <tr><th>Transaction</th><td className="mono">{result.txHash}</td></tr>
                  <tr><th>Block</th><td>{result.blockNumber}</td></tr>
                  <tr><th>Policy</th><td>{result.policyId}</td></tr>
                  <tr><th>Nullifier</th><td className="mono">{result.nullifier}</td></tr>
                  <tr><th>Timestamp</th><td>{result.timestamp ? new Date(result.timestamp).toLocaleString() : "—"}</td></tr>
                </tbody>
              </table>
            </>
          ) : (
            <p style={{ color: "var(--color-danger)" }}>
              Transaction not found on this network. Check the hash and try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
