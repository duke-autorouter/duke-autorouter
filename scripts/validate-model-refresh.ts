import {
  mkdir,
  copyFile,
  chmod,
  readFile,
  writeFile,
  readdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createApp } from "../server/app.js";
import { CodexWorker } from "../server/adapters/codex.js";
import { ClaudeWorker } from "../server/adapters/claude.js";
import { recordCatalog } from "../server/model-profiles.js";
import { summarizeSpending } from "../server/spending.js";
import type { Model, Workspace } from "../server/types.js";
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  if (i < 0 || !process.argv[i + 1]) throw Error(`Missing ${n}`);
  return process.argv[i + 1];
};
const out = resolve(arg("--out")),
  stateDir = resolve(arg("--state-dir")),
  authSource = resolve(arg("--auth-source"));
if (process.env.DUKE_MODEL_VALIDATION_AUTHORIZED !== "1")
  throw Error("Live authorization required");
if ((await readdir(stateDir).catch(() => [])).length)
  throw Error("Use empty private state");
await mkdir(out, { recursive: true });
await mkdir(join(stateDir, "codex"), { recursive: true, mode: 0o700 });
await copyFile(
  join(authSource, "codex/auth.json"),
  join(stateDir, "codex/auth.json"),
);
await chmod(join(stateDir, "codex/auth.json"), 0o600);
const codex = new CodexWorker(stateDir),
  claude = new ClaudeWorker(authSource);
const { app, store, engine, approvals } = await createApp({
  stateDir,
  serveUI: false,
  workers: {
    codex,
    claude,
    openrouter: {
      run: async () => {
        throw Error("OpenRouter disabled for this check");
      },
    },
  },
});
const results: any[] = [];
const startedAt = new Date().toISOString();
const save = () =>
  writeFile(
    join(out, "results.json"),
    JSON.stringify(
      {
        startedAt,
        scope:
          "Three explicit-model integration checks; no routing quality or efficiency inference",
        source: "0.1.9",
        results,
        spending: summarizeSpending(store.spending()),
      },
      null,
      2,
    ),
  );
const monitor = setInterval(() => {
  for (const p of store.approvals().filter((p) => p.status === "pending")) {
    try {
      approvals.decide(p.id, p.hash, false);
    } catch {}
  }
}, 200);
try {
  store.put("settings", "main", {
    ...store.settings(),
    dailyLimit: 0.05,
    monthlyLimit: 0.05,
    maxRecovery: 0,
    jevMode: "assist",
    jevValidated: true,
    jevInputPrice: 0.042,
    jevFallbackModel: "codex:gpt-6-luna",
    workPreferences: {},
  });
  const wanted = [
    "codex:gpt-6-luna",
    "codex:gpt-6-sol",
    "claude:claude-opus-5-5",
  ];
  for (const [provider, worker] of [
    ["codex", codex],
    ["claude", claude],
  ] as const) {
    const health = await worker.health();
    if (!health.ready) throw Error(`${provider} not ready: ${health.message}`);
    store.put("health", provider, {
      ...health,
      checkedAt: new Date().toISOString(),
      quotaCheckedAt: new Date().toISOString(),
    });
    recordCatalog(store, provider, health.models ?? []);
  }
  for (const m of store.list<Model>("model"))
    store.put("model", m.id, { ...m, enabled: wanted.includes(m.id) });
  store.put("roster", "main", {
    version: 1,
    needsReview: false,
    savedAt: new Date().toISOString(),
  });
  const inputs = [
    { sku: "pen", quantity: 3, unitCents: 125 },
    { sku: "pad", quantity: 2, unitCents: 450 },
    { sku: "clip", quantity: 0, unitCents: 30 },
  ];
  const checker =
    "const a=require('node:assert/strict'),f=require('node:fs');a.deepEqual(JSON.parse(f.readFileSync('total.json','utf8')),{totalCents:1275,totalQuantity:5});console.log('Inventory totals passed');\n";
  const prompt =
    "Read inventory.json. Calculate totalCents as the sum of quantity * unitCents and totalQuantity as the sum of quantity. Save total.json as JSON with exactly those two integer fields. Do not modify inventory.json or check.cjs. Run node check.cjs to verify your output. All data is fictional and all necessary inputs are supplied. Finish with a short description of the result.";
  for (const modelId of wanted) {
    const path = join(out, modelId.replaceAll(":", "-"));
    await mkdir(path);
    await writeFile(join(path, "inventory.json"), JSON.stringify(inputs));
    await writeFile(join(path, "check.cjs"), checker);
    const workspace: Workspace = {
      id: randomUUID(),
      name: "September model integration check",
      path,
      providers: [modelId.startsWith("claude:") ? "claude" : "codex"],
      instructions: [],
    };
    store.put("workspace", workspace.id, workspace);
    const begin = Date.now();
    const task = await engine.create({
      workspaceId: workspace.id,
      prompt,
      required: ["files", "shell"],
      expectedResult:
        "total.json contains exactly totalCents 1275 and totalQuantity 5. Inputs and verifier remain unchanged.",
      verification: { files: ["total.json"], command: "node check.cjs" },
      attachments: ["inventory.json"],
      modelOverride: modelId,
      effortOverride: "low",
      evaluation: true,
    });
    console.log(`Started ${modelId}: ${task.id}`);
    while (
      !["completed", "blocked", "cancelled", "interrupted"].includes(
        store.task(task.id).status,
      )
    ) {
      if (Date.now() - begin > 8 * 60 * 1000) {
        engine.cancel(task.id);
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    while (engine.active.has(task.id))
      await new Promise((r) => setTimeout(r, 100));
    const final = store.task(task.id);
    let artifact: any;
    try {
      artifact = JSON.parse(await readFile(join(path, "total.json"), "utf8"));
    } catch {}
    const intact =
      (await readFile(join(path, "inventory.json"), "utf8")) ===
        JSON.stringify(inputs) &&
      (await readFile(join(path, "check.cjs"), "utf8")) === checker;
    const accepted =
      intact &&
      JSON.stringify(Object.keys(artifact ?? {}).sort()) ===
        JSON.stringify(["totalCents", "totalQuantity"]) &&
      artifact.totalCents === 1275 &&
      artifact.totalQuantity === 5;
    results.push({
      modelId,
      effort: "low",
      task: final,
      events: store.events(task.id),
      inputAndVerifierUnchanged: intact,
      independentArtifactAccepted: accepted,
      artifact,
      ...summarizeSpending(
        store.spending().filter((s) => s.taskId === task.id),
      ),
    });
    await save();
    console.log(
      `${modelId}: ${final.status}; independent artifact ${accepted ? "passed" : "failed"}`,
    );
  }
} finally {
  clearInterval(monitor);
  await save();
  await app.close();
}
