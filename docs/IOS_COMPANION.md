# DUKE iOS companion

The first companion is a native SwiftUI app in `ios/DUKECompanion.xcodeproj`.
It controls DUKE tasks that continue to run on the Mac. Provider accounts,
Jev routing, tools, project paths and authoritative history stay on the Mac.

## Current slice

The client can:

- pair with one Mac using a one-time code;
- list approved projects and persisted tasks;
- start work without model or effort controls;
- send follow-ups to stopped tasks;
- approve or deny a live hashed operation;
- stop current work; and
- download and inspect saved artifacts with Quick Look; and
- show task revisions, recovery-attempt counts and incomplete verification
  without exposing model or effort controls.

The device credential is stored in the iOS Keychain with
`AfterFirstUnlockThisDeviceOnly`. The server stores only its SHA-256 hash.
Closing the app sends no cancellation request. On launch and while foregrounded,
the app fetches persisted state from the Mac every four seconds.

## Build

```sh
xcodebuild \
  -project ios/DUKECompanion.xcodeproj \
  -scheme DUKECompanion \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/duke-ios-derived \
  build
```

The synthetic UI host makes no provider calls:

```sh
npm run dev:ios-fixture
```

Its printed loopback address is accepted only by a Debug client running in the
iOS Simulator. Release clients require HTTPS.

## Private connection boundary

The production gateway is disabled by default. When deliberately enabled it
still listens only on `127.0.0.1`, using port `4319` unless
`DUKE_REMOTE_PORT` is set. A private HTTPS transport must terminate TLS and
forward to that loopback port.

Tailscale Serve is compatible with this shape and is the current private-beta
recommendation. The gateway requires its authenticated user identity header by
default and binds each new phone credential to that login. A future non-Tailscale
private transport requires the explicit `DUKE_REMOTE_REQUIRE_TAILSCALE=0`
override. No router port, public listener or hosted relay is required.

## Not yet established

- physical iPhone behavior;
- Wi-Fi-to-cellular transitions;
- background refresh and reconnect behavior on a physical device;
- push notifications;
- physical-device Keychain persistence;
- live provider execution from a phone-started task;
- TestFlight or App Store availability.

See [the live build status](IOS_BUILD_STATUS.md) for the current verification
record and next action.
