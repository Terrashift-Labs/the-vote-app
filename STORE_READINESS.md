# Store readiness

Snapshot of what's automated vs. what needs manual human action before
`the-vote-app` can actually be submitted to the App Store / Play Store.

## Already in place (no changes needed)

- `.github/workflows/android-ci.yml`, `ios-ci.yml`, `backend-ci.yml` — lint,
  unit tests, type check on every PR/push.
- `.github/workflows/release.yml` — tag-triggered release pipeline that
  builds signed Android AAB (via Fastlane + a base64-encoded keystore secret)
  and uploads to Play Store, builds the iOS IPA (via Fastlane + match) and
  uploads to TestFlight, then deploys the backend.
- `.github/workflows/security-scan.yml` — CodeQL, OpenSSF Scorecard, secret
  scanning, SBOM generation, `npm audit` across all workspaces.
- `.github/workflows/canary.yml` — canary deploy + k6 smoke test + gated
  production promotion with manual approval.
- `fastlane/Appfile`, `fastlane/Fastfile`, `fastlane/metadata/{ios,android}` —
  store listing text (title, short/full description, keywords, subtitle)
  already drafted.
- `e2e/` — Detox end-to-end test harness (`vote-flow.e2e.ts`) wired to both
  platforms' debug builds.

## Changed in this pass

- `backend/src/middleware/requireAdmin.ts` (new) — fail-closed bearer-token
  guard; certification issuance is now an authenticated admin action.
- `backend/src/routes/certification.ts` — `POST /:pollId` now requires
  `requireAdmin` and verifies the supplied `txHash` resolves to a confirmed,
  successful on-chain receipt before issuing a certificate; `GET
  /:pollId/verify` refuses the dev signature-skip fallback when
  `NODE_ENV=production` and no signing key is configured.
- `backend/src/test/routes/certification.test.ts` (new) — covers the 503
  (unconfigured), 401 (bad/missing token), 400 (malformed txHash), and 422
  (unconfirmed tx) paths.
- `backend/.env.example` — documents the new `ADMIN_API_TOKEN` variable.

All 9 backend Jest suites / 48 tests pass; `tsc --noEmit` is clean; `eslint`
reports only pre-existing warnings (no errors) unrelated to this change.

## Still needs manual human input before real submission

1. **Apple Developer Program + Google Play Console enrollment** — the repo
   assumes an existing App Store Connect app record and Play Console app
   record (`fastlane/Appfile` references bundle/package IDs); nothing here
   creates those.
2. **GitHub Actions secrets** referenced by `release.yml` but not present:
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`, `GOOGLE_PLAY_JSON_KEY`, `ASC_API_KEY_JSON`,
   `MATCH_GIT_URL`, `MATCH_PASSWORD`, `APPLE_ID`, `ITC_TEAM_ID`,
   `APPLE_TEAM_ID`, plus backend prod secrets (`DATABASE_URL`, `RPC_URL`,
   `CONTRACT_ADDRESS`, `JWT_SECRET`, `RP_ID`, `ORIGIN`) and the new
   `ADMIN_API_TOKEN`.
3. **Screenshots** for both stores — `fastlane/metadata` has text but no
   screenshot assets; these must be captured from real builds on real/
   simulated devices per store size requirements.
4. **Privacy policy / data-safety disclosure** — this app performs
   ZK-based citizenship verification via ZKPassport (`zk-passport.md`).
   Both app stores require an accurate privacy policy URL and a completed
   data-safety / App Privacy questionnaire. Pay particular attention to:
   - whether `NullifierType.SALTED` (the recommended default per
     `zk-passport.md` §3) is actually what's deployed, since the salted vs.
     unsalted choice changes what you can truthfully claim about
     re-identification risk in the disclosure;
   - that no raw ID/passport data ever leaves the user's device (per the
     ZKPassport design) — this needs to be verified against the actual
     deployed integration, not just the design doc, before it's asserted in
     a privacy policy.
   This is a compliance-sensitive area; have it reviewed by someone with
   legal/privacy authority before publishing either store listing.
5. **Formal review of `requireAdmin`** — the new admin gate uses a single
   shared bearer token (`ADMIN_API_TOKEN`) rather than per-admin credentials
   or an IdP-backed flow. Fine for an initial fail-closed gate; consider
   whether the production threat model needs per-admin audit trails before
   this ships broadly.
6. **Canary/production deploy targets** — `canary.yml` and `release.yml`
   have placeholder deploy steps (`echo "Deploying..."`) that need a real
   deploy mechanism (Fly.io, Railway, k8s, etc.) wired in before the release
   pipeline actually ships anything.
