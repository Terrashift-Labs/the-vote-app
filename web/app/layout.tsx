import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TheVoteApp — Audit Trail",
  description: "Public ledger explorer for blockchain-secured democratic votes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav>
            <a href="/">TheVoteApp</a>
            <a href="/audit">Audit Trail</a>
            <a href="/verify">Verify Receipt</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>Open-source · Apache 2.0 · <a href="https://github.com/TheVoteApp/the-vote-app" rel="noopener noreferrer">View source</a></p>
        </footer>
      </body>
    </html>
  );
}
