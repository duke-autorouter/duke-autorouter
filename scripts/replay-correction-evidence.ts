import { readFile } from "node:fs/promises";
import { replayCorrectionEvidence } from "../evals/correction-evidence-replay.js";

const report = JSON.parse(
  await readFile("docs/evidence/correction-20260921.json", "utf8"),
);
console.log(JSON.stringify(replayCorrectionEvidence(report), null, 2));
