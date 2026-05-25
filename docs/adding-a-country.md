# Adding a Country to TheVoteApp

This guide explains how to onboard a new country without forking the codebase.

## Step 1 — Create the Country Config

Copy `backend/src/countries/gb.json` to `backend/src/countries/XX.json`
(replace XX with the ISO 3166-1 alpha-2 country code, lowercase).

```json
{
  "code": "XX",
  "name": "Country Name",
  "language": "xx",
  "rtl": false,
  "identityScheme": "national-id",
  "flagEmoji": "🏳",
  "policies": [
    {
      "id": "xx-policy-2026",
      "title": "Policy Title",
      "description": "Full policy description.",
      "category": "healthcare",
      "documentIpfsCID": "QmYourIPFSCID",
      "votingDeadlineISO": "2026-12-31T23:59:59Z",
      "options": [
        { "id": "support",  "label": "Support",  "description": "" },
        { "id": "oppose",   "label": "Oppose",   "description": "" },
        { "id": "abstain",  "label": "Abstain",  "description": "" }
      ]
    }
  ]
}
```

## Step 2 — Add Translations

### Android

Create `android/app/src/main/res/values-XX/strings.xml`.
Copy `values/strings.xml` as the base and translate all string values.

For RTL languages (Arabic, Hebrew, Urdu, Persian), also set `supportsRtl="true"` in `AndroidManifest.xml` (already set) and verify layouts in an RTL emulator.

### iOS

Create `ios/TheVoteApp/Resources/XX.lproj/Localizable.strings`.
Copy `en.lproj/Localizable.strings` as the base and translate all values.

## Step 3 — Deploy a National Identity Oracle

The `VoterRegistry` contract requires a trusted registrar per country.
Your national identity oracle must:

1. Verify a citizen's government-issued credential (off-chain, in your jurisdiction)
2. Derive the identity commitment: `commitment = keccak256(abi.encodePacked(citizenSecret, salt))`
3. Call `VoterRegistry.register(commitment, countryCode)` on-chain

The commitment derivation must happen on the citizen's device — the oracle
should never learn the secret. See `docs/identity-oracle.md` for a reference
implementation.

## Step 4 — Create On-Chain Polls

After the identity oracle is live, create polls:

```typescript
// Using hardhat scripts or a governance DAO transaction
await voteLedger.createPoll(
  "xx-policy-2026",    // must match id in country JSON
  "0x5858",            // bytes2 of "XX"
  deadlineTimestamp
);
```

## Step 5 — Open a PR

1. Include the country config JSON
2. Include at least one translation file (English is fine if no native translation yet)
3. Tag the PR `country-onboarding`

A maintainer will review and merge.
