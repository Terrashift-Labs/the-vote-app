# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| Latest `main` | Yes |
| Tagged releases | Yes (critical patches only) |
| Older than 2 minor versions | No |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: **security@TheVoteApp.org**

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact (who is affected and how)
- Optional: suggested fix or mitigation

We will acknowledge your report within **48 hours** and provide a detailed
response within **5 business days**.

If the vulnerability is confirmed:
- We aim to patch **critical** issues within **24 hours**
- **High** severity within **7 days**
- **Medium** within **30 days**
- We will credit you in the release notes (unless you prefer anonymity)

## Security Design

TheVoteApp is designed with the following security properties:

### Vote Anonymity
- Votes are stored as hashes — no plaintext option data on-chain
- Voter identity is a cryptographic commitment — no PII on-chain
- Zero-knowledge proofs allow eligibility verification without identity disclosure
- Nullifiers prevent double-voting without linking a voter to their vote

### Tamper Resistance
- All votes are stored in an Ethereum-compatible blockchain — immutable once confirmed
- Smart contracts use the UUPS upgradeable proxy pattern (governance DAO controls upgrades)
- Every vote transaction is publicly auditable by anyone
- Merkle tree of vote commitments allows independent tally verification

### Mobile Security
- Biometric authentication required to submit votes
- Ephemeral keypairs stored in Android Keystore / iOS Keychain / Secure Enclave
- AES-256-GCM encryption at rest
- TLS 1.3 with certificate pinning
- `FLAG_SECURE` / window overlay on background transition to prevent screenshots

### Backend Security
- ECDSA signature verification before blockchain relay
- ZK proof verification server-side (saves gas on invalid submissions)
- Rate limiting: 20 vote attempts per IP per minute
- No PII logged — ever
- Helmet.js CSP headers
- Input validated with Zod schemas at every endpoint

### Key Threat Model

| Threat | Mitigation |
|---|---|
| Double voting | Nullifier hash prevents reuse; on-chain enforcement |
| Vote tampering | Blockchain immutability; ZK proof of correct vote formation |
| Identity theft | ZK commitment scheme; no PII stored |
| Sybil attack | National identity oracle required to register a commitment |
| Replay attack | Payload timestamp checked within ±5 minutes |
| Private key compromise | Ephemeral keys cleared at session end; Secure Enclave on supported devices |
| Malicious admin | UUPS upgrade requires governance DAO multisig |
| Traffic analysis | Nullifiers are unlinkable; votes padded to uniform size |

## Bug Bounty Programme

TheVoteApp operates a structured bug bounty programme. We reward security
researchers who responsibly disclose vulnerabilities.

### Scope

**In scope (eligible for reward):**

| Target | Examples |
| --- | --- |
| Smart contracts (`VoteLedger`, `VoterRegistry`, `PauseGuardian`, `AuditLog`) | Logic bugs, re-entrancy, integer overflow, access control bypass |
| Backend API (`/api/v1/*`) | Auth bypass, injection, privilege escalation, data exposure |
| iOS app | Keychain extraction, insecure storage, biometric bypass |
| Android app | Keystore extraction, insecure IPC, root detection bypass |
| ZK circuit | Soundness violations, malformed proof acceptance |
| Cross-chain relay | Message replay, spoofed sender, fund drain |

**Out of scope:**

- Denial of Service (volumetric / resource exhaustion)
- Social engineering attacks
- Vulnerabilities in third-party dependencies not directly exploitable in our stack
- Issues already publicly known or previously reported
- Theoretical vulnerabilities without a working proof of concept

### Severity & Rewards

| Severity | Criteria | Reward |
| --- | --- | --- |
| Critical | Vote manipulation, nullifier bypass, fund drain | $5,000 – $20,000 |
| High | Auth bypass, PII exposure, ZK soundness failure | $1,000 – $5,000 |
| Medium | Privilege escalation, DoS on single component | $250 – $1,000 |
| Low | Information disclosure, best-practice violation | $50 – $250 |
| Informational | No direct security impact | Acknowledgement only |

Rewards are paid in USDC on Ethereum mainnet.

**On-chain bounties:** Smart contract vulnerabilities are additionally listed on
[Immunefi](https://immunefi.com) under the TheVoteApp project. Critical
on-chain findings may be eligible for up to **$50,000** via Immunefi.

### Responsible Disclosure Timeline

1. Report to **security@thevoteapp.org** — include PoC, impact, and suggested fix
2. Acknowledgement within **48 hours**
3. Triage and severity assessment within **5 business days**
4. Fix and patch within: Critical → 24h, High → 7 days, Medium → 30 days
5. Coordinated public disclosure after fix is deployed

We will credit you in the release notes and on our
[Security Hall of Fame](../docs/hall-of-fame.md) unless you prefer anonymity.

**Please do not:**

- Test against the production mainnet deployment
- Access, modify, or delete other users' data
- Perform attacks that could degrade service for real citizens
