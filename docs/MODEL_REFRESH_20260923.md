# September 23 model refresh

0.1.9 updates the bundled Claude Agent SDK to 0.3.280. Its control-only model discovery reports Opus 5.5 (`claude-opus-5-5`) and low, medium, high, xhigh and max effort. Claude provider-resolved model IDs are exposed alongside aliases, with separate unevaluated profiles; refresh preserves existing selections and does not automatically opt new models in.

Codex discovery reports `gpt-6-sol` and `gpt-6-luna` without a Codex dependency change. Sol advertises low through ultra; Luna low through max. These are provider metadata, not measured quality claims.

The installed 0.1.8 Claude runtime reports its Opus alias as Opus 5. An app update is needed for Opus 5.5; changing a label is insufficient. Anthropic documents a minimum Claude Code version of 2.1.280.

This release also packages the already-merged, disabled-by-default iOS gateway foundation and offline correction evidence replay. Physical iPhone testing and iOS distribution remain outstanding. PR13 is not included. No new live model task was run during release preparation. The subsequent [live integration checks](MODEL_VALIDATION_20260923.md) exercised all three models separately.

Validation: 237 tests passed; TypeScript and production build passed; npm dependency audit found zero vulnerabilities. Control-only discovery used the signed-in provider account without submitting a model prompt. Signing and distribution results are recorded separately.

Sources: [OpenAI Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [OpenAI Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Claude model configuration](https://code.claude.com/docs/en/model-config).
