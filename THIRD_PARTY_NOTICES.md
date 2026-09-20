# Third-party notices

The DUKE Autorouter application source is licensed under Apache-2.0. This does not
change the licenses or service terms of its dependencies or the models it calls.

- OpenAI Codex and generated app-server protocol types: Apache-2.0. Pinned to
  `@openai/codex` 0.155.0; source: https://github.com/openai/codex.
- Anthropic sandbox runtime: Apache-2.0, version 0.0.76.
- Claude Agent SDK 0.3.275 and its runtime: Anthropic's license and commercial or
  applicable subscription terms. See the dependency's `LICENSE.md` and `README.md`.
  These are not relicensed by this application. Users obtain them through npm;
  proprietary runtime binaries must not be included in the source release.
- React, Vite, Fastify, Zod, TypeScript, tsx, docx, ExcelJS, pdf-lib, and related
  packages retain their included open-source licenses.
- Playwright: Apache-2.0. Chromium and its components retain their own notices.
- xlsx-calc 0.9.2 and Formula.js 4.6.1: MIT. These provide bounded calculation
  for supported spreadsheet formulas; they are not native Microsoft Excel.
  Sources: https://github.com/fabiooshiro/xlsx-calc and https://github.com/formulajs/formulajs.
- DM Sans and Manrope fonts: SIL Open Font License; local font packages contain
  the applicable license text. No external font requests are needed.

`package-lock.json` records exact dependency versions. Installed packages include
their full license files. The ExcelJS UUID dependency is overridden to 11.1.1 to
address the older UUID buffer-bounds advisory; XLSX write/read checks cover the
installed override.
