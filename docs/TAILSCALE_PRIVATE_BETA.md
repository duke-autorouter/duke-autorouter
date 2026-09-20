# Tailscale private-beta runbook

This runbook validates the iOS companion without changing the stable DUKE app,
calling a provider or exposing a service to the public Internet. The Mac and
iPhone must be signed into the same Tailscale network.

## One-time Mac setup

1. Install the official standalone Tailscale package. Approve its system
   extension and VPN configuration in macOS when prompted, then sign in.
2. Confirm the Mac is connected with `tailscale status`.
3. Do not enable Funnel. Serve is the private tailnet-only feature.

The standalone app's bundled CLI can be used directly if `tailscale` is not on
the shell path:

```sh
/Applications/Tailscale.app/Contents/MacOS/Tailscale status
```

## Synthetic physical-device session

From this feature branch, start the no-provider fixture:

```sh
npm run dev:ios-private-beta
```

In a second terminal, privately forward HTTPS to its loopback port:

```sh
tailscale serve --bg 4339
tailscale serve status
tailscale funnel status
```

The Serve status must show an HTTPS `*.ts.net` URL proxying to
`http://127.0.0.1:4339`. Funnel must not show a public endpoint. Enter the Serve
HTTPS URL and the fixture's one-time code in the iPhone app.

If HTTPS certificates are not enabled for the tailnet, Serve opens Tailscale's
consent flow. Enabling HTTPS publishes the tailnet and machine DNS names in the
public certificate-transparency ledger; it does not make the service public.

## Physical iPhone preparation

1. Install Tailscale on the iPhone, sign into the same tailnet and allow its VPN
   configuration.
2. Connect the iPhone to Xcode, choose a development team for the
   `DUKECompanion` target and run the Debug build on that device.
3. Use the HTTPS Serve URL. The Debug-only loopback HTTP exception is not valid
   for a physical phone.

## Acceptance checks

- Pair once; verify replaying the code fails.
- Confirm only the selected synthetic project appears.
- Close and reopen the app; verify the Keychain credential reconnects.
- Review the operation and exact arguments, then approve or deny it.
- Stop active synthetic work and verify the Mac records `cancelled`.
- Open the saved Markdown artifact in Quick Look.
- Repeat reconnect and read checks with Wi-Fi disabled and cellular enabled.
- Revoke the phone from the Mac and verify its next refresh is rejected.

Record Wi-Fi and cellular results separately. A simulator pass is not physical
device evidence, and synthetic execution is not a live provider validation.

## Stop the beta session

Stop the fixture, then remove only this Serve mapping:

```sh
tailscale serve --https=443 off
tailscale serve status
```

Do not use `tailscale funnel` for this companion.
