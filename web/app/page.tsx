import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1>TheVoteApp</h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "2rem" }}>
        Free, open-source, blockchain-secured democratic voting for every nation.
      </p>
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Link href="/audit" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <h2>Audit Trail</h2>
            <p style={{ color: "var(--color-muted)" }}>
              Browse all policies, IPFS document CIDs, and live vote tallies.
            </p>
          </div>
        </Link>
        <Link href="/verify" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <h2>Verify Receipt</h2>
            <p style={{ color: "var(--color-muted)" }}>
              Enter a transaction hash to confirm your vote is on the blockchain.
            </p>
          </div>
        </Link>
        <Link href="/vote" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <h2>Vote Online</h2>
            <p style={{ color: "var(--color-muted)" }}>
              Cast your ballot from a desktop browser using a security key or passkey.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
