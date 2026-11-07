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

## Responsible Disclosure

Please report suspected vulnerabilities privately to **security@thevoteapp.org**. Include reproduction steps, potential impact, and any suggested mitigation. Do not publish details before a fix is available.

Please do not:

- Test against the production mainnet deployment
- Access, modify, or delete other users' data
- Perform attacks that could degrade service for real citizens

We welcome responsible security reports but do not operate a paid bug bounty programme or offer monetary rewards.
