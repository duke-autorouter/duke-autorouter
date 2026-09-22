# iOS companion build status

Updated: 2026-09-21

Branch: `feature/ios-companion-private-beta`

Integrated base: `main` / DUKE 0.1.8 at
`7ce39f24da8825a4ba88ead90b85ad6c33d87c17`

## Working now

- The public repository was verified and cloned into an isolated workspace.
- The remote architecture and authority boundary are recorded in ADR 0021 and
  implemented behind an opt-in, loopback-only gateway.
- The Mac setup screen creates one-use, expiring pairing codes for explicit
  projects and can revoke paired devices.
- Remote commands are project-scoped and idempotent. Approval decisions reuse
  the existing operation hash and stale-decision guard.
- The native SwiftUI client pairs, reconnects, starts tasks, sends follow-ups,
  decides approvals, stops work and previews saved artifacts with Quick Look.
- Task revisions, recovery-attempt counts, failed checks and incomplete checks
  are visible without adding phone-side model or effort controls.
- Credentials persist in the device-only Keychain. Closing the app does not
  cancel Mac work; foreground polling rebuilds state from the Mac.
- A synthetic fixture exercises the client without provider calls.
- Production pairing now binds the device credential to the authenticated
  Tailscale Serve login by default.

## Verification log

| Check | Result |
| --- | --- |
| Fetch and merge current `main` | Integrated `7ce39f24da8825a4ba88ead90b85ad6c33d87c17` without changing 0.1.8 version or release metadata |
| `xcodebuild -version` | Xcode 26.3, build 17C529 |
| `npm run check` under Node 24.19.0 | Passed |
| `npm test` under Node 24.19.0 | 233 tests passed after building the native document helper; the initial sandbox run was correctly rejected by Chromium Mach-port and Unix-socket restrictions |
| `node --import tsx --test tests/remote.test.ts` | 7 remote-boundary tests passed, including negative credentials/project scope and revision/recovery/incomplete-check reconnects |
| `npm run build` under Node 24.19.0 | Passed, including TypeScript, Vite and document tools |
| `npm run security:secrets` | Passed with Gitleaks 8.30.1; the sandboxed attempt could not resolve the download host, then the preserved command passed outside the sandbox |
| Signed simulator build | Passed for the generic iOS Simulator destination after integration |
| iPhone 17 Pro simulator | Paired with the no-provider synthetic host, decided a hashed approval, stopped work, sent a follow-up that produced revision 1, reopened with the Keychain credential, reconnected to current state and rendered the Markdown artifact in Quick Look |

The first simulator install used unsigned build settings and therefore could not
write the Keychain. Rebuilding with normal simulator signing corrected that test
setup issue. The final build uses normal signing. Cancellation was confirmed in
the host state; the client now also applies the returned task state immediately.

## Open validation and product gates

- No physical iPhone or cellular test has run.
- The official standalone Tailscale 1.102.4 package is installed. Its private
  Serve mapping was verified as tailnet-only with Funnel disabled; an unpaired
  request reached the HTTPS gateway and was rejected with `401`.
- No hosted connection service has been selected or implemented.
- Push notifications, TestFlight and App Store publication are not implemented.
- No live provider request or paid benchmark is part of this build.
- The stable desktop application and its installed configuration were not
  modified.

## Next concrete work

Repeat the pairing, reconnect, approval, cancellation, incomplete-check and
artifact flows on a physical iPhone over Wi-Fi and cellular. Verify physical
Keychain persistence and background/foreground recovery separately. Keep those
results distinct from simulator, synthetic-host and live-provider evidence.
