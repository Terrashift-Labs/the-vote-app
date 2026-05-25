const API = process.env.API_BASE_URL ?? "http://localhost:3000";

async function fetchStats() {
  try {
    const [policies, countries] = await Promise.all([
      fetch(`${API}/api/v1/policy`, { next: { revalidate: 60 } }).then(r => r.json()),
      fetch(`${API}/api/v1/country`, { next: { revalidate: 3600 } }).then(r => r.json()),
    ]);
    return {
      policyCount: Array.isArray(policies) ? policies.length : 0,
      openCount:   Array.isArray(policies) ? policies.filter((p: any) => p.status === "open").length : 0,
      countryCount: Array.isArray(countries) ? countries.length : 0,
    };
  } catch {
    return { policyCount: 0, openCount: 0, countryCount: 0 };
  }
}

export default async function AdminDashboard() {
  const stats = await fetchStats();

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "1.5rem" }}>
        National administrator portal — manage policies, voter rolls, and DAO governance.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <StatCard label="Total Policies" value={stats.policyCount} />
        <StatCard label="Open Policies"  value={stats.openCount} accent />
        <StatCard label="Countries"      value={stats.countryCount} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
        <QuickLink href="/admin/policies" title="Manage Policies" desc="Create, edit, and publish policy votes. Upload documents to IPFS." />
        <QuickLink href="/admin/voters"   title="Voter Roll"      desc="Upload encrypted voter commitment lists for eligibility verification." />
        <QuickLink href="/admin/dao"      title="DAO Proposals"   desc="Submit on-chain governance proposals for contract upgrades." />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div style={{ fontSize: "2rem", fontWeight: 700, color: accent ? "var(--color-primary)" : "inherit" }}>{value}</div>
      <div style={{ color: "var(--color-muted)", fontSize: ".875rem" }}>{label}</div>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} style={{ textDecoration: "none" }}>
      <div className="card" style={{ cursor: "pointer" }}>
        <h2>{title}</h2>
        <p style={{ color: "var(--color-muted)", fontSize: ".9rem", marginTop: ".25rem" }}>{desc}</p>
      </div>
    </a>
  );
}
