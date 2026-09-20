# iOS companion build status

Updated: 2026-09-20

Branch: `feature/ios-companion-private-beta`

Base: `v0.1.2` at `bcc9ab0ac67d3f18576f8416eef53726c4f4fa77`

## Working now

- The public repository was verified and cloned into an isolated workspace.
- The remote architecture and authority boundary are recorded in ADR 0016 and
  implemented behind an opt-in, loopback-only gateway.
- The Mac setup screen creates one-use, expiring pairing codes for explicit
  projects and can revoke paired devices.
- Remote commands are project-scoped and idempotent. Approval decisions reuse
  the existing operation hash and stale-decision guard.
- The native SwiftUI client pairs, reconnects, starts tasks, sends follow-ups,
  decides approvals, stops work and previews saved artifacts with Quick Look.
- Credentials persist in the device-only Keychain. Closing the app does not
  cancel Mac work; foreground polling rebuilds state from the Mac.
- A synthetic fixture exercises the client without provider calls.
- Production pairing now binds the device credential to the authenticated
  Tailscale Serve login by default.

## Verification log

| Check | Result |
| --- | --- |
| `git ls-remote` for `v0.1.2` and `main` | Both resolved to `bcc9ab0ac67d3f18576f8416eef53726c4f4fa77` |
| `xcodebuild -version` | Xcode 26.3, build 17C529 |
| `npm run check` | Passed |
| `npm test` | 187 tests passed outside the sandbox; the sandboxed attempt could not access Chrome Mach ports or the native runtime Unix socket |
| `node --import tsx --test tests/remote.test.ts` | 5 remote-boundary tests passed |
| `npm run build` | Passed, including TypeScript, Vite and document tools |
| `npm run security:secrets` | Passed with Gitleaks 8.30.1; the sandboxed attempt could not resolve the download host, then the preserved command passed outside the sandbox |
| Signed simulator build | Passed for the generic iOS Simulator destination |
| iPhone 17 Pro simulator | Paired with the synthetic host, listed persisted work, decided a hashed approval, reopened with the Keychain credential, reconnected and previewed a Markdown artifact in Quick Look |

The first simulator install used unsigned build settings and therefore could not
write the Keychain. Rebuilding with normal simulator signing corrected that test
setup issue. The final build uses normal signing. Cancellation was confirmed in
the host state; the client now also applies the returned task state immediately.

## Open validation and product gates

- No physical iPhone or cellular test has run.
- The official standalone Tailscale 1.102.4 package was downloaded for the
  authorized private beta and verified as Apple-notarized and signed by
  Tailscale Inc. Installation still requires macOS administrator approval.
- No hosted connection service has been selected or implemented.
- Push notifications, TestFlight and App Store publication are not implemented.
- No live provider request or paid benchmark is part of this build.
- The private-beta connection choice still needs explicit product selection.
- The stable desktop application and its installed configuration were not
  modified.

## Next concrete work

Choose the private-beta transport. If Tailscale is selected, configure its
private HTTPS forwarding only with explicit authorization, then repeat the
pairing, reconnect, approval, cancellation and artifact checks on a physical
iPhone over Wi-Fi and cellular. Keep those results separate from this simulator
and synthetic evidence.
