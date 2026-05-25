# Contributing to TheVoteApp

Thank you for helping make democratic participation more accessible and secure.
All contributions are welcome — code, translations, documentation, and bug reports.

## Before You Start

1. Read the [README](../README.md)
2. Read the [Security Policy](SECURITY.md)
3. Read [CLAUDE.md](../CLAUDE.md) if you are using Claude Code

## Ways to Contribute

### Add a Country

1. Create `backend/src/countries/XX.json` (where XX is the ISO 3166-1 alpha-2 code)
2. Add translations:
   - `android/app/src/main/res/values-XX/strings.xml`
   - `ios/TheVoteApp/Resources/XX.lproj/Localizable.strings`
3. Open a PR titled `feat: add XX (Country Name) country config`

### Add a Translation

Strings are intentionally minimal — each screen has fewer than 20 strings.
See `android/app/src/main/res/values/strings.xml` and
`ios/TheVoteApp/Resources/en.lproj/Localizable.strings` for the source strings.

RTL languages (Arabic, Hebrew, Urdu, Persian): please also test that layouts
render correctly in a simulator/emulator.

### Fix a Bug

1. Check if there is an existing issue. If not, open one first.
2. Fork the repository and create a branch: `fix/short-description`
3. Add a failing test that reproduces the bug
4. Fix the bug
5. Confirm the test now passes
6. Open a PR

### Add a Feature

1. Open an issue to discuss the feature before starting work
2. We will label it `accepted` if it aligns with the project's goals
3. Fork → branch (`feat/short-description`) → implement → PR

## Development Setup

See [README Quick Start](../README.md#quick-start).

## Pull Request Guidelines

- Branch from `main`
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/`, `test/`
- PR title follows [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, etc.
- Keep PRs small and focused — one concern per PR
- All CI checks must pass
- At least 1 human review required to merge

## Commit Sign-Off

All commits must be signed off with `git commit -s` (Developer Certificate of Origin).
This confirms that you wrote the code and have the right to submit it under the Apache 2.0 license.

```
git commit -s -m "fix: prevent double-vote on network retry"
```

No CLA is required.

## Code Style

| Platform | Linter | Config |
|---|---|---|
| Android | ktlint + detekt | `android/.editorconfig` |
| iOS | SwiftLint | `ios/.swiftlint.yml` |
| Backend | ESLint + Prettier | `backend/eslint.config.js` |
| Smart contracts | Solhint | `blockchain/.solhint.json` |

## Community Standards

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
We are committed to a welcoming, harassment-free environment for everyone.
