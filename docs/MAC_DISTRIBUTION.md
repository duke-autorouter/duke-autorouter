# Mac downloads

The normal installation is a prebuilt, Developer ID-signed and Apple-notarized
app from GitHub Releases. Open the DMG, drag DUKE into Applications and launch it.
Users do not need Node, Xcode or a terminal. The first target is Apple Silicon
macOS 14 or newer.

The [0.1.12 release](https://github.com/duke-autorouter/duke-autorouter/releases/tag/v0.1.12)
includes a DMG, ZIP, checksums and release manifest. The
[distribution receipt](evidence/distribution-0.1.12-verification.json) identifies the
files that passed notarization, stapling, signature and Gatekeeper checks.

## Maintainer preparation

Build and check the package before signing. Use a private, unsynced output folder.
No provider profiles, local task data or API keys belong in the bundle.

```sh
npm ci
npx playwright install chromium
npm run package:mac
npm run test:standalone
```

Set `DUKE_SIGNING_IDENTITY` to an existing **Developer ID Application** identity.
Set `DUKE_NOTARY_PROFILE` to an existing notarytool Keychain profile. Alternatively,
provide `DUKE_NOTARY_KEY` as the path to an App Store Connect team API key, plus
`DUKE_NOTARY_KEY_ID` and `DUKE_NOTARY_ISSUER`. Never commit a private key, print its
contents, or put it in a release asset. These are maintainer settings, not app
onboarding fields.

```sh
npm run distribution:sign
npm run test:standalone
npm run distribution:submit
npm run distribution:status
```

Signing covers DUKE's nested executables and bundles before the outer app.
Claude retains Anthropic's original signature; the signer compares it with the
pinned dependency and rejects altered bytes. Runtime entitlements support the
other bundled JavaScript engines. The signed ZIP is hashed
and retained as the immutable Apple submission. Submission returns promptly;
check status later without rebuilding or resubmitting the same archive.

After Apple reports **Accepted**:

```sh
npm run distribution:finalize
```

The finalizer extracts that exact submitted archive, staples and validates the
ticket, checks the signature and Gatekeeper, builds the DMG and ZIP, mounts the
DMG to verify its app, preserved Claude runtime and Applications shortcut, then
writes checksums and a release manifest. It refuses an unaccepted or modified submission. None of these
commands changes repository visibility or publishes a GitHub release.

Check the actual download through the normal macOS installation path. A second
physical Mac remains a separate early-tester check; disclose whether it was done.
Publish the DMG, ZIP, `SHA256SUMS.txt`, manifest and scoped release notes together.
Keep signing/notarization evidence separate from functional acceptance; neither
one substitutes for the other.

Apple documents [Developer ID distribution](https://developer.apple.com/developer-id/)
and [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
