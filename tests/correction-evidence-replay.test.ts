import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { replayCorrectionEvidence } from "../evals/correction-evidence-replay.js";

const report = JSON.parse(
  await readFile("docs/evidence/correction-20260921.json", "utf8"),
);
const clone = () => structuredClone(report);

test("recorded-provider replay: retained correction history exposes all three review gaps offline", () => {
  const replay = replayCorrectionEvidence(report);
  assert.equal(replay.mode, "offline-recorded-provider-replay");
  assert.equal(replay.providerCalls, 0);
  assert.equal(replay.workerRuns, 0);
  assert.deepEqual(replay.preservedHistoricalRuns, [
    "v2-original",
    "v2-arithmetic-note",
    "v2-deterministic",
    "v3-deterministic",
    "final-review-only",
  ]);
  assert.deepEqual(
    replay.cases.map((row) => [
      row.id,
      row.deterministicStatus,
      row.recordedProviderStatus,
    ]),
    [
      ["missed-arithmetic-error", "failed", "passed"],
      ["correct-json-falsely-rejected", "passed", "failed"],
      [
        "correct-json-left-unverified",
        "passed-in-recorded-prior-run",
        "unverified",
      ],
    ],
  );
  assert.deepEqual(replay.policy, {
    correctionThreshold: 0.8,
    escalationThreshold: 0.9,
    correctionEffort: "low",
    correctionChangedEffort: false,
  });
  assert.match(
    replay.evidenceScope,
    /not held out.*not current live-provider accuracy/i,
  );
});

test("synthetic mutation: replay rejects a corrected artifact without passing verifier evidence", () => {
  const changed = clone();
  const row = changed.runs
    .find((run: any) => run.name === "v3-deterministic")
    .results.find(
      (candidate: any) => candidate.caseId === "deterministic-arithmetic",
    );
  row.checks.find((candidate: any) => candidate.name === "Tests").status =
    "failed";
  assert.throws(
    () => replayCorrectionEvidence(changed),
    /retain Tests as passed/,
  );
});

test("synthetic mutation: replay rejects effort drift and live or held-out relabeling", () => {
  const effortChanged = clone();
  const row = effortChanged.runs
    .find((run: any) => run.name === "v3-deterministic")
    .results.find(
      (candidate: any) => candidate.caseId === "deterministic-arithmetic",
    );
  row.decisions.find(
    (candidate: any) => candidate.kind === "quality_retry",
  ).data.effort = "medium";
  assert.throws(
    () => replayCorrectionEvidence(effortChanged),
    /unchanged effort/,
  );

  const relabeled = clone();
  relabeled.heldOut = true;
  assert.throws(
    () => replayCorrectionEvidence(relabeled),
    /non-held-out development evidence/,
  );
});
