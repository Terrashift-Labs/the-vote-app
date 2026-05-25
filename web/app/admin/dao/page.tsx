"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface Proposal { proposalId: string; description: string; state: number; forVotes: string; againstVotes: string; }

const STATE_LABELS: Record<number, string> = {
  0: "Pending", 1: "Active", 2: "Canceled", 3: "Defeated",
  4: "Succeeded", 5: "Queued", 6: "Expired", 7: "Executed",
};

export default function DAOPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    fetch(`${API}/api/v1/dao/proposals`)
      .then(r => r.json())
      .then(d => { setProposals(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1>DAO Governance</h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "1.5rem" }}>
        All contract upgrades require a 7-day community vote and a 2-day timelock.
        Token holders (VGT) may propose and vote on changes.
      </p>

      {loading ? <p>Loading proposals…</p> : proposals.length === 0 ? (
        <div className="card"><p style={{ color: "var(--color-muted)" }}>No proposals found.</p></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>Proposal ID</th><th>Description</th><th>State</th><th>For</th><th>Against</th></tr>
            </thead>
            <tbody>
              {proposals.map(p => (
                <tr key={p.proposalId}>
                  <td className="mono" style={{ fontSize: ".8rem" }}>{p.proposalId.slice(0, 16)}…</td>
                  <td>{p.description}</td>
                  <td><span className="badge">{STATE_LABELS[p.state] ?? p.state}</span></td>
                  <td>{p.forVotes}</td>
                  <td>{p.againstVotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
