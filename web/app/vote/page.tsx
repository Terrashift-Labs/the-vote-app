import { Suspense } from "react";
import VoteClientPage from "./VoteClientPage";

export default function VotePage() {
  return (
    <div>
      <h1>Cast Your Vote</h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "1.5rem" }}>
        Select a policy and authenticate with your passkey or hardware security key.
        Your vote is anonymous and permanently recorded on the blockchain.
      </p>
      <Suspense fallback={<p>Loading policies…</p>}>
        <VoteClientPage />
      </Suspense>
    </div>
  );
}
