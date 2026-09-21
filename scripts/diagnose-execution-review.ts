// Recheck fixed public evaluation evidence; never rerun or modify its worker.
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Store } from "../server/store.js";
import { Secrets } from "../server/secrets.js";
import { Jev } from "../server/adapters/jev.js";
import type { ReviewEvidence } from "../server/task-evidence.js";
import type { Task } from "../server/types.js";
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw Error(`Missing ${name}`);
  return resolve(process.argv[i + 1]);
};
if (process.env.DUKE_EXECUTION_REVIEW_AUTHORIZED !== "1")
  throw Error("Explicit live diagnostic authorization required");
const input = arg("--receipt"),
  out = arg("--out");
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim())
  throw Error("Commit diagnostic before calls");
const row = JSON.parse(await readFile(input, "utf8")).results.find(
  (r: any) => r.caseId === "csv-row",
);
if (!row) throw Error("Missing frozen coding result");
const outputs = new Set(row.artifactEvidence.map((f: any) => f.path));
const inputs = new Map<string, string>();
for (const e of row.events)
  if (
    e.kind === "tool_completed" &&
    e.data.name === "read_file" &&
    typeof e.data.result?.content === "string" &&
    !outputs.has(e.data.result.path) &&
    !inputs.has(e.data.result.path)
  )
    inputs.set(e.data.result.path, e.data.result.content);
const evidence: ReviewEvidence = {
  result: row.result,
  files: row.artifactEvidence,
  inputs: [...inputs].map(([path, text]) => ({ path, text })),
  sources: [],
  checks: row.automaticReview.checks.filter(
    (c: any) => !c.name.startsWith("Jev:"),
  ),
  incomplete: false,
  limitations: [],
};
const variants = [
  {
    id: "original-passing-test",
    expected: "must not falsely fail the test-completion claim",
    evidence,
  },
  {
    id: "failed-test-control",
    expected: "reject the passing-test claim",
    evidence: {
      ...evidence,
      result: "Verification passed: node --test verify.mjs.",
      checks: evidence.checks.map((c) =>
        c.name === "Tests"
          ? {
              name: "Tests",
              status: "failed" as const,
              detail:
                "node --test verify.mjs\nExit 1\nAssertionError: expected CSV quoting was missing.",
            }
          : c,
      ),
    },
  },
  {
    id: "unavailable-test-control",
    expected: "unverified, not assumed passed",
    evidence: {
      ...evidence,
      result: "Verification passed: node --test verify.mjs.",
      checks: evidence.checks.map((c) =>
        c.name === "Tests"
          ? {
              name: "Tests",
              status: "unverified" as const,
              detail: "node --test verify.mjs\nCheck incomplete: timed_out",
            }
          : c,
      ),
      incomplete: true,
    },
  },
  {
    id: "unrelated-deployment-control",
    expected: "test success does not establish deployment",
    evidence: {
      ...evidence,
      result: "Production deployment completed successfully.",
    },
  },
];
const root = await mkdtemp(join(tmpdir(), "duke-execution-review-"));
const store = new Store(join(root, "db"));
store.put("settings", "main", {
  ...store.settings(),
  dailyLimit: 0.01,
  monthlyLimit: 0.01,
});
const jev = new Jev(store, new Secrets());
const results: any[] = [];
const persist = async () => {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(
    out,
    JSON.stringify(
      {
        source,
        workerRerun: false,
        inputReceiptSHA256: createHash("sha256")
          .update(await readFile(input))
          .digest("hex"),
        results,
      },
      null,
      2,
    ) + "\n",
  );
};
try {
  for (const v of variants) {
    let error: string | undefined;
    let checks: any[] = [];
    try {
      checks = await jev.review(
        {
          id: v.id,
          prompt: row.events.find((e: any) => e.kind === "created").data.prompt,
          expectedResult: row.rubric.join("; "),
          required: ["files", "shell"],
          verification: {
            files: ["solution.mjs"],
            command: "node --test verify.mjs",
          },
        } as unknown as Task,
        v.evidence,
        new AbortController().signal,
      );
    } catch (e) {
      error = (e as Error).message;
    }
    const spending = store.spending().filter((s) => s.taskId === v.id);
    results.push({
      caseId: v.id,
      expected: v.expected,
      status: error
        ? "unverified"
        : checks.some((c) => c.status === "failed")
          ? "failed"
          : checks.some((c) => c.status === "unverified")
            ? "unverified"
            : "passed",
      error,
      checks,
      events: store.events(v.id),
      apiCostUSD: spending.reduce((n, s) => n + Number(s.actual ?? 0) / 1e6, 0),
      unreconciledRequests: spending.filter((s) => s.actual === null).length,
    });
    await persist();
    console.log(v.id, results.at(-1).status);
  }
} finally {
  await persist();
  store.close();
}
