import {
  CORRECTION_MIN_PROBABILITY,
  RECOVERY_MIN_PROBABILITY,
} from "../server/recovery.js";

type Check = { name: string; status: string };
type Decision = {
  kind: string;
  data?: {
    stage?: string;
    threshold?: number;
    fromEffort?: string;
    effort?: string;
  };
};
type Result = {
  caseId: string;
  status?: string;
  reviewStatus?: string | null;
  realWorkers?: number;
  inputUnchanged?: boolean;
  verifierUnchanged?: boolean;
  artifact?: { path?: string; text?: string };
  checks?: Check[];
  decisions?: Decision[];
};
type Run = {
  name: string;
  sourceCommit?: string;
  receiptSHA256?: string;
  recoveryPolicy?: string | null;
  workerRerun?: boolean | null;
  results: Result[];
};
type Report = {
  developmentOnly: boolean;
  heldOut: boolean;
  actualWorkerRuns: number;
  runs: Run[];
  limits: string[];
  independentAcceptance: {
    deterministicV3: string;
    finalReviewOnly: string;
  };
};

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function parseReport(value: unknown): Report {
  const report = requireObject(value, "Correction evidence");
  if (!Array.isArray(report.runs) || !Array.isArray(report.limits))
    throw new Error("Correction evidence must retain runs and limitations.");
  return report as unknown as Report;
}

function run(report: Report, name: string) {
  const matches = report.runs.filter((candidate) => candidate.name === name);
  if (matches.length !== 1)
    throw new Error(`Expected exactly one recorded run named ${name}.`);
  const selected = matches[0];
  if (!Array.isArray(selected.results))
    throw new Error(`${name} must retain its results.`);
  if (!selected.sourceCommit?.match(/^[0-9a-f]{40}$/))
    throw new Error(`${name} must identify the tested source commit.`);
  if (!selected.receiptSHA256?.match(/^[0-9a-f]{64}$/))
    throw new Error(`${name} must identify its immutable receipt.`);
  return selected;
}

function result(selected: Run, caseId: string) {
  const matches = selected.results.filter(
    (candidate) => candidate.caseId === caseId,
  );
  if (matches.length !== 1)
    throw new Error(
      `Expected exactly one ${caseId} result in ${selected.name}.`,
    );
  return matches[0];
}

function check(row: Result, name: string, status: string) {
  if (
    !row.checks?.some(
      (candidate) => candidate.name === name && candidate.status === status,
    )
  )
    throw new Error(`${row.caseId} must retain ${name} as ${status}.`);
}

function dollarArithmetic(text: string) {
  const match = text.match(
    /Printing:\s*\$(\d+(?:\.\d+)?)\.\s*Signs:\s*\$(\d+(?:\.\d+)?)\.\s*Total:\s*\$(\d+(?:\.\d+)?)\./,
  );
  if (!match) throw new Error("The recorded arithmetic note is not parseable.");
  const [, printingText, signsText, totalText] = match;
  const printing = Number(printingText);
  const signs = Number(signsText);
  const total = Number(totalText);
  return { printing, signs, total, correct: printing + signs === total };
}

function jsonArithmetic(text: string) {
  const value = requireObject(JSON.parse(text), "Recorded repaired JSON");
  for (const field of ["printing", "signs", "total"])
    if (typeof value[field] !== "number")
      throw new Error(`Recorded repaired JSON must contain numeric ${field}.`);
  const printing = value.printing as number;
  const signs = value.signs as number;
  const total = value.total as number;
  return { printing, signs, total, correct: printing + signs === total };
}

function decision(row: Result, kind: string, stage?: string) {
  const matches = (row.decisions ?? []).filter(
    (candidate) =>
      candidate.kind === kind && (!stage || candidate.data?.stage === stage),
  );
  if (matches.length !== 1)
    throw new Error(
      `${row.caseId} must retain one ${stage ?? kind} ${kind} decision.`,
    );
  return matches[0];
}

/**
 * Replays sanitized, already-recorded provider receipts without invoking a provider or worker.
 * This is development regression evidence, not a live accuracy test or held-out benchmark.
 */
export function replayCorrectionEvidence(value: unknown) {
  const report = parseReport(value);
  if (!report.developmentOnly || report.heldOut)
    throw new Error(
      "Correction replay must remain labeled as non-held-out development evidence.",
    );
  if (report.actualWorkerRuns !== 1)
    throw new Error(
      "The retained history must preserve exactly one recorded worker run.",
    );
  if (
    !report.limits.some((limit) =>
      /No final-runtime end-to-end provider rerun/.test(limit),
    )
  )
    throw new Error(
      "The retained evidence must preserve its live-provider limitation.",
    );

  const originalRun = run(report, "v2-original");
  const original = result(originalRun, "original-ownership-probe");
  if (
    original.status !== "blocked" ||
    original.reviewStatus !== "failed" ||
    original.realWorkers !== 0
  )
    throw new Error(
      "The original blocked PDF result must remain in the history.",
    );

  const deterministicV2Run = run(report, "v2-deterministic");
  const deterministicV2 = result(
    deterministicV2Run,
    "deterministic-arithmetic",
  );
  if (deterministicV2.status !== "blocked" || deterministicV2.realWorkers !== 0)
    throw new Error(
      "The original threshold-blocked deterministic result must remain in the history.",
    );
  check(deterministicV2, "Tests", "failed");

  const missedRun = run(report, "v2-arithmetic-note");
  const missed = result(missedRun, "arithmetic-note");
  if (
    missed.status !== "completed" ||
    missed.reviewStatus !== "passed" ||
    missed.realWorkers !== 0 ||
    missed.inputUnchanged !== true ||
    missed.artifact?.path !== "total.md" ||
    typeof missed.artifact.text !== "string"
  )
    throw new Error("The recorded arithmetic false acceptance is incomplete.");
  const missedArithmetic = dollarArithmetic(missed.artifact.text);
  if (missedArithmetic.correct)
    throw new Error(
      "The arithmetic false-acceptance control no longer contains a defect.",
    );

  const repairedRun = run(report, "v3-deterministic");
  if (repairedRun.recoveryPolicy !== "duke-recovery-v3")
    throw new Error("The corrected replay must retain recovery policy v3.");
  const repaired = result(repairedRun, "deterministic-arithmetic");
  if (
    repaired.status !== "blocked" ||
    repaired.reviewStatus !== "failed" ||
    repaired.realWorkers !== 1 ||
    repaired.inputUnchanged !== true ||
    repaired.verifierUnchanged !== true ||
    repaired.artifact?.path !== "total.json" ||
    typeof repaired.artifact.text !== "string"
  )
    throw new Error("The recorded repaired-JSON result is incomplete.");
  const repairedArithmetic = jsonArithmetic(repaired.artifact.text);
  if (!repairedArithmetic.correct)
    throw new Error(
      "The recorded repaired JSON does not satisfy its arithmetic invariant.",
    );
  check(repaired, "Tests", "passed");
  if (
    !repaired.checks?.some(
      (candidate) =>
        candidate.name.startsWith("Jev:") && candidate.status === "failed",
    )
  )
    throw new Error(
      "The repaired JSON must retain the recorded false semantic rejection.",
    );

  const correction = decision(repaired, "recovery_judged", "correction");
  const retry = decision(repaired, "quality_retry", "correction");
  const escalation = decision(repaired, "recovery_judged", "escalation");
  if (correction.data?.threshold !== CORRECTION_MIN_PROBABILITY)
    throw new Error(
      "Recorded correction threshold differs from the current 0.80 policy.",
    );
  if (escalation.data?.threshold !== RECOVERY_MIN_PROBABILITY)
    throw new Error(
      "Recorded escalation threshold differs from the current 0.90 policy.",
    );
  if (retry.data?.fromEffort !== retry.data?.effort)
    throw new Error("Recorded correction must stay at unchanged effort.");

  const followupRun = run(report, "final-review-only");
  if (followupRun.workerRerun !== false)
    throw new Error("The review-only follow-up must not claim a worker rerun.");
  const followup = result(followupRun, "saved-correct-total");
  if (
    followup.status !== "unverified" ||
    followup.checks?.some((candidate) => candidate.status === "failed")
  )
    throw new Error(
      "The saved correct result must remain unverified without failed checks.",
    );
  const negative = result(followupRun, "wrong-total-control");
  if (
    negative.status !== "failed" ||
    !negative.checks?.some((candidate) => candidate.status === "failed")
  )
    throw new Error(
      "The review-only receipt must retain its wrong-total negative control.",
    );
  if (
    !/original verifier passed/i.test(
      report.independentAcceptance?.deterministicV3 ?? "",
    ) ||
    !/correct saved result unverified with no failed checks/i.test(
      report.independentAcceptance?.finalReviewOnly ?? "",
    )
  )
    throw new Error(
      "The independent acceptance record no longer links the saved correct artifact.",
    );

  return {
    schemaVersion: 1,
    mode: "offline-recorded-provider-replay",
    providerCalls: 0,
    workerRuns: 0,
    evidenceScope:
      "Recorded development receipts; not held out and not current live-provider accuracy.",
    preservedHistoricalRuns: report.runs.map((candidate) => candidate.name),
    cases: [
      {
        id: "missed-arithmetic-error",
        recordedRun: missedRun.name,
        deterministicStatus: "failed",
        recordedProviderStatus: missed.reviewStatus,
      },
      {
        id: "correct-json-falsely-rejected",
        recordedRun: repairedRun.name,
        deterministicStatus: "passed",
        recordedProviderStatus: repaired.reviewStatus,
      },
      {
        id: "correct-json-left-unverified",
        recordedRun: followupRun.name,
        deterministicStatus: "passed-in-recorded-prior-run",
        recordedProviderStatus: followup.status,
      },
    ],
    policy: {
      correctionThreshold: CORRECTION_MIN_PROBABILITY,
      escalationThreshold: RECOVERY_MIN_PROBABILITY,
      correctionEffort: retry.data?.effort,
      correctionChangedEffort: false,
    },
    limitations: report.limits,
  } as const;
}
