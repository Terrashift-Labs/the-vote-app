import type { Metadata } from "next";

export const metadata: Metadata = { title: "TheVoteApp — Admin Portal" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem", borderBottom: "1px solid var(--color-border)", paddingBottom: ".75rem" }}>
        <a href="/admin">Dashboard</a>
        <a href="/admin/policies">Policies</a>
        <a href="/admin/voters">Voter Roll</a>
        <a href="/admin/dao">DAO Proposals</a>
      </nav>
      {children}
    </div>
  );
}
