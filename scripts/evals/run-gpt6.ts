import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  rename,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { createApp } from "../../server/app.js";
import { CodexWorker } from "../../server/adapters/codex.js";
import { recordCatalog } from "../../server/model-profiles.js";
import { summarizeSpending } from "../../server/spending.js";
import { cases as originalCases } from "../../evals/gpt6/fixtures.js";
import { cases as factoryCases } from "../../evals/factory-cycle-1/fixtures.js";
import { cases as cycle3Cases } from "../../evals/factory-cycle-3/fixtures.js";
import { check as originalCheck, sha } from "../../evals/gpt6/check.js";
import { check as factoryCheck } from "../../evals/factory-cycle-1/check.js";
import { check as cycle3Check } from "../../evals/factory-cycle-3/check.js";
import type { Model } from "../../server/types.js";
const argv = process.argv.slice(2);
const has = (key: string) => argv.includes(key);
const arg = (key: string) => {
  const at = argv.indexOf(key);
  if (at < 0 || !argv[at + 1]) throw Error(`Missing ${key}`);
  return argv[at + 1];
};
if (!has("--run")) {
  console.log(
    "Offline-only preparation. See evals/gpt6/README.md for gated run syntax.",
  );
  process.exit(0);
}
const measurementRecovery = has("--measurement-recovery");
const wordRecovery = has("--word-count-recovery") || measurementRecovery;
const factory = has("--factory-cycle-1");
const cycle3 = has("--factory-cycle-3");
if (wordRecovery && (factory || cycle3)) throw Error("Select one cohort");
if (factory && cycle3) throw Error("Select one factory cohort");
const wordCases = [{id:"word-count-recovery",kind:"writing",required:["files"] as const,prompt:"Read brief.md and write status.md. Write 90–110 words. Do not modify brief.md.",files:{"brief.md":"Fictional Hazel workshop. The checklist draft is complete. Tess owns the equipment review, due October 2; it is pending. The safety walkthrough has no owner or date. Nothing has been installed. Write a concise internal status update with completed work, pending work and the open installation decision. Do not invent an approval, cost, owner or result."},expectedFiles:["status.md"],command:"",rubric:["90–110 words", "Checklist drafted; Tess equipment review pending October 2", "Walkthrough unassigned and undated; installation undecided", "No invented facts"]}];
const measurementCases = [{id:"measurement-recovery",kind:"writing",required:["files"] as const,prompt:"Read brief.md and write status.md. Write 85–105 words. Do not modify brief.md.",files:{"brief.md":"Fictional Linden repair cafe. The visitor checklist draft is complete. Ada owns the tool inventory, due October 8; it is pending. The volunteer briefing has no owner or date. No cafe session has started. Write a concise internal status update covering completed work, pending work and the open opening decision. Do not invent an approval, price, owner, date or result."},expectedFiles:["status.md"],command:"",rubric:["85–105 words", "Visitor checklist drafted; Ada inventory pending October 8", "Volunteer briefing unassigned and undated; opening undecided", "No invented facts"]}];
const cases = measurementRecovery ? measurementCases : wordRecovery ? wordCases : cycle3 ? cycle3Cases : factory ? factoryCases : originalCases;
const check = wordRecovery ? async () => ({ scope: "Controlled short draft; independent inspection required" }) : cycle3 ? cycle3Check : factory ? factoryCheck : originalCheck;
const mode = arg("--mode");
if ((factory || cycle3) && mode === "probe") throw Error("No injected failures in factory comparison");
if ((factory || cycle3 || wordRecovery) && execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim())
  throw Error("Freeze the factory fixtures and harness in a clean commit before live execution");
if (wordRecovery && mode !== "probe") throw Error("Word recovery requires probe mode");
if (!["jev", "astra-medium", "luna-low", "probe"].includes(mode))
  throw Error("Invalid mode");
const stateDir = resolve(arg("--state-dir")),
  out = resolve(arg("--out")),
  authSource = resolve(arg("--auth-source"));
const jevInputPrice = Number(arg("--jev-input-price"));
if (!Number.isFinite(jevInputPrice) || jevInputPrice < 0)
  throw Error("Provide a verified Jev input price");
if (
  (await readdir(stateDir).catch(() => [])).length ||
  (await readdir(out).catch(() => [])).length
)
  throw Error("State and output must be empty");
await mkdir(join(stateDir, "codex"), { recursive: true, mode: 0o700 });
await mkdir(out, { recursive: true });
const disposableAuth = join(stateDir, "codex", "auth.json");
const receipt: any = {
  schemaVersion: 1,
  mode,
  cohort: measurementRecovery ? "controlled-worker-measurement" : wordRecovery ? "controlled-word-count-recovery" : cycle3 ? "factory-cycle-3-development" : factory ? "factory-cycle-1-development" : mode === "probe" ? "controlled-recovery" : "natural-efficiency",
  startedAt: new Date().toISOString(),
  fixtureHash: sha(JSON.stringify(cases)),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  limits: {
    jevUSD: 0.03,
    taskMs: 480000,
    maxRecovery: 2,
    recoveryEffortCeiling: "medium",
  },
  jevInputPrice,
  approvals: [],
  results: [],
  errors: [],
};
let saving = Promise.resolve();
const save = () => {
  const content = JSON.stringify(receipt, null, 2) + "\n";
  saving = saving.then(async () => {
    await writeFile(join(out, ".results.tmp"), content);
    await rename(join(out, ".results.tmp"), join(out, "results.json"));
  });
  return saving;
};
await save();
let app: Awaited<ReturnType<typeof createApp>>["app"] | undefined;
let monitor: ReturnType<typeof setInterval> | undefined;
try {
  await copyFile(join(authSource, "codex", "auth.json"), disposableAuth);
  await chmod(disposableAuth, 0o600);
  const created = await createApp({ stateDir, serveUI: false });
  app = created.app;
  const { store, engine, approvals, launchToken } = created;
  monitor = setInterval(() => {
    for (const a of store.approvals().filter((x) => x.status === "pending")) {
      receipt.approvals.push({
        taskId: a.taskId,
        operation: a.operation,
        allowed: false,
      });
      try {
        approvals.decide(a.id, a.hash, false);
      } catch {}
      void save();
    }
  }, 100);
  const health = await new CodexWorker(stateDir).health();
  if (!health.ready || !health.models?.length)
    throw Error(`Codex unavailable: ${health.message}`);
  store.put("health", "codex", {
    ...health,
    checkedAt: new Date().toISOString(),
    quotaCheckedAt: new Date().toISOString(),
  });
  const discovered = recordCatalog(store, "codex", health.models);
  const wanted = new Set([
    "codex:gpt-6-luna",
    "codex:gpt-6-sol",
    "codex:gpt-6-astra",
  ]);
  if ([...wanted].some((id) => !discovered.some((m) => m.id === id)))
    throw Error("GPT-6 roster unavailable");
  for (const m of store.list<Model>("model"))
    store.put("model", m.id, { ...m, enabled: wanted.has(m.id) });
  store.put("roster", "main", {
    version: 1,
    needsReview: false,
    savedAt: new Date().toISOString(),
  });
  store.put("settings", "main", {
    ...store.settings(),
    dailyLimit: 0.03,
    monthlyLimit: 0.03,
    jevMode: "assist",
    jevFallbackModel: "codex:gpt-6-luna",
    jevInputPrice,
    jevValidated: true,
    maxRecovery: 2,
    recoveryEffortCeiling: "medium",
    workPreferences: {},
  });
  receipt.settings = store.settings();
  receipt.models = store.list<Model>("model").filter((m) => m.enabled);
  await save();
  if (mode === "probe") {
    const real = engine.workers.codex;
    let injected = false;
    const decide = engine.jev.decide.bind(engine.jev);
    engine.jev.decide = async (task, models, signal, context) =>
      injected
        ? decide(task, models, signal, context)
        : {
            assessment: {
              kind: wordRecovery ? "writing" : "coding",
              difficulty: "routine",
              source: "jev",
            },
            modelId: "codex:gpt-6-luna",
            effort: "low",
            confidence: 1,
          };
    engine.workers.codex = {
      ...real,
      health: real.health?.bind(real),
      run: async (context) => {
        if (injected) return real.run(context);
        injected = true;
        context.emit("controlled_failure_injected", {
          reason: "Wrong first artifact; no first worker inference",
        });
        context.emit("subscription_usage", {
          total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
        await context.tool("write_file", {
          path: wordRecovery ? "status.md" : "solution.mjs",
          content: measurementRecovery ? "The visitor checklist draft is complete. Opening is undecided." : wordRecovery ? "The checklist draft is complete. Tess has an equipment review pending. Installation is undecided." :
            "export function summarize(){return {totals:{},grandTotal:0}}\n",
        });
        return wordRecovery ? "Saved status.md." : "Saved solution.mjs.";
      },
    };
  }
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  const session = await fetch(url + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: launchToken }),
  });
  if (!session.ok) throw Error("Session failed");
  const cookie = session.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join(";");
  const api = async (path: string, body?: unknown) => {
    const response = await fetch(url + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw Error(JSON.stringify(data));
    return data;
  };
  const selectedCases = has("--case") ? cases.filter(c => c.id === arg("--case")) : cases;
  if (!selectedCases.length) throw Error("Unknown case");
  for (const c of mode === "probe" ? selectedCases.slice(0, 1) : selectedCases) {
    const dir = join(out, c.id);
    await mkdir(dir);
    for (const [name, content] of Object.entries(c.files))
      await writeFile(join(dir, name), content);
    const workspace = await api("/workspaces", {
      name: `GPT6 ${c.id}`,
      path: dir,
      providers: ["codex"],
    });
    const result: any = {
      caseId: c.id,
      caseHash: sha(JSON.stringify(c)),
      mode,
      startedAt: new Date().toISOString(),
      status: "preparing",
      attempts: [],
    };
    receipt.results.push(result);
    await save();
    const start = Date.now();
    try {
      const task = await api("/tasks", {
        workspaceId: workspace.id,
        prompt: c.prompt,
        required: c.required,
        expectedResult: c.rubric.join("; "),
        modelOverride:
          mode === "astra-medium"
            ? "codex:gpt-6-astra"
            : mode === "luna-low"
              ? "codex:gpt-6-luna"
              : undefined,
        effortOverride:
          mode === "astra-medium"
            ? "medium"
            : mode === "luna-low"
              ? "low"
              : undefined,
        verification: { files: c.expectedFiles, command: c.command },
        attachments: ["brief.md"],
        evaluation: true,
      });
      result.taskId = task.id;
      await save();
      for (;;) {
        const detail = await api("/tasks/" + task.id);
        const spending = (await api("/spending")).filter(
          (s: any) => s.taskId === task.id,
        );
        Object.assign(result, {
          status: detail.task.status,
          route: detail.task.route,
          usage: detail.task.usage,
          subscriptionUsage: detail.task.subscriptionUsage,
          automaticReview: detail.task.review,
          attempts: detail.events.filter((e: any) =>
            /attempt|usage|stage|route|selection|recovery|controlled_failure/.test(
              e.kind,
            ),
          ),
          events: detail.events,
          spending,
          ...summarizeSpending(spending),
          elapsedMs: Date.now() - start,
        });
        await save();
        if (
          ["completed", "blocked", "cancelled", "interrupted"].includes(
            detail.task.status,
          )
        )
          break;
        if (Date.now() - start > 480000) {
          await api("/tasks/" + task.id + "/cancel", {});
          result.timeout = true;
          await save();
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      while (engine.active.has(task.id))
        await new Promise((r) => setTimeout(r, 100));
      const final = await api("/tasks/" + task.id);
      const finalSpend = (await api("/spending")).filter(
        (s: any) => s.taskId === task.id,
      );
      Object.assign(result, {
        status: final.task.status,
        route: final.task.route,
        usage: final.task.usage,
        subscriptionUsage: final.task.subscriptionUsage,
        automaticReview: final.task.review,
        events: final.events,
        spending: finalSpend,
        ...summarizeSpending(finalSpend),
      });
      result.acceptance = await check(c.id, dir);
      result.finishedAt = new Date().toISOString();
      await save();
    } catch (error) {
      result.error = String(error);
      result.status = "error";
      await save();
      throw error;
    }
  }
} catch (error) {
  receipt.errors.push(String(error));
  await save();
  throw error;
} finally {
  if (monitor) clearInterval(monitor);
  receipt.finishedAt = new Date().toISOString();
  await save();
  await app?.close().catch(() => {});
  await rm(disposableAuth, { force: true }).catch(() => {});
}
