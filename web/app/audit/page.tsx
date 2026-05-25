import { Suspense } from "react";

const API = process.env.API_BASE_URL ?? "http://localhost:3000";

interface Policy {
  id: string;
  title: string;
  countryCode: string;
  status: string;
  documentCid?: string;
  closesAt: string;
}

interface Tally {
  support: number;
  oppose: number;
  abstain: number;
  total: number;
  finalized: boolean;
}

async function fetchPolicies(): Promise<Policy[]> {
  try {
    const res = await fetch(`${API}/api/v1/policy`, { next: { revalidate: 30 } });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

async function fetchTally(policyId: string): Promise<Tally | null> {
  try {
    const res = await fetch(`${API}/api/v1/policy/${policyId}/results`, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.tally ?? null;
  } catch { return null; }
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    open: "badge-open", closed: "badge-closed",
    tallying: "badge-tallying", finalised: "badge-final",
  };
  return <span className={`badge ${cls[status] ?? ""}`}>{status}</span>;
}

function TallyBar({ count, total, label }: { count: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: ".4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem", marginBottom: ".15rem" }}>
        <span>{label}</span><span>{count} ({pct}%)</span>
      </div>
      <progress value={count} max={total || 1} />
    </div>
  );
}

async function PolicyRow({ policy }: { policy: Policy }) {
  const tally = await fetchTally(policy.id);
  return (
    <tr>
      <td><strong>{policy.title}</strong><br /><span className="mono" style={{ color: "var(--color-muted)" }}>{policy.id}</span></td>
      <td>{policy.countryCode}</td>
      <td><StatusBadge status={policy.status} /></td>
      <td>
        {policy.documentCid
          ? <a href={`${API}/api/v1/ipfs/${policy.documentCid}`} target="_blank" rel="noopener noreferrer" className="mono">{policy.documentCid.slice(0, 20)}…</a>
          : <span style={{ color: "var(--color-muted)" }}>—</span>}
      </td>
      <td>
        {tally ? (
          <div style={{ minWidth: 180 }}>
            <TallyBar label="Support" count={tally.support} total={tally.total} />
            <TallyBar label="Oppose"  count={tally.oppose}  total={tally.total} />
            <TallyBar label="Abstain" count={tally.abstain} total={tally.total} />
            <div style={{ fontSize: ".75rem", color: "var(--color-muted)" }}>Total: {tally.total}</div>
          </div>
        ) : <span style={{ color: "var(--color-muted)" }}>No data</span>}
      </td>
    </tr>
  );
}

export default async function AuditPage() {
  const policies = await fetchPolicies();

  return (
    <div>
      <h1>Audit Trail</h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "1.5rem" }}>
        All policies, their IPFS-pinned documents, and live on-chain vote tallies.
        Data is read directly from the public blockchain — no central authority required.
      </p>

      {policies.length === 0 ? (
        <div className="card">
          <p style={{ color: "var(--color-muted)" }}>No policies found. Ensure the backend is running.</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Policy</th>
                <th>Country</th>
                <th>Status</th>
                <th>Document CID</th>
                <th>Tally</th>
              </tr>
            </thead>
            <tbody>
              <Suspense fallback={<tr><td colSpan={5}>Loading…</td></tr>}>
                {policies.map((p) => <PolicyRow key={p.id} policy={p} />)}
              </Suspense>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
