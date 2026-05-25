# TheVoteApp — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Citizens                                  │
│                 (any country, any eligible device)                  │
└───────────────┬──────────────────────────────────┬──────────────────┘
                │                                  │
        ┌───────▼──────┐                  ┌────────▼────────┐
        │  Android App │                  │    iOS App      │
        │  Kotlin +    │                  │  Swift +        │
        │  Compose     │                  │  SwiftUI        │
        └───────┬──────┘                  └────────┬────────┘
                │  HTTPS / TLS 1.3 + cert pin       │
                └────────────────┬──────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Backend API          │
                    │  Node.js / TypeScript   │
                    │  - Vote relay           │
                    │  - ZK proof verify      │
                    │  - Country config       │
                    │  - WebSocket (results)  │
                    └────────────┬────────────┘
                                 │  JSON-RPC / ethers.js
                    ┌────────────▼────────────┐
                    │  Ethereum-Compatible    │
                    │  Blockchain Node        │
                    │  (Hardhat local /       │
                    │   Sepolia testnet /     │
                    │   Mainnet / L2)         │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼────────┐  ┌──────────▼──────────┐  ┌───────▼──────────┐
│  VoterRegistry   │  │   VoteLedger         │  │ PolicyRegistry   │
│  .sol            │  │   .sol               │  │ .sol             │
│                  │  │                      │  │                  │
│  - Identity      │  │  - castVote()        │  │  - publishPolicy │
│    commitments   │  │  - Nullifier set     │  │  - IPFS CID ref  │
│  - Country gating│  │  - Option tallies    │  │  - Active flag   │
│  - UUPS proxy    │  │  - ZK verification   │  │  - UUPS proxy    │
└──────────────────┘  │  - UUPS proxy        │  └──────────────────┘
                      └──────────────────────┘
```

## Vote Lifecycle

```
1. REGISTER
   Citizen → [off-chain ID verification by national oracle]
            → oracle calls VoterRegistry.register(commitment, countryCode)
            → identity commitment stored on-chain (no PII)

2. AUTHENTICATE
   App → biometric prompt (Face ID / fingerprint)
       → load ephemeral session key from Secure Enclave / Keystore

3. SELECT
   App → fetch policies from backend (country-filtered)
       → citizen selects a policy and a vote option

4. SIGN
   App → derive nullifier: SHA-256(voterSecret || policyId)
       → build VotePayload struct
       → ECDSA sign payload with session key

5. PROVE (server-side in v1; client-side WASM in roadmap)
   App → POST /api/v1/vote with signed payload
   Backend → generate Groth16 ZK proof of Merkle membership
           → verify proof locally (snarkjs)

6. RELAY
   Backend → call VoteLedger.castVote(pollId, optionHash, nullifier, proof)
           → Ethereum node validates ZK proof on-chain
           → nullifier marked spent (prevents double-vote)
           → VoteCast event emitted

7. CONFIRM
   Backend → return transaction hash + block number to app
   App → display receipt screen with TX hash
       → poll backend until block confirmed

8. VERIFY (citizen can do this independently)
   Anyone → read VoteLedger.isNullifierSpent(nullifier) → true
          → fetch all VoteCast events → rebuild Merkle tree
          → verify their nullifier is in the tree
```

## Clean Architecture (Android & iOS)

```
Presentation Layer  →  ViewModels + Compose/SwiftUI Views
       ↓
Domain Layer       →  Use Cases + Domain Models + Repository Interfaces
       ↓
Data Layer         →  Repository Implementations + Remote/Local/Blockchain sources
```

- Domain layer has no Android/iOS/network dependencies
- Repository interfaces are in the domain layer; implementations in data
- Use cases contain all business rules

## Security Architecture

See [security.md](security.md) for the full threat model and controls.

Key properties:
- **No single point of trust**: no admin can alter votes
- **Public auditability**: anyone can verify the full tally from chain events
- **Voter privacy**: ZK proofs + nullifiers = eligibility without identity
- **Upgradeable**: UUPS proxy + governance DAO enables bug fixes without migration
