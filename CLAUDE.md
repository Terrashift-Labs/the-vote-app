# TheVoteApp — CLAUDE.md

This file configures Claude Code agents for the TheVoteApp project.
All agents must read this file before beginning any work.

---

## Project Overview

TheVoteApp is a free, open-source, blockchain-secured democratic voting platform for any nation's citizens to vote on domestic policy. It ships as native iOS and Android apps backed by a shared Node.js API and Ethereum-compatible smart contracts.

**Design principles:**
- Privacy-first: votes are cryptographically anonymous, publicly verifiable
- Zero-trust: no central authority can alter votes
- Country-agnostic: configurable per nation (language, policies, identity scheme)
- OSS forever: Apache 2.0 licensed, no telemetry, no SaaS lock-in

---

## Repository Layout

```
/
├── CLAUDE.md                  ← you are here
├── README.md
├── LICENSE
├── .github/
│   ├── CONTRIBUTING.md
│   ├── SECURITY.md
│   ├── CODE_OF_CONDUCT.md
│   └── workflows/             ← CI/CD pipelines
├── android/                   ← Kotlin/Jetpack Compose app
├── ios/                       ← Swift/SwiftUI app
├── backend/                   ← Node.js/TypeScript REST + WebSocket API
├── blockchain/                ← Solidity smart contracts (Hardhat)
├── agents/
│   ├── testing/CLAUDE.md      ← Testing agent instructions
│   ├── ux-ui/CLAUDE.md        ← UX/UI agent instructions
│   └── deployment/CLAUDE.md   ← Deployment agent instructions
└── docs/                      ← Architecture and security documentation
```

---

## Agent Roles

### Testing Agent — `agents/testing/CLAUDE.md`

**Trigger:** Any PR or push to a feature branch, or when explicitly invoked.

**Responsibilities:**
- Run Android unit tests: `cd android && ./gradlew test`
- Run iOS unit tests: `cd ios && xcodebuild test -scheme TheVoteApp -destination 'platform=iOS Simulator,name=iPhone 16'`
- Run backend tests: `cd backend && npm test`
- Run blockchain contract tests: `cd blockchain && npx hardhat test`
- Run security scans: `npm audit`, `./gradlew dependencyCheckAnalyze`
- Validate vote integrity: check all vote hashes against the on-chain ledger
- Report failures with exact file:line references
- Never mark tests as passing if any assertion fails

**Constraints:**
- Do NOT modify application code — only test files under `*/src/test/` or `*/Tests/`
- Do NOT commit unless explicitly asked
- Always run the full test suite before reporting results

---

### UX/UI Agent — `agents/ux-ui/CLAUDE.md`

**Trigger:** Design review requests, Figma handoff, or accessibility audit tasks.

**Responsibilities:**
- Ensure WCAG 2.1 AA compliance across all screens
- Maintain design token consistency (colors, typography, spacing) between iOS and Android
- Review Compose `@Composable` functions and SwiftUI `View` structs for layout correctness
- Validate that all strings are in localization files (`strings.xml`, `Localizable.strings`) — no hardcoded English
- Flag any UI that exposes vote content before submission is confirmed
- Propose accessibility improvements using native platform a11y APIs

**Design system files:**
- `android/app/src/main/res/values/` — colors, strings, dimens
- `ios/TheVoteApp/Resources/` — Assets.xcassets, Localizable.strings
- `docs/design-system.md` — canonical token definitions

**Constraints:**
- Do NOT touch business logic, data layers, or blockchain code
- All UI changes must include a screenshot description in the PR body
- Support RTL layouts for Arabic, Hebrew, Urdu, and Persian locales

---

### Deployment Agent — `agents/deployment/CLAUDE.md`

**Trigger:** Merge to `main` after all CI checks pass, or explicit deploy request.

**Responsibilities:**
- Verify all tests pass before any deployment step
- Deploy smart contracts to testnet first; confirm block finality before mainnet
- Tag the release with semantic version: `git tag vX.Y.Z`
- Build signed Android APK/AAB: `cd android && ./gradlew bundleRelease`
- Build signed iOS IPA: `xcodebuild archive ...` (requires keychain access on macOS runner)
- Deploy backend to production: `cd backend && npm run deploy:prod`
- Post deployment checklist to GitHub Release notes
- Roll back automatically if health checks fail within 5 minutes of deploy

**Constraints:**
- NEVER deploy to mainnet without explicit human confirmation
- NEVER commit secrets or keys — use environment variables and GitHub Secrets
- NEVER force-push to `main` or `release/*` branches
- Always create a GitHub Release with changelog before publishing to app stores

---

## Shared Coding Standards (All Agents)

### Security (Non-Negotiable)
- All vote data encrypted at rest (AES-256) and in transit (TLS 1.3)
- No logging of vote content, user identity, or private keys — ever
- Input validation at every system boundary (API, contracts, UI)
- Dependency updates reviewed weekly; critical CVEs patched within 24 hours
- Zero secrets in source code — use `.env` locally, GitHub Secrets in CI

### Architecture
- Android: MVVM + Clean Architecture (Domain / Data / Presentation)
- iOS: MVVM + Clean Architecture (Domain / Data / Presentation)
- Backend: Layered (Routes → Controllers → Services → Repositories)
- Blockchain: Upgradeable proxy pattern (OpenZeppelin) for contract evolution

### Git Workflow
- Branch naming: `feat/`, `fix/`, `chore/`, `test/`, `docs/`
- PR requires passing CI + 1 human review + security scan green
- Squash-merge to `main`
- Semantic versioning: MAJOR.MINOR.PATCH

### Code Style
- Android: ktlint, detekt
- iOS: SwiftLint
- Backend: ESLint + Prettier (TypeScript strict mode)
- Blockchain: Solhint

---

## Environment Variables

See `backend/.env.example` and `blockchain/.env.example` for required variables.
Never commit `.env` files. Use `direnv` or a secrets manager locally.

---

## Running Locally

```bash
# 1. Start local blockchain node
cd blockchain && npx hardhat node

# 2. Deploy contracts to local node
cd blockchain && npx hardhat run scripts/deploy.ts --network localhost

# 3. Start backend API
cd backend && npm install && npm run dev

# 4. Android — open in Android Studio and run on emulator
# 5. iOS — open ios/TheVoteApp.xcworkspace in Xcode and run on simulator
```

---

## Contribution

See `.github/CONTRIBUTING.md`. All contributors must sign off commits with
`git commit -s` (Developer Certificate of Origin). No CLA required.
