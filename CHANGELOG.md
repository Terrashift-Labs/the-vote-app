# Changelog

All notable changes to TheVoteApp are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- Initial project scaffold with Android (Kotlin/Compose) and iOS (Swift/SwiftUI) apps
- Blockchain layer: VoterRegistry, VoteLedger, PolicyRegistry smart contracts (Solidity)
- ZK proof integration (Groth16 via snarkjs) — stub verifier for local dev
- Backend relay API (Node.js/TypeScript) with vote submission, verification, and live results
- Biometric authentication (Android BiometricPrompt / iOS LocalAuthentication)
- Ephemeral session keypairs (Android Keystore / iOS Secure Enclave)
- Nullifier-based double-vote prevention
- Country config system — GB and US configs included
- Arabic (RTL) and English localisation
- CLAUDE.md agent configurations for Testing, UX/UI, and Deployment agents
- GitHub Actions CI: Android, iOS, Backend, Blockchain, Security Scan
- SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md

---

*Older releases will be added as the project matures.*
