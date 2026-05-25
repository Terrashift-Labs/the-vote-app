"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface Policy { id: string; title: string; countryCode: string; status: string; documentCid?: string; closesAt: string; }

export default function AdminPoliciesPage() {
  const [policies, setPolicies]   = useState<Policy[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");

  const titleRef       = useRef<HTMLInputElement>(null);
  const descRef        = useRef<HTMLTextAreaElement>(null);
  const countryRef     = useRef<HTMLInputElement>(null);
  const closesAtRef    = useRef<HTMLInputElement>(null);
  const fileRef        = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchPolicies(); }, []);

  async function fetchPolicies() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/policy`);
      setPolicies(await res.json());
    } finally { setLoading(false); }
  }

  async function createPolicy(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");

    const policyId = `pol-${Date.now()}`;

    // 1. Upload document to IPFS if provided
    let documentCid: string | undefined;
    const file = fileRef.current?.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("policyId", policyId);
      const ipfsRes = await fetch(`${API}/api/v1/ipfs/pin`, { method: "POST", body: formData });
      if (!ipfsRes.ok) { setError("IPFS upload failed"); return; }
      const ipfsData = await ipfsRes.json();
      documentCid = ipfsData.cid;
    }

    // 2. Create policy via backend
    const body = {
      id:          policyId,
      title:       titleRef.current?.value,
      description: descRef.current?.value,
      countryCode: countryRef.current?.value.toUpperCase(),
      closesAt:    closesAtRef.current?.value,
      documentCid,
    };
    const res = await fetch(`${API}/api/v1/policy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setError("Failed to create policy"); return; }
    setSuccess(`Policy created${documentCid ? ` — IPFS CID: ${documentCid}` : ""}`);
    setShowForm(false);
    fetchPolicies();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1>Policies</h1>
        <button onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "New Policy"}</button>
      </div>

      {error   && <p style={{ color: "var(--color-danger)",  marginBottom: "1rem" }}>{error}</p>}
      {success && <p style={{ color: "var(--color-success)", marginBottom: "1rem" }}>{success}</p>}

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2>Create Policy</h2>
          <form onSubmit={createPolicy} style={{ display: "flex", flexDirection: "column", gap: ".75rem", marginTop: "1rem" }}>
            <input ref={titleRef}    type="text" placeholder="Policy title" required />
            <textarea ref={descRef}  placeholder="Description" rows={3} style={{ padding: ".6rem .8rem", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", font: "inherit", resize: "vertical" }} />
            <input ref={countryRef}  type="text" placeholder="Country code (e.g. GB)" maxLength={2} required />
            <input ref={closesAtRef} type="datetime-local" required />
            <div>
              <label style={{ display: "block", marginBottom: ".25rem", fontSize: ".875rem", color: "var(--color-muted)" }}>Policy document (PDF / text, optional)</label>
              <input ref={fileRef} type="file" accept=".pdf,.txt,.md" />
            </div>
            <button type="submit">Create &amp; Pin to IPFS</button>
          </form>
        </div>
      )}

      {loading ? <p>Loading…</p> : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>ID</th><th>Title</th><th>Country</th><th>Status</th><th>Closes</th><th>CID</th></tr></thead>
            <tbody>
              {policies.map(p => (
                <tr key={p.id}>
                  <td className="mono">{p.id}</td>
                  <td>{p.title}</td>
                  <td>{p.countryCode}</td>
                  <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                  <td>{new Date(p.closesAt).toLocaleDateString()}</td>
                  <td className="mono" style={{ fontSize: ".75rem" }}>{p.documentCid ? p.documentCid.slice(0, 16) + "…" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
