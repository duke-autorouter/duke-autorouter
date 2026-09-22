# Efficiency pilot status

Updated: 2026-09-20T22:25:22Z

Status: complete for the predeclared four-case development pilot; held-out release evaluation remains untouched.

## Source and scope

- Release base: `v0.1.2` at `bcc9ab0ac67d3f18576f8416eef53726c4f4fa77`.
- Tested harness: clean commit `270d1d0d4e04dcdfac1376894accc33d9dfa2e02`.
- Branch: `validation/efficiency-pilot-20260920`.
- Exactly 12 task runs completed: four matched development cases in strong, rules, and Jev modes.
- Profile hash: `f411dd364509a7c802f037a26e0e3ddc6ec94816cd6a2a0bf48d8302db59a190`.
- Case-set hash: `a557bf48ae3c004a47446cd9be4cf64159f2336c03a7b8cace5ee60ae2db5d64`.
- Corpus hash: `afdcb5c521124b1c919a6cc149b7bafc6a24f150de0145827ead861b44138f50`.

## Gate and ledger status

- Workflow-first receipt is terminal with `providerWorkActive: false`.
- Efficiency strong, rules, and Jev reservations all reconciled with command exit code 0.
- No provider work remains active and no efficiency reservation remains outstanding.
- Combined settled API spend: `$0.003224`.
- Ledger and reconciled workflow-receipt uncertainty: `$0`; every reservation is settled.
- Approved combined cap: `$1`.
- Efficiency share: `$0.001734`, entirely from Jev metered routing/review. Strong and rules made no metered API request.

## Result

- Strong Astra Medium: 4/4 accepted, 0 critical failures, 372,968 tokens, 156.645 seconds, $0 API.
- Rules Luna Low: 3/4 accepted, 1 critical document failure, 373,466 tokens, 167.651 seconds, $0 API.
- Jev automatic: 3/4 accepted, 1 critical writing failure, 536,923 tokens, 152.746 seconds, $0.001734 API.
- Worker attempts: 12 total; retries: 0; unresolved reservations: 0.

Neither economical mode matched the observed strong-baseline quality. Rules did not reduce tokens on this sample. Jev was slightly faster but used about 44% more reported tokens and introduced metered routing/review cost. No efficiency win is accepted.

## Review and limitations

Independent artifact acceptance was performed by Codex Sol at Medium. Coding tests were rerun, official research sources reopened, writing outputs counted and checked against the source brief, and every DOCX page rendered and inspected. Randomized receipt keys supported a partially blinded final pass; prior exposure and same-provider evaluation remain limitations.

The automatic Jev content review expected by the frozen strong-mode plan did not run on the explicit-model diagnostic path. Consequently, the Jev mode's 42,683 routing/review tokens cannot be interpreted as routing-only overhead versus strong.

Subscription quota snapshots showed no within-case percentage-point movement, but these are coarse account-window readings. The between-mode move from 5% to 6% is not task-attributable. No quota-saving claim is made.

## Verification baseline

- `npm run check`: passed.
- Targeted pilot tests: 16 passed.
- Full regression suite after build: 187 passed, 0 failed.
- Corpus validation: 80 cases, 40 development and 40 held-out; no held-out live inference occurred.

The machine summary, independent-review receipt, three mode receipts, shared ledger, and terminal live receipt are retained with the pilot outputs.
