---
name: The Vote App — Project Overview
description: TheVoteApp — global blockchain-secured democratic voting app for iOS and Android, OSS, Apache 2.0
type: project
---

TheVoteApp is a free, open-source, blockchain-secured democratic voting platform for any nation's citizens to vote on domestic policy. Apache 2.0 licensed, no telemetry, no SaaS lock-in.

**Why:** To provide a tamper-proof, anonymous, publicly auditable voting system usable by any country without forking the codebase.

**How to apply:** All additions should preserve country-agnosticism (runtime config), ZK anonymity model, and no-PII-on-chain principles.

## Tech Stack

| Layer | Tech |
|---|---|
| Android | Kotlin, Jetpack Compose, MVVM + Clean Architecture, Room DB, Hilt, Web3j |
| iOS | Swift, SwiftUI, MVVM + Clean Architecture, CryptoKit, LocalAuthentication |
| Backend | Node.js, TypeScript, Express, ethers.js, snarkjs, Zod, Winston |
| Blockchain | Solidity 0.8.24, Hardhat, OpenZeppelin UUPS upgradeable, Groth16 ZK proofs |

## Project Structure

```
/
├── CLAUDE.md                   Agent role config (Testing, UX/UI, Deployment)
├── README.md                   GitHub-ready OSS documentation
├── android/                    Kotlin/Compose app
├── ios/                        Swift/SwiftUI app
├── backend/                    Node.js relay API
├── blockchain/                 Solidity contracts + Hardhat
├── agents/{testing,ux-ui,deployment}/CLAUDE.md
├── docs/                       Architecture, adding-a-country guide
└── .github/workflows/          CI: android-ci, ios-ci, backend-ci, security-scan
```

## Key Security Properties

- Votes stored as hashes — no plaintext on-chain
- ZK proofs (Groth16) prove eligibility without revealing identity
- Nullifier hash prevents double-voting without linking voter to vote
- Ephemeral keypairs in Android Keystore / iOS Secure Enclave
- Biometric auth required to submit vote
- Certificate pinning, TLS 1.3, Helmet CSP, rate limiting
- UUPS upgradeable contracts (governance DAO controls upgrades)

## Country Support

Country configs in `backend/src/countries/XX.json`. GB and US configs included. Adding a new country requires: JSON config, translations (strings.xml / Localizable.strings), and deploying a national identity oracle. See `docs/adding-a-country.md`.

## Agent System

Three Claude Code agents configured in CLAUDE.md and `agents/*/CLAUDE.md`:
- **Testing**: runs all test suites, never modifies production code
- **UX/UI**: WCAG 2.1 AA, RTL, localisation, design tokens, vote UX security
- **Deployment**: pre-deployment checklist, contract deployment, app store publishing

## Status (2026-05-15)

Initial scaffold complete — all layers created. Stub ZK verifier used for local dev; real Groth16 circuit needed before mainnet. Country configs for GB and US included. Ready for GitHub publication.
