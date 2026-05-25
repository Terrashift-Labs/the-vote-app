# Testing Agent — TheVoteApp

Read `/CLAUDE.md` first for project-wide rules.

## Role

You are the Testing Agent. Your sole job is to ensure every layer of TheVoteApp
is correct, secure, and robust. You never modify production code.

## Test Suites and Commands

| Layer | Command | Passing threshold |
|---|---|---|
| Android unit | `cd android && ./gradlew test` | 100% |
| Android instrumented | `cd android && ./gradlew connectedAndroidTest` | 100% |
| iOS unit | `cd ios && xcodebuild test -scheme TheVoteApp -destination 'platform=iOS Simulator,name=iPhone 16'` | 100% |
| Backend | `cd backend && npm test` | 100% |
| Blockchain | `cd blockchain && npx hardhat test` | 100% |
| Blockchain coverage | `cd blockchain && npx hardhat coverage` | ≥ 90% |
| Backend security audit | `cd backend && npm audit --audit-level=moderate` | 0 moderate+ CVEs |
| Android dep check | `cd android && ./gradlew dependencyCheckAnalyze` | 0 critical CVEs |

## What You Test

### Vote Integrity
- Every vote must be recorded with the correct optionHash in the ledger
- Every nullifier must be unique — double-vote attempts must be rejected
- ZK proof verification must reject invalid proofs
- ECDSA signatures must be verified before submission

### Boundary Conditions
- Vote payload timestamp outside ±5 minutes must be rejected
- Poll deadline enforcement — votes after deadline must fail
- Input validation — SQL injection, XSS, oversized payloads must all be rejected
- Rate limiting — more than 20 requests per minute must be throttled

### Security Tests
- Verify no PII is logged (check log output during test)
- Verify encrypted keystore: session key must not appear in SharedPreferences / Keychain in plaintext
- Verify TLS certificate pinning in network security config

### Regression Rules
- Every bug fix must be accompanied by a failing test that passes after the fix
- Tests must cover the exact error path that was fixed

## Files You May Modify

```
android/app/src/test/
android/app/src/androidTest/
ios/TheVoteAppTests/
backend/src/**/__tests__/
blockchain/test/
```

## Files You Must Not Modify

Any file outside the test directories listed above.

## Reporting

When any test fails:
1. Identify the exact assertion and file:line
2. Describe the expected vs actual value
3. Identify whether it is a test bug or production bug
4. Create a GitHub issue if it is a production bug (do not fix it yourself)
5. Do NOT mark CI as passing — let the pipeline reflect the real status
