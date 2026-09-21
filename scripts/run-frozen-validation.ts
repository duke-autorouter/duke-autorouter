import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  chmod,
  rm,
  readdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createApp } from "../server/app.js";
import { CodexWorker } from "../server/adapters/codex.js";
import { recordCatalog } from "../server/model-profiles.js";
import { assessLocally } from "../server/router.js";
import { summarizeSpending } from "../server/spending.js";
import { inspectFile } from "../server/task-evidence.js";
import { ROUTING_POLICY, REVIEW_POLICY } from "../server/outcomes.js";
import { EFFICIENCY_POLICY } from "../server/efficiency.js";
import { TOOLCHAIN_POLICY, coreSkillsHash } from "../server/core-skills.js";
import {
  frozenReviews,
  naturalCases,
  releaseUnderTest,
} from "../evals/frozen-016.js";
import type { Model, Task, Workspace } from "../server/types.js";
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing ${name}`);
  return process.argv[i + 1];
};
const mode = arg("--mode"),
  out = resolve(arg("--out")),
  stateDir = resolve(arg("--state-dir"));
if (!["probe", "review", "jev", "strong-medium"].includes(mode))
  throw new Error("Unknown mode");
if (process.env.DUKE_FROZEN_VALIDATION_AUTHORIZED !== "1")
  throw new Error("Live authorization required");
const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const git = (...a: string[]) =>
  execFileSync("git", a, { encoding: "utf8" }).trim();
if (
  git(
    "diff",
    releaseUnderTest,
    "--",
    "server",
    "shared",
    "skills",
    "package.json",
    "package-lock.json",
  )
)
  throw new Error("Released runtime changed");
if (git("status", "--porcelain"))
  throw new Error("Commit the frozen protocol and fixtures before calls");
if ((await readdir(stateDir).catch(() => [])).length)
  throw new Error("State must be empty");
await mkdir(out, { recursive: true });
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const { app, store, engine, approvals } = await createApp({
  stateDir,
  serveUI: false,
});
const results: any[] = [];
const denied: any[] = [];
let copiedAuth: string | undefined;
let profileHash = "review-only";
const startedAt = new Date().toISOString();
const receipt = () => ({
  schemaVersion: 1,
  startedAt,
  mode,
  split: "frozen-post-release",
  releaseUnderTest,
  source: { testedCommit: git("rev-parse", "HEAD"), dirty: false },
  runtimeTreeHash: hash(
    git("ls-tree", "-r", "HEAD", "server", "shared", "skills"),
  ),
  profileHash,
  policyHash: hash(
    JSON.stringify({ ROUTING_POLICY, REVIEW_POLICY, EFFICIENCY_POLICY }),
  ),
  routingPolicy: ROUTING_POLICY,
  reviewPolicy: REVIEW_POLICY,
  toolchainHash: hash(TOOLCHAIN_POLICY),
  coreSkillsHash,
  caseSetHash: hash(
    JSON.stringify(
      mode === "review"
        ? frozenReviews
        : mode === "probe"
          ? "historical-PDF-probe"
          : naturalCases,
    ),
  ),
  controlledFailureProbe: mode === "probe",
  settings: store.settings(),
  headlessApprovalDecisions: denied,
  results,
});
const persist = () =>
  writeFile(
    join(out, "results.json"),
    JSON.stringify(receipt(), null, 2) + "\n",
  );
store.put("settings", "main", {
  ...store.settings(),
  dailyLimit: 0.03,
  monthlyLimit: 0.03,
  maxRecovery: 2,
  recoveryEffortCeiling: "medium",
  jevMode: "assist",
  jevFallbackModel: "codex:gpt-5.6-luna",
  jevInputPrice: 0.042,
  jevValidated: true,
  workPreferences: {},
});
const monitor = setInterval(() => {
  for (const p of store.approvals().filter((p) => p.status === "pending")) {
    denied.push({ taskId: p.taskId, operation: p.operation, allowed: false });
    try {
      approvals.decide(p.id, p.hash, false);
    } catch {}
  }
}, 100);
await persist();
try {
  if (mode === "review") {
    for (const c of frozenReviews) {
      let checks: any[] = [];
      let error: string | undefined;
      try {
        checks = await engine.jev.review(
          {
            id: c.id,
            prompt: "Create a factual note from brief.md.",
            expectedResult: c.requirement,
            required: ["files"],
            verification: { files: ["note.md"], command: "" },
          } as unknown as Task,
          {
            result: "Saved note.md.",
            files: [
              {
                path: "note.md",
                text: c.output,
                bytes: Buffer.byteLength(c.output),
                sha256: hash(c.output),
                format: ".md",
                incomplete: false,
                detail: "Frozen new fixture",
              },
            ],
            inputs: [{ path: "brief.md", text: c.brief }],
            sources: [],
            checks: [],
            limitations: [],
            incomplete: c.id === "ambiguity-missing-source",
          },
          AbortSignal.timeout(75000),
        );
      } catch (e) {
        error = (e as Error).message;
      }
      results.push({
        caseId: c.id,
        expected: c.expected,
        stratum: c.id.startsWith("ambiguity-")
          ? "missing-context"
          : "complete-context",
        status: error
          ? "unverified"
          : checks.some((c) => c.status === "failed")
            ? "failed"
            : checks.some((c) => c.status === "unverified")
              ? "unverified"
              : "passed",
        error,
        checks,
        events: store.events(c.id),
        ...summarizeSpending(store.spending().filter((s) => s.taskId === c.id)),
      });
      await persist();
      console.log(`${c.id}: ${results.at(-1).status}`);
    }
  } else {
    const authSource = resolve(arg("--auth-source"));
    await mkdir(join(stateDir, "codex"), { recursive: true, mode: 0o700 });
    copiedAuth = join(stateDir, "codex", "auth.json");
    await copyFile(join(authSource, "codex", "auth.json"), copiedAuth);
    await chmod(copiedAuth, 0o600);
    const health = await new CodexWorker(stateDir).health();
    if (!health.ready || !health.models?.length)
      throw new Error("Codex subscription not ready");
    store.put("health", "codex", {
      ...health,
      checkedAt: new Date().toISOString(),
      quotaCheckedAt: new Date().toISOString(),
    });
    const discovered = recordCatalog(store, "codex", health.models),
      wanted = ["codex:gpt-6-astra", "codex:gpt-5.6-sol", "codex:gpt-5.6-luna"];
    if (wanted.some((id) => !discovered.some((m) => m.id === id)))
      throw new Error("Frozen roster unavailable");
    for (const m of store.list<Model>("model"))
      store.put("model", m.id, { ...m, enabled: wanted.includes(m.id) });
    store.put("roster", "main", {
      version: 1,
      needsReview: false,
      savedAt: new Date().toISOString(),
    });
    profileHash = hash(
      JSON.stringify({
        models: store
          .list<Model>("model")
          .filter((m) => m.enabled)
          .map((m) => ({
            ...m,
            catalog: m.catalog
              ? { ...m.catalog, discoveredAt: undefined }
              : undefined,
          })),
        preferences: store.settings().workPreferences,
        maxRecovery: 2,
        recoveryEffortCeiling: "medium",
      }),
    );
    if (mode === "probe") {
      let injected = false;
      const real = engine.workers.codex;
      const decide = engine.jev.decide.bind(engine.jev);
      engine.jev.decide = async (task, models, signal, context) =>
        !injected
          ? {
              assessment: assessLocally(task),
              modelId: "codex:gpt-5.6-luna",
              effort: "low",
              confidence: 1,
            }
          : decide(task, models, signal, context);
      engine.workers.codex = {
        health: real.health?.bind(real),
        run: async (ctx) => {
          if (injected) return real.run(ctx);
          injected = true;
          await ctx.tool("read_file", { path: "brief.md" });
          await copyFile(
            "evals/fixtures/ownership-probe/checklist.pdf",
            join(out, "ownership-probe", "checklist.pdf"),
          );
          ctx.emit("controlled_failure_injected", {
            reason:
              "Historical flawed PDF copied verbatim; initial route fixed to Luna Low; no initial worker inference.",
          });
          ctx.emit("subscription_usage", {
            total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          });
          return "Saved checklist.pdf.";
        },
      };
    }
    const cases =
      mode === "probe"
        ? [
            {
              id: "ownership-probe",
              kind: "documents",
              prompt:
                "Read brief.md. Create a one-page launch checklist with explicit unresolved items. Save an actual checklist.pdf file. Preserve the supplied facts and label any invented examples.",
              files: {
                "brief.md": await readFile(
                  "evals/fixtures/ownership-probe/brief.md",
                  "utf8",
                ),
              },
              required: ["files", "artifacts"],
              expectedFiles: ["checklist.pdf"],
              command: "",
              rubric: [],
            },
          ]
        : naturalCases;
    for (const c of cases) {
      const path = join(out, c.id);
      await mkdir(path);
      for (const [name, content] of Object.entries(c.files))
        await writeFile(join(path, name), content);
      const workspace = {
        id: randomUUID(),
        name: `Frozen ${c.id}`,
        path,
        providers: ["codex"],
        instructions: [],
      } as Workspace;
      store.put("workspace", workspace.id, workspace);
      const start = Date.now();
      const task = await engine.create({
        workspaceId: workspace.id,
        prompt: c.prompt,
        required: c.required,
        expectedResult: c.rubric.join("; "),
        verification: { files: c.expectedFiles, command: c.command },
        evaluation: true,
        ...(mode === "strong-medium"
          ? { modelOverride: "codex:gpt-6-astra", effortOverride: "medium" }
          : {}),
      });
      let timedOut = false;
      while (
        !["completed", "blocked", "cancelled", "interrupted"].includes(
          store.task(task.id).status,
        )
      ) {
        if (Date.now() - start > 20 * 60 * 1000) {
          engine.cancel(task.id);
          timedOut = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      while (engine.active.has(task.id))
        await new Promise((r) => setTimeout(r, 100));
      const final = store.task(task.id),
        events = store.events(task.id);
      const artifactEvidence: any[] = [];
      for (const name of c.expectedFiles) {
        try {
          artifactEvidence.push(
            await inspectFile(workspace, name, AbortSignal.timeout(30000)),
          );
        } catch (e) {
          artifactEvidence.push({ path: name, error: (e as Error).message });
        }
      }
      const inputIntegrity = await Promise.all(
        Object.entries(c.files)
          .filter(([name]) => !c.expectedFiles.includes(name))
          .map(async ([name, original]) => ({
            path: name,
            unchanged: await readFile(join(path, name), "utf8")
              .then((x) => x === original)
              .catch(() => false),
          })),
      );
      results.push({
        caseId: c.id,
        kind: c.kind,
        mode,
        status: final.status,
        error: final.error,
        timedOut,
        taskId: task.id,
        route: final.route,
        result: final.result,
        latencyMs: Date.now() - start,
        automaticReview: final.review,
        usage: final.usage,
        subscriptionUsage: final.subscriptionUsage,
        work: {
          workerAttempts: events.filter(
            (e) => e.kind === "usage_started" && e.data.role === "worker",
          ).length,
          retries: events.filter((e) => e.kind === "attempt_failed").length,
          stages:
            events.filter((e) => e.kind === "stage_completed").length +
            (final.status === "completed" ? 1 : 0),
        },
        inputIntegrity,
        fixturesUnchanged: inputIntegrity.every((x) => x.unchanged),
        rubric: c.rubric,
        artifactEvidence,
        events,
        ...summarizeSpending(
          store.spending().filter((s) => s.taskId === task.id),
        ),
        review: { accepted: null, notes: "" },
      });
      await persist();
      console.log(
        `${c.id}: ${final.status}; review ${final.review?.status}; attempts ${results.at(-1).work.workerAttempts}`,
      );
    }
  }
} finally {
  clearInterval(monitor);
  await engine.shutdown().catch(() => {});
  await persist();
  await app.close().catch(() => {});
  if (copiedAuth) await rm(copiedAuth, { force: true });
}
