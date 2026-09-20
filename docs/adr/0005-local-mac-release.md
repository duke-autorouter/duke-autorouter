# ADR 0005: Ship a downloadable standalone Mac app and inspectable source

Status: notarized candidate prepared; final native launch and publication pending.
Recorded during the September 2026 release pass.

## Context

The first release needs to work from Applications without Codex or a terminal.
It is also a portfolio project that others should be able to inspect and build.

## Decision

Use a native Mac window around a loopback service with bundled Node, provider
runtimes and Chromium. Keep configuration and task history outside the app
bundle, and use Keychain for entered API keys. Target Apple Silicon macOS 14+
for the first release. Publish an allowlisted source tree with reproducible
inputs, tests, architecture, decision records and scoped verification evidence.

The primary installation path is a prebuilt download from GitHub Releases, with
the app and an Applications shortcut in a disk image. Users do not need Node,
Xcode, npm or a terminal. Building from source is documented for contributors.
Keep versioned downloads, SHA-256 checksums and release-specific limitations
together. Prepare artifacts privately before publication.

## Alternatives

A browser-only development server is easier to build but misses the standalone
requirement. A hosted service would add account, storage and operational concerns
unnecessary for the initial local use case. Supporting every desktop platform
before validation would widen the release beyond the available evidence.

## Consequences

Native and packaged checks are required; a successful source test is insufficient.
The source build and an end-user download have different distribution requirements.
Signing and notarization determine the normal macOS opening experience. An
unsigned preview must be labeled clearly; it cannot be described as notarized.
A clean-machine installation and account-flow check remains separate from tests
on the development Mac. Dependency licenses are listed in the third-party notices.
Preserve already signed provider binaries when packaging;
verify Claude against the pinned upstream bytes before and after signing DUKE.

Portfolio evidence must distinguish local tests, synthetic workers, live account
checks and comparative benchmarks. A functioning route does not establish measured
savings or daily-use reliability.
