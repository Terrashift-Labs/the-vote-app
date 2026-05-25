# TheVoteApp — Threat Model

**Version:** 1.0
**Date:** 2026-05-16
**Scope:** Mobile apps (Android + iOS), backend API, blockchain contracts, SMS channel, DID/FIDO2 auth

---

## 1. Assets

| Asset | Confidentiality | Integrity | Availability |
| --- | --- | --- | --- |
| Voter private key (Secure Enclave / Android Keystore) | Critical | Critical | High |
| Vote choice (which option was selected) | Critical | Critical | Medium |
| Voter nullifier (on-chain double-vote prevention) | Low | Critical | High |
| Identity commitment (on-chain, hashed DID) | Low | Critical | High |
| Policy document (IPFS-pinned) | Public | Critical | High |
| Vote tally (on-chain aggregate) | Public | Critical | High |
| Backend API availability | — | High | High |
| FCM/APNs device tokens | Medium | Low | Low |

---

## 2. Trust Boundaries

```
┌─ Device (Trusted) ──────────────────────────────────┐
│  Secure Enclave / Android Keystore (private key)     │
│  ZK prover WASM (snarkjs, bundled)                   │
│  Biometric prompt / FIDO2 authenticator              │
└──────────────────────────────────────────────────────┘
          │ TLS 1.3 + cert pinning
┌─ Backend API (Semi-trusted) ────────────────────────┐
│  Express, Zod validation, rate limiting              │
│  VC verification, ZK proof routing                   │
│  No vote content logged, no PII stored               │
└──────────────────────────────────────────────────────┘
          │ ethers.js / JSON-RPC
┌─ Blockchain (Public, Trustless) ────────────────────┐
│  VoteLedger, VoterRegistry, PolicyRegistry           │
│  Immutable after finalization                        │
│  DAO-controlled upgrades (7-day vote + 2-day lock)   │
└──────────────────────────────────────────────────────┘
          │ IPFS content addressing
┌─ IPFS (Public, Content-addressed) ─────────────────┐
│  Policy documents (CID on-chain = tamper-evident)   │
│  Gateway manifest (signed by known publisher key)    │
└──────────────────────────────────────────────────────┘
```

---

## 3. STRIDE Analysis

### 3.1 Mobile App

| Threat | Category | Mitigation |
| --- | --- | --- |
| Private key extraction via backup | Spoofing / Info Disclosure | `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`; Android Keystore hardware-backed; no iCloud/Google backup |
| Vote replay (same payload re-submitted) | Tampering | On-chain nullifier set — each nullifier can only be used once |
| Biometric bypass (accessibility injection) | Elevation of Privilege | `LAPolicy.deviceOwnerAuthenticationWithBiometrics` (no fallback); Android `BiometricManager.BIOMETRIC_STRONG` |
| Malicious app impersonation | Spoofing | App signing (Play Protect + App Store notarisation); FIDO2 origin binding |
| Traffic interception (MitM) | Info Disclosure | TLS 1.3 with certificate pinning; public-key pinning in `NSAppTransportSecurity` and OkHttp `CertificatePinner` |
| ZK circuit artifact tampering | Tampering | WASM and zkey files are bundled in signed app binary — not downloaded at runtime |

### 3.2 Backend API

| Threat | Category | Mitigation |
| --- | --- | --- |
| Vote content logging | Info Disclosure | Winston logger config explicitly excludes vote payload fields; audit enforced by code review |
| API abuse / DDoS | Denial of Service | Rate limiting (100 req/15 min per IP); Helmet CSP; WAF recommended in production |
| JWT forgery | Spoofing | Short-lived JWTs (15 min); RS256; public key pinned in mobile apps |
| SQL / NoSQL injection | Tampering | Zod schema validation at all ingress points; parameterised queries |
| Secrets in environment | Info Disclosure | `.env` gitignored; GitHub Secrets for CI; `direnv` locally; no secrets in source |
| Dependency vulnerability | Tampering | `npm audit` in CI; Dependabot weekly; critical CVEs patched within 24 h |

### 3.3 Blockchain Contracts

| Threat | Category | Mitigation |
| --- | --- | --- |
| Double voting | Tampering | Nullifier set in VoteLedger — `require(!usedNullifiers[nullifier])` |
| Invalid ZK proof accepted | Tampering | On-chain Groth16 verifier (IZKVerifier); stub replaced before mainnet |
| Unauthorized contract upgrade | Elevation of Privilege | UUPS upgrades require DAO vote (7-day voting period + 2-day timelock) |
| Admin key compromise | Elevation of Privilege | Deployer renounces admin after setup; 3-of-5 PauseGuardian for emergency pause |
| Front-running votes | Tampering | Votes are commitments, not plaintext; nullifier is pre-committed on-device |
| Policy document tampering | Tampering | IPFS CID on-chain — any content change produces a different CID, breaking the reference |

### 3.4 SMS Channel

| Threat | Category | Mitigation |
| --- | --- | --- |
| Phone number spoofing | Spoofing | Twilio validates sender via carrier network; webhook request signed with `X-Twilio-Signature` |
| Double voting via SMS | Tampering | Per-nullifier check: `SHA-256(phone + policyId + salt)` — salt is a server secret |
| Phone number enumeration | Info Disclosure | Phone numbers are hashed immediately and discarded; only nullifier is stored |
| SMS command injection | Tampering | Input parsed with fixed-format regex; no shell execution |
| Country bypass | Elevation of Privilege | E.164 country-code allowlist; unknown codes rejected |

### 3.5 DID / FIDO2

| Threat | Category | Mitigation |
| --- | --- | --- |
| DID linkage to identity | Info Disclosure | DID never transmitted to backend; only `keccak256(did‖countryCode‖salt)` commitment is sent |
| FIDO2 credential cloning | Spoofing | Authenticators enforce user verification (UV=required); counter-based replay protection |
| Credential phishing | Spoofing | WebAuthn origin binding — credential only valid for the registered RP ID |
| VC JWT forgery | Spoofing | Backend verifies JWT signature against national identity oracle public key |
| Challenge replay | Spoofing | One-time challenges with 5-minute expiry; used challenges deleted immediately |

---

## 4. Residual Risks

| Risk | Likelihood | Impact | Status |
| --- | --- | --- | --- |
| Malicious national identity oracle issues fraudulent VCs | Low | High | Accepted — out of scope; mitigated by DAO governance of oracle key |
| ZK circuit has a soundness bug (proving ineligible voters eligible) | Very Low | Critical | Mitigated by third-party circuit audit (planned before mainnet) |
| Secure Enclave / Keystore firmware vulnerability | Very Low | Critical | Accepted — OS vendor responsibility; monitor security advisories |
| Nation-state-level traffic analysis linking voter to ballot submission | Low | Medium | Accepted — consider Tor integration as future roadmap item |
| IPFS gateway unavailability | Medium | Low | Mitigated by fallback gateway list; documents cached on-device |

---

## 5. Security Controls Summary

- **Encryption at rest:** AES-256 (EncryptedSharedPreferences / iOS Data Protection)
- **Encryption in transit:** TLS 1.3, certificate pinning
- **Authentication:** Biometric (strong) + FIDO2 hardware key option
- **Authorisation:** On-chain nullifier set; DAO for contract changes; 3-of-5 pause guardian
- **Anonymity:** ZK proofs; nullifier-only on-chain; DID never leaves device
- **Auditability:** All votes publicly verifiable on-chain; IPFS CIDs content-addressed
- **Dependency hygiene:** `npm audit`, `./gradlew dependencyCheckAnalyze`, Dependabot, Gitleaks
- **Incident response:** Emergency 3-of-5 pause; DAO-governed unpause

---

## 6. Out of Scope

- Physical polling station security
- National identity oracle infrastructure
- Validator / miner behaviour on the underlying blockchain
- End-user device OS compromise (rooted/jailbroken devices)
