"use client";

import { useRef, useState } from "react";
import { HardwareWalletSigner } from "./HardwareWalletSigner";
import type { VotePayload } from "./HardwareWalletSigner";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

type Phase =
  | "country" | "policies" | "options"
  | "authenticating" | "hw_connecting" | "hw_awaiting"
  | "submitting" | "confirmed" | "error";

interface Policy { id: string; title: string; description: string; status: string; closesAt: string; }
interface VoteOption { id: string; label: string; }
interface Receipt { transactionHash: string; blockNumber: number; nullifier: string; }

export default function VoteClientPage() {
  const [phase, setPhase]               = useState<Phase>("country");
  const [countryCode, setCountryCode]   = useState("");
  const [policies, setPolicies]         = useState<Policy[]>([]);
  const [selectedPolicy, setPolicy]     = useState<Policy | null>(null);
  const [options, setOptions]           = useState<VoteOption[]>([]);
  const [selectedOption, setOption]     = useState("");
  const [receipt, setReceipt]           = useState<Receipt | null>(null);
  const [error, setError]               = useState("");
  const [hwDevice, setHwDevice]         = useState("");
  const hwSigner                        = useRef<HardwareWalletSigner | null>(null);

  const COUNTRIES = [
    { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" },
    { code: "FR", name: "France" },         { code: "DE", name: "Germany" },
    { code: "IN", name: "India" },          { code: "JP", name: "Japan" },
    { code: "AU", name: "Australia" },      { code: "CA", name: "Canada" },
    { code: "BR", name: "Brazil" },         { code: "ZA", name: "South Africa" },
  ];

  async function loadPolicies(code: string) {
    setCountryCode(code);
    setPhase("policies");
    try {
      const res = await fetch(`${API}/api/v1/policy?countryCode=${code}&status=open`);
      const data = await res.json();
      setPolicies(data);
    } catch { setError("Failed to load policies."); setPhase("error"); }
  }

  async function selectPolicy(policy: Policy) {
    setPolicy(policy);
    try {
      const res = await fetch(`${API}/api/v1/policy/${policy.id}/options`);
      const data = await res.json();
      setOptions(data);
      setPhase("options");
    } catch { setError("Failed to load vote options."); setPhase("error"); }
  }

  async function submitVote() {
    if (!selectedOption || !selectedPolicy) return;
    setPhase("authenticating");

    try {
      // 1. Get FIDO2 challenge
      const optRes = await fetch(`${API}/api/v1/fido2/authenticate/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: getOrCreateUserId() }),
      });
      const authOptions = await optRes.json();

      // 2. Invoke WebAuthn browser API
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const assertion = await startAuthentication(authOptions);

      // 3. Verify with backend
      const verRes = await fetch(`${API}/api/v1/fido2/authenticate/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: getOrCreateUserId(), response: assertion }),
      });
      if (!verRes.ok) throw new Error("Authentication failed");

      setPhase("submitting");

      // 4. Submit vote
      const voteRes = await fetch(`${API}/api/v1/vote/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId:        selectedPolicy.id,
          optionId:        selectedOption,
          voterNullifier:  "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join(""),
          zkProof:         { pi_a: [], pi_b: [], pi_c: [], publicSignals: [] },
          signature:       "",
          timestamp:       Date.now(),
        }),
      });
      const voteData = await voteRes.json();
      setReceipt(voteData.receipt ?? voteData);
      setPhase("confirmed");
    } catch (e: any) {
      setError(e.message ?? "Vote submission failed.");
      setPhase("error");
    }
  }

  async function submitWithHardwareWallet() {
    if (!selectedOption || !selectedPolicy) return;
    try {
      // 1. Connect to hardware wallet (browser shows USB device picker)
      setPhase("hw_connecting");
      if (!hwSigner.current) hwSigner.current = new HardwareWalletSigner();
      const { address, deviceModel } = await hwSigner.current.connect();
      setHwDevice(deviceModel);

      // 2. Build payload and ask user to confirm on device
      setPhase("hw_awaiting");
      const nullifier = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      const payload: VotePayload = {
        policyId:    selectedPolicy.id,
        optionId:    selectedOption,
        nullifier,
        countryCode: countryCode,
        timestamp:   Date.now(),
      };
      const { signature } = await hwSigner.current.signVote(payload);

      // 3. Submit signed vote to backend
      setPhase("submitting");
      const voteRes = await fetch(`${API}/api/v1/vote/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId:       payload.policyId,
          optionId:       payload.optionId,
          voterNullifier: nullifier,
          zkProof:        { pi_a: [], pi_b: [], pi_c: [], publicSignals: [] },
          signature,
          signerAddress:  address,
          timestamp:      payload.timestamp,
        }),
      });
      const voteData = await voteRes.json();
      setReceipt(voteData.receipt ?? voteData);
      setPhase("confirmed");
    } catch (e: any) {
      setError(e.message ?? "Hardware wallet signing failed.");
      setPhase("error");
    } finally {
      await hwSigner.current?.disconnect();
    }
  }

  function getOrCreateUserId(): string {
    let id = localStorage.getItem("voteUserId");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("voteUserId", id); }
    return id;
  }

  if (phase === "country") return (
    <div className="card">
      <h2>Select your country</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: ".75rem", marginTop: "1rem" }}>
        {COUNTRIES.map(c => (
          <button key={c.code} onClick={() => loadPolicies(c.code)} style={{ background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );

  if (phase === "policies") return (
    <div>
      <h2>Open policies — {countryCode}</h2>
      {policies.length === 0
        ? <div className="card"><p style={{ color: "var(--color-muted)" }}>No open policies at this time.</p></div>
        : policies.map(p => (
          <div key={p.id} className="card" style={{ marginBottom: "1rem", cursor: "pointer" }} onClick={() => selectPolicy(p)}>
            <strong>{p.title}</strong>
            <p style={{ color: "var(--color-muted)", fontSize: ".9rem", marginTop: ".25rem" }}>{p.description}</p>
            <p style={{ fontSize: ".8rem", color: "var(--color-muted)", marginTop: ".5rem" }}>Closes: {new Date(p.closesAt).toLocaleDateString()}</p>
          </div>
        ))}
    </div>
  );

  if (phase === "options" && selectedPolicy) return (
    <div className="card">
      <h2>{selectedPolicy.title}</h2>
      <p style={{ color: "var(--color-muted)", marginBottom: "1rem" }}>{selectedPolicy.description}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", marginBottom: "1.25rem" }}>
        {options.map(o => (
          <label key={o.id} style={{ display: "flex", alignItems: "center", gap: ".6rem", cursor: "pointer" }}>
            <input type="radio" name="option" value={o.id} checked={selectedOption === o.id} onChange={() => setOption(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
        <button disabled={!selectedOption} onClick={submitVote}>
          Submit Vote (Passkey / Security Key)
        </button>
        {HardwareWalletSigner.isSupported() && (
          <button
            disabled={!selectedOption}
            onClick={submitWithHardwareWallet}
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            Sign with Hardware Wallet (Ledger / Trezor)
          </button>
        )}
      </div>
    </div>
  );

  if (phase === "authenticating")  return <div className="card"><p>Waiting for security key or passkey…</p></div>;
  if (phase === "hw_connecting")   return <div className="card"><p>Connecting to hardware wallet — select your device in the browser prompt…</p></div>;
  if (phase === "hw_awaiting")     return <div className="card"><p>Review and confirm your vote on <strong>{hwDevice || "your hardware wallet"}</strong>…</p></div>;
  if (phase === "submitting")      return <div className="card"><p>Recording vote on blockchain…</p></div>;

  if (phase === "confirmed" && receipt) return (
    <div className="card">
      <p style={{ color: "var(--color-success)", fontWeight: 600, marginBottom: "1rem" }}>Vote confirmed on-chain</p>
      <table><tbody>
        <tr><th>Transaction</th><td className="mono">{receipt.transactionHash}</td></tr>
        <tr><th>Block</th><td>{receipt.blockNumber}</td></tr>
        <tr><th>Nullifier</th><td className="mono">{receipt.nullifier}</td></tr>
      </tbody></table>
    </div>
  );

  if (phase === "error") return (
    <div className="card">
      <p style={{ color: "var(--color-danger)" }}>{error}</p>
      <button onClick={() => { setPhase("country"); setError(""); }} style={{ marginTop: "1rem" }}>Start again</button>
    </div>
  );

  return null;
}
