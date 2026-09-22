# ADR 0021: Add a narrow remote boundary for the iOS companion

Status: implemented on `feature/ios-companion-private-beta`; physical-device
validation remains open

## Problem

The local Mac interface uses a launch token, a SameSite cookie, loopback-only
hosts and strict origin checks. Reusing that session outside the Mac would turn
a local bootstrap secret into a permanent phone credential and expose local
administration routes that a companion does not need.

The iPhone needs to start and continue tasks, stop work, decide live approvals
and read saved deliverables. The Mac must remain authoritative for routing,
workers, provider accounts, project registration and task history.

## Decision

Add a second, opt-in Fastify gateway that listens on loopback separately from
the desktop application. A private HTTPS transport such as Tailscale Serve may
forward to that loopback port. The gateway never exposes account, key, model,
routing-policy, project-import or arbitrary-path administration routes.

The private beta defaults to Tailscale identity enforcement. Pairing records the
authenticated Serve login with the device, without returning or displaying that
login, and later requests must arrive with the same identity. A future private
transport can disable this check only with an explicit environment override.

Pairing starts from the authenticated Mac interface. It creates an expiring,
one-use random challenge for an explicit set of existing projects. A successful
exchange issues one random per-device bearer credential. Only its SHA-256 hash
is persisted. Devices can be listed and revoked locally.

Every mutating phone request carries a client-generated idempotency key. The Mac
persists the request fingerprint and result before acknowledging it. A retry
returns the saved result. A request with the same key and different content is
rejected. If the process stops after beginning a command but before saving its
result, the command remains pending and is not executed again automatically.

Remote approvals reuse the stored approval ID, operation hash and existing
stale-decision check. Artifact reads resolve the artifact through its task and
paired project before applying the existing project containment and content-hash
checks. Cancelling a task stops current work; it does not claim to reverse an
external effect that already occurred.

## Consequences

- Remote access is disabled unless the Mac owner explicitly enables the
  separate gateway and supplies private HTTPS transport.
- Closing or suspending the phone has no effect on Mac execution.
- Reconnect reads persisted state instead of relying on a live stream.
- The first client has no model or effort controls. Jev and the existing
  economical fallback policy remain authoritative.
- Push notifications, a hosted relay, public Internet exposure, TestFlight and
  App Store distribution remain separate decisions.

## Alternatives considered

- Reuse the local cookie API: rejected because its authority and bootstrap
  secret are too broad for a phone credential.
- Bind the desktop API to all interfaces: rejected because it weakens the
  current Host, Origin and loopback controls.
- Build a hosted relay first: deferred because it adds service credentials,
  account lifecycle and a larger trust boundary before the private workflow is
  proven.

## Evidence needed

Automated checks must cover challenge expiry and one-time use, revoked devices,
project isolation, duplicate and conflicting commands, stale approvals, task
history after reconnect and artifact integrity. Simulator evidence remains
separate from physical iPhone and cellular validation.
