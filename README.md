# TheVoteApp

**Free, open-source, blockchain-secured democratic voting for every nation.**

TheVoteApp lets citizens of any country vote on domestic policy through native iOS and Android apps. Every vote is cryptographically signed, recorded on an immutable blockchain ledger, and publicly auditable — yet fully anonymous. No government, corporation, or administrator can alter results.

[![Android CI](https://github.com/TheVoteApp/TheVoteApp/actions/workflows/android-ci.yml/badge.svg)](https://github.com/TheVoteApp/TheVoteApp/actions/workflows/android-ci.yml)
[![iOS CI](https://github.com/TheVoteApp/TheVoteApp/actions/workflows/ios-ci.yml/badge.svg)](https://github.com/TheVoteApp/TheVoteApp/actions/workflows/ios-ci.yml)
[![Backend CI](https://github.com/TheVoteApp/TheVoteApp/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/TheVoteApp/TheVoteApp/actions/workflows/backend-ci.yml)
[![Security Scan](https://github.com/TheVoteApp/TheVoteApp/actions/workflows/security-scan.yml/badge.svg)](https://github.com/TheVoteApp/TheVoteApp/actions/workflows/security-scan.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/TheVoteApp/TheVoteApp/badge)](https://securityscorecards.dev/viewer/?uri=github.com/TheVoteApp/TheVoteApp)

---

## Key Features

| Feature | Detail |
| --- | --- |
| Anonymous voting | Zero-knowledge proofs: prove eligibility without revealing identity |
| Tamper-proof ledger | Every vote committed as an on-chain transaction |
| Multi-country | Country configs loaded at runtime — no code fork needed |
| Native apps | Kotlin/Compose (Android) + Swift/SwiftUI (iOS) |
| Biometric auth | Fingerprint / Face ID guards vote submission |
| Offline resilience | Votes queued locally, broadcast when connection restores |
| Auditable | Public verifier tool included — anyone can audit the full tally |
| Localised | Full RTL support; add any locale via JSON translation files |

---

## Architecture

```text
Citizens
   |
   | HTTPS / TLS 1.3
   v
[iOS App]   [Android App]
   |               |
   +-------+-------+
           |
    [Backend API]          Node.js / TypeScript
           |
    [Blockchain Node]      Ethereum-compatible (local Hardhat / testnet / mainnet)
           |
    [Smart Contracts]      VoteLedger.sol  ·  PolicyRegistry.sol  ·  VoterRegistry.sol
```

**Vote lifecycle:**

1. Citizen authenticates (biometric + government-issued ID hash)
2. App generates an ephemeral keypair; identity commitment posted to `VoterRegistry`
3. Citizen selects policy stance and signs the vote payload locally
4. Signed vote submitted to backend; backend relays to smart contract
5. Contract verifies ZK proof of eligibility, records nullifier to prevent double-voting
6. Vote added to `VoteLedger` block — immutable, publicly readable
7. Results aggregated on-chain; anyone can independently verify

---

## Repository Structure

```text
/
├── android/              Kotlin/Jetpack Compose mobile app
├── ios/                  Swift/SwiftUI mobile app
├── backend/              Node.js/TypeScript REST API
├── blockchain/           Solidity contracts + Hardhat toolchain
├── agents/               Claude Code agent role configs
│   ├── testing/
│   ├── ux-ui/
│   └── deployment/
├── docs/                 Architecture, security, deployment guides
└── .github/              CI/CD workflows, issue templates, community files
```

---

## Quick Start

### Prerequisites

- Node.js 20+, npm 10+
- Android Studio Hedgehog+ (for Android)
- Xcode 16+ (for iOS, macOS only)
- Docker Desktop 4.x+ (required for `make dev`)

### 1. Clone

```bash
git clone https://github.com/TheVoteApp/TheVoteApp.git
cd TheVoteApp
```

### 2. One-command dev stack (recommended)

```bash
make dev
```

Starts Hardhat, Redis, IPFS, the backend API, Prometheus, and Grafana — all wired together.

| Service | URL |
| --- | --- |
| Backend API | `http://localhost:3000` |
| Grafana | `http://localhost:3001` (admin / admin) |
| Prometheus | `http://localhost:9090` |
| IPFS gateway | `http://localhost:8080` |
| Hardhat RPC | `http://localhost:8545` (chainId 31337) |

### 3. Manual setup (without Docker)

```bash
# Blockchain
cd blockchain && npm install
npx hardhat node                                           # chain on :8545
npx hardhat run scripts/deploy.ts --network localhost     # in a second terminal

# Backend
cd backend && npm install
cp .env.example .env    # set VOTE_LEDGER_ADDRESS from deploy output
npm run dev             # http://localhost:3000
```

### 4. Android

Open `android/` in Android Studio. Select the `localDebug` build variant and run on an emulator.

### 5. iOS

```bash
cd ios && xed TheVoteApp.xcworkspace   # opens in Xcode
```

Select the `TheVoteApp` scheme and run on an iPhone 16 simulator.

---

## Security

See [SECURITY.md](.github/SECURITY.md) for the vulnerability disclosure policy.

Summary of security controls:

- AES-256-GCM encryption at rest
- TLS 1.3 in transit; certificate pinning in mobile apps
- Zero-knowledge vote proofs (Groth16 via snarkjs)
- Nullifier hash prevents double-voting without revealing the voter
- No PII stored on-chain or in backend logs
- Weekly dependency audits; critical CVEs patched within 24 hours
- OpenSSF Scorecard CI gate — score must stay above 7/10

---

## Contributing

Read [CONTRIBUTING.md](.github/CONTRIBUTING.md) first. All contributions welcome:

- Add a new country config (`backend/src/countries/`)
- Add a translation (`android/app/src/main/res/values-XX/strings.xml` or `ios/TheVoteApp/Resources/XX.lproj/Localizable.strings`)
- Improve the ZK circuit (`blockchain/circuits/`)
- Write tests

All commits must be signed off (`git commit -s`). No CLA required.

---

## Roadmap

- [x] Core vote submission flow (Android + iOS)
- [x] Blockchain ledger + smart contracts (VoteLedger, VoterRegistry, PolicyRegistry)
- [x] ZK proof of eligibility (Groth16 / snarkjs)
- [x] 30+ country configs with government branding
- [x] Multi-language UI — 10 languages including RTL
- [x] Governance DAO for contract upgrades (OpenZeppelin Governor + Timelock)
- [x] W3C DID decentralised identity integration (did:ethr)
- [x] IPFS-pinned policy document storage (Helia)
- [x] Hardware security key support (FIDO2 / WebAuthn)
- [x] Client-side ZK proving (snarkjs WASM — removes server trust)
- [x] Mobile app store publication (Google Play + App Store)
- [x] Decentralised backend (IPFS-hosted API, no central server)
- [x] SMS fallback voting channel for low-connectivity regions

### Phase 2 — Production Hardening

- [x] End-to-end integration test suite (Detox / Supertest)
- [x] On-chain vote tally and public result aggregation
- [x] Audit trail dashboard — citizen-facing ledger explorer
- [x] Push notifications for vote deadlines and results
- [x] Multi-sig emergency pause for VoteLedger contract (3-of-5 PauseGuardian)
- [x] Formal threat model document

### Phase 3 — Ecosystem

- [x] Web app (Next.js) for desktop voters
- [x] National administrator portal — policy creation and voter roll
- [x] Third-party verifier CLI — audit results from IPFS + chain
- [x] L2 deployment (Optimism / Arbitrum) to reduce gas costs
- [x] Offline ballot QR code — scan at polling station to submit later

### Phase 4 — Resilience & Privacy

- [x] Tor / onion routing support for anonymous API access
- [x] End-to-end encrypted vote receipts (voter holds decryption key)
- [x] Disaster-recovery runbook and automated backup/restore for backend state
- [x] Rate-limit and DDoS stress test suite (k6 load tests)

### Phase 5 — Accessibility & Reach

- [x] WCAG 2.1 AA full audit — TalkBack (Android) and VoiceOver (iOS) pass
- [x] 20+ additional language translations (zh, ru, tr, ko, uk, vi, fa, he + more)
- [x] Low-bandwidth mode (compressed payloads, image-free UI)
- [x] USSD fallback channel (feature phones, no data required)

### Phase 6 — Trust & Compliance

- [x] Verifiable audit log — every admin action signed and IPFS-pinned
- [x] Voter anonymity set analysis — minimum k-anonymity enforcement
- [x] Privacy policy and GDPR / PDPA compliance layer
- [x] Dependency SBOM (Software Bill of Materials) generation
- [x] OpenSSF Scorecard integration in CI
- [x] Smart contract formal verification (Halmos symbolic execution)

### Phase 7 — Scale & Operations

- [x] Horizontal backend scaling with Redis session store
- [x] Prometheus + Grafana observability stack
- [x] WebSocket live tally feed for real-time result updates
- [x] Docker Compose local dev environment
- [x] Automated canary deployments with rollback
- [x] Multi-region IPFS pinning (Pinata + Web3.Storage + Filebase)

### Phase 8 — Advanced Security & Governance

- [x] Smart contract formal verification (Halmos symbolic execution)
- [x] Canary deployment pipeline (GitHub Actions + health gate + auto-rollback)
- [x] Multi-region IPFS pinning (Pinata + Web3.Storage + Filebase)
- [x] Rate-limiting per country and per policy (sliding window, Redis-backed)
- [x] Voter roll import via national identity API adapters (OAuth 2.0 / eIDAS, Gov.UK One Login)
- [x] DAO governance mobile UI — propose, vote, and track contract upgrades in-app
- [x] ZK circuit upgrade: Groth16 → Plonk (no trusted setup, universal SRS)
- [x] Cross-chain vote aggregation (LayerZero V2 — L2VoteCaster + CrossChainVoteRelay)

### Phase 9 — Ecosystem Maturity

- [x] Voter identity self-service — citizens register commitment via mobile without admin
- [ ] Election result certification — notarised PDF report with on-chain proof
- [ ] Public API developer portal (OpenAPI 3.1 spec + interactive docs)
- [ ] Bug bounty programme setup (Immunefi / HackerOne integration)
- [ ] Hardware wallet support — Ledger / Trezor for vote signing on desktop
- [ ] Zero-knowledge vote tallying — tally without revealing individual votes (Homomorphic)

---

## License

Apache License 2.0 — free to use, fork, and deploy. See [LICENSE](LICENSE).

> TheVoteApp is a community project. It is not affiliated with any government,
> political party, or commercial entity.
# the-vote-app
