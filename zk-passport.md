# Anonymous Citizenship Verification with ZKPassport

**Project:** [TheVoteApp](https://github.com/Terrashift-Labs/the-vote-app)
**Source:** [docs.zkpassport.id](https://docs.zkpassport.id/intro)
**Date:** 21 September 2026
**Replaces:** the earlier Self-based plan (`self-identity-verification.md`)

---

## 1. Goal

Check **once, when someone registers**, that they are a real citizen of a given country and haven't registered before. Do this without TheVoteApp ever learning who they are, and make sure no vote can be traced back to the person who cast it.

## 2. Why we switched from Self

| | **ZKPassport** | Self |
|---|---|---|
| **Cost** | **Free.** ZKPassport's site says: *"the verification itself is free."* Only optional extras such as white-label apps, hosted analytics and premium support may cost money. | Self Pass is free but marked legacy. Self Enterprise charges credits after a one-time free grant. |
| **Where proofs are made** | **On the user's phone.** *"Everything is done locally on the device to ensure complete privacy from both the service and us."* | Registration proofs are generated in Self's secure enclave (TEE). |
| **Open source** | Circuits (Noir) and SDK under Apache 2.0. The mobile app will be open-sourced *"after the testing phase"*. | Open source |
| **On-chain verifier** | Ethereum mainnet, Sepolia and Base. This matches TheVoteApp's Ethereum-compatible stack. | Celo only |
| **Documents** | ICAO 9303 passports, national ID cards and residence permits | Passports, ID cards, Aadhaar, KYC |

## 3. How ZKPassport works

1. The user opens the **ZKPassport app** from a QR code or deeplink and scans their passport or ID card chip over NFC.
2. The app checks the chip's signature against the issuing country's published signing certificates. It then generates a **zero-knowledge proof on the device** that answers only the questions asked, e.g. "nationality = GBR, age ≥ 18".
3. The app returns the proofs and a **`uniqueIdentifier`**. Per the FAQ, this is a Poseidon2 hash of the ID data combined with *"the domain name and the scope."* It is *"the same for the same ID while differing between different services."* **TheVoteApp uses this value to stop the same document registering twice.**
4. Your server re-checks the proofs with `zkPassport.verify()`, or a contract checks them on-chain with `ZKPassportVerifier`.

### Choose the salted identifier

By default, *"anyone with complete knowledge of the ID chip data (for example the government that issued the ID) could recompute"* the unique identifier. For a civic voting app, that would let a government find out **who registered**. It would not reveal how anyone voted, because votes use a separate key (§4).

[Salted identifiers](https://docs.zkpassport.id/examples/salted-identifiers) (`NullifierType.SALTED`) fix this. A distributed network of vOPRF servers holds a shared secret, and *"no single server holds the whole secret."* The servers only ever see blinded values. The catch is that **salted identifiers require `facematch("strict")`**, which needs an attested device (see §7).

**Recommendation:** use salted identifiers with strict FaceMatch as the default. Allow non-salted identifiers only as a documented fallback for devices that can't do FaceMatch.

## 4. Target architecture for TheVoteApp

The key principle is to **keep identity separate from the vote key**. ZKPassport proves "citizen of X, this document hasn't been used before". TheVoteApp's own Semaphore-style secret proves "eligible voter, hasn't voted in this poll yet". The two are never linked by anything the server can compute.

```text
 ┌──────────── User's phone ──────────────────┐
 │ 1. TheVoteApp generates voterSecret (keychain)│
 │    commitment = Poseidon(voterSecret)        │
 │ 2. Opens ZKPassport request; query binds     │
 │    custom_data = commitment                  │
 │ 3. ZKPassport app scans NFC chip, proves     │
 │    on-device: nationality=GBR, age≥18,       │
 │    + uniqueIdentifier(ID, domain, scope)     │
 └────────────────────┬────────────────────────┘
                      ▼
 ┌──────────── Backend (ZKPassportAdapter) ────┐
 │ 4. zkPassport.verify({ proofs, ... })         │
 │ 5. nationality result == true?                │
 │ 6. uniqueIdentifier seen before? → reject     │
 │ 7. store uniqueIdentifier only (no PII)       │
 │ 8. VoterRegistry.register(commitment, cc)     │
 └────────────────────┬────────────────────────┘
                      ▼
 ┌──────────── Voting (existing) ──────────────┐
 │ ZK proof: "my commitment ∈ tree for GB"      │
 │ vote nullifier = H(voterSecret, pollId)      │
 │ Server can't compute it → votes are          │
 │ unlinkable to the registration               │
 └──────────────────────────────────────────────┘
```

**After registration, users don't go through identity checks again.** Each login just unlocks `voterSecret` using the device passkey or biometrics already in the app (`FIDO2Service`).

## 5. Integration code (sketch)

These sketches are based on the [Basic Usage](https://docs.zkpassport.id/getting-started/basic-usage) and [API](https://docs.zkpassport.id/api) pages. Check them against the current SDK before shipping.

```bash
npm install @zkpassport/sdk      # add @zkpassport/ui for the drop-in React QR card (web)
```

### 5.1 Create the request

```ts
import { ZKPassport, NullifierType } from "@zkpassport/sdk";

const zkPassport = new ZKPassport("thevoteapp.org");     // domain is part of the unique ID

const qb = await zkPassport.request({
  name: "TheVoteApp",
  logo: "https://thevoteapp.org/logo.png",
  purpose: "Prove you are an adult citizen of the United Kingdom",
  scope: "citizen-gbr",                  // one scope per country
  mode: "fast",                          // "compressed-evm" if verifying on-chain (§5.3)
  uniqueIdentifierType: NullifierType.SALTED,
  oprfKeyId: process.env.ZKP_OPRF_KEY_ID, // required for salted IDs — confirm how to obtain
  devMode: process.env.NODE_ENV !== "production",
});

const { url, onResult, onReject, onError } = qb
  .eq("nationality", "GBR")              // citizenship check — nothing else disclosed
  .gte("age", 18)
  .bind("custom_data", voterCommitmentHex) // ties the vote-key commitment to this proof (≤500 bytes total)
  .facematch("strict")                   // required for salted identifiers
  .done();

// Native iOS/Android: open `url` to launch the ZKPassport app (web: render it as a QR)
```

> Don't call `.disclose()` on `fullname`, `birthdate`, `document_number` or any other personal field. The server only needs yes/no results.

### 5.2 Verify on the server

The docs say: *"For anything security-sensitive, verify the proofs on your server."* Never trust the client's `verified` flag.

```ts
// backend/src/identity/ZKPassportAdapter.ts  (sketch)
import { ZKPassport, NullifierType } from "@zkpassport/sdk";

const zkPassport = new ZKPassport("thevoteapp.org");

export async function verifyZKPassport(body, country /* { code: "GB", alpha3: "GBR" } */) {
  const { proofs, queryResult, originalQuery } = body;

  const { verified, uniqueIdentifier, uniqueIdentifierType, queryResultErrors } =
    await zkPassport.verify({
      proofs,
      originalQuery,
      queryResult,
      scope: `citizen-${country.alpha3.toLowerCase()}`,
      devMode: process.env.NODE_ENV !== "production",
      oprfKeyId: process.env.ZKP_OPRF_KEY_ID,
    });

  if (!verified || queryResultErrors) throw new Error("invalid proof");
  if (uniqueIdentifierType !== NullifierType.SALTED) throw new Error("salted ID required");

  // check the *proven* constraints, not just that a proof exists
  if (queryResult.nationality?.eq?.expected !== country.alpha3 ||
      queryResult.nationality?.eq?.result !== true) throw new Error("not a citizen");
  if (queryResult.age?.gte?.result !== true) throw new Error("under 18");

  const commitment = /* read bound custom_data from queryResult / proofs */;

  return { sybilKey: uniqueIdentifier, commitment, countryCode: country.code };
}
```

The caller then checks `sybilKey` against the used-identifier store, saves it, and calls `VoterRegistry.register(commitment, countryCode)`.

### 5.3 Optional: fully on-chain registrar ([onchain docs](https://docs.zkpassport.id/getting-started/onchain))

`ZKPassportVerifier` is deployed at `0x1D000001000EFD9a6371f4d90bB8920D5431c0D8`, the same address on Ethereum, Sepolia and Base. Build the request with `mode: "compressed-evm"`, then pass the `outer_evm` proof through `getSolidityVerifierParameters(...)`. With that, `VoterRegistry` can verify the proof itself and **the backend no longer needs to be trusted as registrar**:

```solidity
(bool verified, bytes32 uniqueIdentifier, IZKPassportHelper helper) =
    zkPassportVerifier.verify(params);
require(verified, "Proof is invalid");
require(!usedIdentifier[uniqueIdentifier], "Already registered");
// use helper to check nationality == country and read bound custom_data (commitment)
usedIdentifier[uniqueIdentifier] = true;
_register(commitment, countryCode);
```

## 6. Changes needed in the repo

| # | File | Issue | Fix |
|---|---|---|---|
| 1 | `backend/src/identity/BaseIdentityAdapter.ts` | `deriveCommitment()` builds the on-chain commitment on the server from `subjectId`. The operator can therefore link a commitment to a person, and possibly work out their vote nullifiers. | Change `IdentityResult` to `{ sybilKey, commitment (client-supplied), countryCode }`. The server should never derive the vote key. |
| 2 | `backend/src/identity/ZKPassportAdapter.ts` (new) + `IdentityAdapterRegistry.ts` | There's no ZKPassport adapter | Add the adapter and register it as `["zkpassport", …]` |
| 3 | `blockchain/contracts/VoterRegistry.sol` | `register()` accepts **any** caller when no registrar is set for a country | `revert UnauthorisedRegistrar()` if `countryRegistrar[cc] == address(0)`. Optionally verify ZKPassport proofs on-chain (§5.3). |
| 4 | Backend storage | Need to detect duplicate registrations | Add a table or set for `usedUniqueIdentifiers` (identifier → timestamp only) |
| 5 | `backend/src/countries/*.json` | ZKPassport uses ISO alpha-3 codes | Add an `alpha3` field |
| 6 | Android / iOS apps | The vote secret has to be generated on the device | Generate and store `voterSecret` in the Keystore/Keychain. Send only `Poseidon(voterSecret)`. Open the ZKPassport request URL. |

## 7. Caveats and open questions

- **One document per account, not one person.** The docs say the mapping is *"one ID ↔ one account"*. Someone holding both a passport and a national ID card from the same country gets two different identifiers. Options: accept only one document type per country (use `.eq("document_type", …)` after confirming its values), or accept this as a small residual risk.
- **Residence permits are accepted by ZKPassport.** The `nationality` field still shows the holder's own citizenship, so the `eq("nationality", …)` check covers it. Test this against real permits anyway.
- **Coverage.** Only countries that *"publish their signing certificates"* are supported, and some started issuing supported IDs only recently. Check the coverage map for each country before enabling it, and keep a fallback (eIDAS, GOV.UK, or in-person).
- **FaceMatch availability.** It requires an attested device (Apple App Attest / Google Play Integrity). *"On Android, the app may refuse to perform the face scan on some devices."* Rooted or jailbroken phones can't do it, which rules out salted identifiers on those devices.
- **Trust in the vOPRF network.** Salted identifiers depend on the distributed servers not colluding. That's a smaller assumption than Self's enclave, but it should still be written down.
- **Renewal.** The identifier is tied to *the ID*, so a renewed passport may produce a new one. Test whether this allows a second registration. Mitigations include only accepting proofs from newly issued documents or re-binding.
- **Timing.** Add commitments to the tree in batches, and only open voting once a country's group has at least *k* members, to go with the existing `AnonymityService`.
- **The mobile app isn't open source yet.** The circuits and SDK are, but the ZKPassport app will be released *"after the testing phase"*. Note this in the threat model.
- **Coercion and vote-buying** aren't solved by identity checks. Consider re-voting (only the last vote counts) later.

## 8. Next steps

1. Register `thevoteapp.org` on the [ZKPassport dashboard](https://docs.zkpassport.id/getting-started/policies) and confirm how to get `oprfKeyId` for salted identifiers.
2. Prototype with [dev mode](https://docs.zkpassport.id/getting-started/dev-mode) (mock proofs) on Sepolia.
3. Implement fixes 1–6 behind the `zkpassport` adapter.
4. Test renewal, dual-document and residence-permit cases with real documents.
5. Update `docs/THREAT_MODEL.md` with the vOPRF, device-attestation and timing assumptions.

## References

- [ZKPassport home: "the verification itself is free"](https://zkpassport.id/)
- [Docs intro](https://docs.zkpassport.id/intro)
- [FAQ](https://docs.zkpassport.id/faq)
- [Basic usage](https://docs.zkpassport.id/getting-started/basic-usage)
- [API reference](https://docs.zkpassport.id/api)
- [Onchain verification](https://docs.zkpassport.id/getting-started/onchain)
- [Personhood example](https://docs.zkpassport.id/examples/personhood)
- [Salted identifiers](https://docs.zkpassport.id/examples/salted-identifiers)
- [Limitations](https://docs.zkpassport.id/limitations)
- [Dashboard & policies](https://docs.zkpassport.id/getting-started/policies)
- [Circuits (GitHub)](https://github.com/zkpassport/circuits) · [npm SDK](https://www.npmjs.com/package/@zkpassport/sdk)

# Anonymous Citizenship Verification with ZKPassport

**Project:** [TheVoteApp](https://github.com/Terrashift-Labs/the-vote-app)
**Source:** [docs.zkpassport.id](https://docs.zkpassport.id/intro)
**Date:** 21 September 2026
**Replaces:** the earlier Self-based plan (`self-identity-verification.md`)

---

## 1. Goal

Check **once, when someone registers**, that they are a real citizen of a given country and haven't registered before. Do this without TheVoteApp ever learning who they are, and make sure no vote can be traced back to the person who cast it.

## 2. Why we switched from Self

| | **ZKPassport** | Self |
|---|---|---|
| **Cost** | **Free.** ZKPassport's site says: *"the verification itself is free."* Only optional extras such as white-label apps, hosted analytics and premium support may cost money. | Self Pass is free but marked legacy. Self Enterprise charges credits after a one-time free grant. |
| **Where proofs are made** | **On the user's phone.** *"Everything is done locally on the device to ensure complete privacy from both the service and us."* | Registration proofs are generated in Self's secure enclave (TEE). |
| **Open source** | Circuits (Noir) and SDK under Apache 2.0. The mobile app will be open-sourced *"after the testing phase"*. | Open source |
| **On-chain verifier** | Ethereum mainnet, Sepolia and Base. This matches TheVoteApp's Ethereum-compatible stack. | Celo only |
| **Documents** | ICAO 9303 passports, national ID cards and residence permits | Passports, ID cards, Aadhaar, KYC |

## 3. How ZKPassport works

1. The user opens the **ZKPassport app** from a QR code or deeplink and scans their passport or ID card chip over NFC.
2. The app checks the chip's signature against the issuing country's published signing certificates. It then generates a **zero-knowledge proof on the device** that answers only the questions asked, e.g. "nationality = GBR, age ≥ 18".
3. The app returns the proofs and a **`uniqueIdentifier`**. Per the FAQ, this is a Poseidon2 hash of the ID data combined with *"the domain name and the scope."* It is *"the same for the same ID while differing between different services."* **TheVoteApp uses this value to stop the same document registering twice.**
4. Your server re-checks the proofs with `zkPassport.verify()`, or a contract checks them on-chain with `ZKPassportVerifier`.

### Choose the salted identifier

By default, *"anyone with complete knowledge of the ID chip data (for example the government that issued the ID) could recompute"* the unique identifier. For a civic voting app, that would let a government find out **who registered**. It would not reveal how anyone voted, because votes use a separate key (§4).

[Salted identifiers](https://docs.zkpassport.id/examples/salted-identifiers) (`NullifierType.SALTED`) fix this. A distributed network of vOPRF servers holds a shared secret, and *"no single server holds the whole secret."* The servers only ever see blinded values. The catch is that **salted identifiers require `facematch("strict")`**, which needs an attested device (see §7).

**Recommendation:** use salted identifiers with strict FaceMatch as the default. Allow non-salted identifiers only as a documented fallback for devices that can't do FaceMatch.

## 4. Target architecture for TheVoteApp

The key principle is to **keep identity separate from the vote key**. ZKPassport proves "citizen of X, this document hasn't been used before". TheVoteApp's own Semaphore-style secret proves "eligible voter, hasn't voted in this poll yet". The two are never linked by anything the server can compute.

```text
 ┌──────────── User's phone ──────────────────┐
 │ 1. TheVoteApp generates voterSecret (keychain)│
 │    commitment = Poseidon(voterSecret)        │
 │ 2. Opens ZKPassport request; query binds     │
 │    custom_data = commitment                  │
 │ 3. ZKPassport app scans NFC chip, proves     │
 │    on-device: nationality=GBR, age≥18,       │
 │    + uniqueIdentifier(ID, domain, scope)     │
 └────────────────────┬────────────────────────┘
                      ▼
 ┌──────────── Backend (ZKPassportAdapter) ────┐
 │ 4. zkPassport.verify({ proofs, ... })         │
 │ 5. nationality result == true?                │
 │ 6. uniqueIdentifier seen before? → reject     │
 │ 7. store uniqueIdentifier only (no PII)       │
 │ 8. VoterRegistry.register(commitment, cc)     │
 └────────────────────┬────────────────────────┘
                      ▼
 ┌──────────── Voting (existing) ──────────────┐
 │ ZK proof: "my commitment ∈ tree for GB"      │
 │ vote nullifier = H(voterSecret, pollId)      │
 │ Server can't compute it → votes are          │
 │ unlinkable to the registration               │
 └──────────────────────────────────────────────┘
```

**After registration, users don't go through identity checks again.** Each login just unlocks `voterSecret` using the device passkey or biometrics already in the app (`FIDO2Service`).

## 5. Integration code (sketch)

These sketches are based on the [Basic Usage](https://docs.zkpassport.id/getting-started/basic-usage) and [API](https://docs.zkpassport.id/api) pages. Check them against the current SDK before shipping.

```bash
npm install @zkpassport/sdk      # add @zkpassport/ui for the drop-in React QR card (web)
```

### 5.1 Create the request

```ts
import { ZKPassport, NullifierType } from "@zkpassport/sdk";

const zkPassport = new ZKPassport("thevoteapp.org");     // domain is part of the unique ID

const qb = await zkPassport.request({
  name: "TheVoteApp",
  logo: "https://thevoteapp.org/logo.png",
  purpose: "Prove you are an adult citizen of the United Kingdom",
  scope: "citizen-gbr",                  // one scope per country
  mode: "fast",                          // "compressed-evm" if verifying on-chain (§5.3)
  uniqueIdentifierType: NullifierType.SALTED,
  oprfKeyId: process.env.ZKP_OPRF_KEY_ID, // required for salted IDs — confirm how to obtain
  devMode: process.env.NODE_ENV !== "production",
});

const { url, onResult, onReject, onError } = qb
  .eq("nationality", "GBR")              // citizenship check — nothing else disclosed
  .gte("age", 18)
  .bind("custom_data", voterCommitmentHex) // ties the vote-key commitment to this proof (≤500 bytes total)
  .facematch("strict")                   // required for salted identifiers
  .done();

// Native iOS/Android: open `url` to launch the ZKPassport app (web: render it as a QR)
```

> Don't call `.disclose()` on `fullname`, `birthdate`, `document_number` or any other personal field. The server only needs yes/no results.

### 5.2 Verify on the server

The docs say: *"For anything security-sensitive, verify the proofs on your server."* Never trust the client's `verified` flag.

```ts
// backend/src/identity/ZKPassportAdapter.ts  (sketch)
import { ZKPassport, NullifierType } from "@zkpassport/sdk";

const zkPassport = new ZKPassport("thevoteapp.org");

export async function verifyZKPassport(body, country /* { code: "GB", alpha3: "GBR" } */) {
  const { proofs, queryResult, originalQuery } = body;

  const { verified, uniqueIdentifier, uniqueIdentifierType, queryResultErrors } =
    await zkPassport.verify({
      proofs,
      originalQuery,
      queryResult,
      scope: `citizen-${country.alpha3.toLowerCase()}`,
      devMode: process.env.NODE_ENV !== "production",
      oprfKeyId: process.env.ZKP_OPRF_KEY_ID,
    });

  if (!verified || queryResultErrors) throw new Error("invalid proof");
  if (uniqueIdentifierType !== NullifierType.SALTED) throw new Error("salted ID required");

  // check the *proven* constraints, not just that a proof exists
  if (queryResult.nationality?.eq?.expected !== country.alpha3 ||
      queryResult.nationality?.eq?.result !== true) throw new Error("not a citizen");
  if (queryResult.age?.gte?.result !== true) throw new Error("under 18");

  const commitment = /* read bound custom_data from queryResult / proofs */;

  return { sybilKey: uniqueIdentifier, commitment, countryCode: country.code };
}
```

The caller then checks `sybilKey` against the used-identifier store, saves it, and calls `VoterRegistry.register(commitment, countryCode)`.

### 5.3 Optional: fully on-chain registrar ([onchain docs](https://docs.zkpassport.id/getting-started/onchain))

`ZKPassportVerifier` is deployed at `0x1D000001000EFD9a6371f4d90bB8920D5431c0D8`, the same address on Ethereum, Sepolia and Base. Build the request with `mode: "compressed-evm"`, then pass the `outer_evm` proof through `getSolidityVerifierParameters(...)`. With that, `VoterRegistry` can verify the proof itself and **the backend no longer needs to be trusted as registrar**:

```solidity
(bool verified, bytes32 uniqueIdentifier, IZKPassportHelper helper) =
    zkPassportVerifier.verify(params);
require(verified, "Proof is invalid");
require(!usedIdentifier[uniqueIdentifier], "Already registered");
// use helper to check nationality == country and read bound custom_data (commitment)
usedIdentifier[uniqueIdentifier] = true;
_register(commitment, countryCode);
```

## 6. Changes needed in the repo

| # | File | Issue | Fix |
|---|---|---|---|
| 1 | `backend/src/identity/BaseIdentityAdapter.ts` | `deriveCommitment()` builds the on-chain commitment on the server from `subjectId`. The operator can therefore link a commitment to a person, and possibly work out their vote nullifiers. | Change `IdentityResult` to `{ sybilKey, commitment (client-supplied), countryCode }`. The server should never derive the vote key. |
| 2 | `backend/src/identity/ZKPassportAdapter.ts` (new) + `IdentityAdapterRegistry.ts` | There's no ZKPassport adapter | Add the adapter and register it as `["zkpassport", …]` |
| 3 | `blockchain/contracts/VoterRegistry.sol` | `register()` accepts **any** caller when no registrar is set for a country | `revert UnauthorisedRegistrar()` if `countryRegistrar[cc] == address(0)`. Optionally verify ZKPassport proofs on-chain (§5.3). |
| 4 | Backend storage | Need to detect duplicate registrations | Add a table or set for `usedUniqueIdentifiers` (identifier → timestamp only) |
| 5 | `backend/src/countries/*.json` | ZKPassport uses ISO alpha-3 codes | Add an `alpha3` field |
| 6 | Android / iOS apps | The vote secret has to be generated on the device | Generate and store `voterSecret` in the Keystore/Keychain. Send only `Poseidon(voterSecret)`. Open the ZKPassport request URL. |

## 7. Caveats and open questions

- **One document per account, not one person.** The docs say the mapping is *"one ID ↔ one account"*. Someone holding both a passport and a national ID card from the same country gets two different identifiers. Options: accept only one document type per country (use `.eq("document_type", …)` after confirming its values), or accept this as a small residual risk.
- **Residence permits are accepted by ZKPassport.** The `nationality` field still shows the holder's own citizenship, so the `eq("nationality", …)` check covers it. Test this against real permits anyway.
- **Coverage.** Only countries that *"publish their signing certificates"* are supported, and some started issuing supported IDs only recently. Check the coverage map for each country before enabling it, and keep a fallback (eIDAS, GOV.UK, or in-person).
- **FaceMatch availability.** It requires an attested device (Apple App Attest / Google Play Integrity). *"On Android, the app may refuse to perform the face scan on some devices."* Rooted or jailbroken phones can't do it, which rules out salted identifiers on those devices.
- **Trust in the vOPRF network.** Salted identifiers depend on the distributed servers not colluding. That's a smaller assumption than Self's enclave, but it should still be written down.
- **Renewal.** The identifier is tied to *the ID*, so a renewed passport may produce a new one. Test whether this allows a second registration. Mitigations include only accepting proofs from newly issued documents or re-binding.
- **Timing.** Add commitments to the tree in batches, and only open voting once a country's group has at least *k* members, to go with the existing `AnonymityService`.
- **The mobile app isn't open source yet.** The circuits and SDK are, but the ZKPassport app will be released *"after the testing phase"*. Note this in the threat model.
- **Coercion and vote-buying** aren't solved by identity checks. Consider re-voting (only the last vote counts) later.

## 8. Next steps

1. Register `thevoteapp.org` on the [ZKPassport dashboard](https://docs.zkpassport.id/getting-started/policies) and confirm how to get `oprfKeyId` for salted identifiers.
2. Prototype with [dev mode](https://docs.zkpassport.id/getting-started/dev-mode) (mock proofs) on Sepolia.
3. Implement fixes 1–6 behind the `zkpassport` adapter.
4. Test renewal, dual-document and residence-permit cases with real documents.
5. Update `docs/THREAT_MODEL.md` with the vOPRF, device-attestation and timing assumptions.

## References

- [ZKPassport home: "the verification itself is free"](https://zkpassport.id/)
- [Docs intro](https://docs.zkpassport.id/intro)
- [FAQ](https://docs.zkpassport.id/faq)
- [Basic usage](https://docs.zkpassport.id/getting-started/basic-usage)
- [API reference](https://docs.zkpassport.id/api)
- [Onchain verification](https://docs.zkpassport.id/getting-started/onchain)
- [Personhood example](https://docs.zkpassport.id/examples/personhood)
- [Salted identifiers](https://docs.zkpassport.id/examples/salted-identifiers)
- [Limitations](https://docs.zkpassport.id/limitations)
- [Dashboard & policies](https://docs.zkpassport.id/getting-started/policies)
- [Circuits (GitHub)](https://github.com/zkpassport/circuits) · [npm SDK](https://www.npmjs.com/package/@zkpassport/sdk)
