export const metadata = { title: "Privacy Policy — TheVoteApp" };

export default function PrivacyPage() {
  return (
    <div>
      <h1>Privacy Policy</h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "2rem" }}>
        Effective date: 2026-05-16 · Apache 2.0 open-source project
      </p>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>What we collect</h2>
        <p style={{ marginTop: ".5rem" }}>
          <strong>Nothing that identifies you.</strong> TheVoteApp is designed with
          privacy as a first principle. We do not collect names, email addresses,
          IP addresses, or any other personally identifiable information.
        </p>
        <ul style={{ marginTop: ".75rem", paddingLeft: "1.25rem", lineHeight: 2 }}>
          <li><strong>Device push token</strong> (optional) — stored for up to 90 days to send
            vote deadline notifications. Deleted on request or after 90 days.</li>
          <li><strong>Vote nullifier</strong> — a one-way cryptographic hash stored on-chain
            to prevent double-voting. Cannot be reversed to identify you.</li>
          <li><strong>Identity commitment</strong> — a hash of your DID, country, and a random
            salt. Stored on-chain. The DID itself never leaves your device.</li>
        </ul>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>Your rights (GDPR / PDPA)</h2>
        <ul style={{ marginTop: ".5rem", paddingLeft: "1.25rem", lineHeight: 2 }}>
          <li><strong>Access</strong> — request a copy of any data associated with your user ID.</li>
          <li><strong>Erasure</strong> — delete your device token and preferences. Vote nullifiers
            cannot be deleted as they are anonymous and required for election integrity.</li>
          <li><strong>Portability</strong> — export your vote receipt (encrypted, IPFS-hosted).</li>
          <li><strong>Objection</strong> — opt out of push notifications at any time in settings.</li>
        </ul>
        <p style={{ marginTop: "1rem" }}>
          To exercise any right, email <a href="mailto:privacy@thevoteapp.org">privacy@thevoteapp.org</a>
          {" "}or use the API: <code>DELETE /api/v1/user/&#123;userId&#125;</code>
        </p>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>Blockchain data</h2>
        <p style={{ marginTop: ".5rem" }}>
          Votes and nullifiers are recorded on a public blockchain. This data is immutable
          by design — it cannot be deleted. Because it contains only cryptographic hashes
          (no names, addresses, or device identifiers), it does not constitute personal data
          under GDPR Article 4(1).
        </p>
      </div>

      <div className="card">
        <h2>Open source</h2>
        <p style={{ marginTop: ".5rem" }}>
          This entire privacy policy is verifiable — read the source code at{" "}
          <a href="https://github.com/TheVoteApp/the-vote-app" rel="noopener noreferrer">
            github.com/TheVoteApp/the-vote-app
          </a>. The machine-readable manifest is at{" "}
          <a href="/.well-known/privacy">/.well-known/privacy</a>.
        </p>
      </div>
    </div>
  );
}
