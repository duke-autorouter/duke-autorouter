import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { cases } from "./fixtures.js";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const read = (path: string) => readFile(path).catch(() => null);

// Offline, read-only evidence. DUKE verification and independent content review remain separate.
export async function check(caseId: string, dir: string) {
  const item = cases.find((entry) => entry.id === caseId);
  if (!item) throw Error(`Unknown case: ${caseId}`);
  const fixtureHashes = Object.fromEntries(await Promise.all(Object.entries(item.files).map(async ([name, original]) => {
    const actual = await read(join(dir, name));
    return [name, { expected: sha(original), actual: actual === null ? null : sha(actual) }];
  }))) as Record<string, { expected: string; actual: string | null }>;
  const fixturesUnchanged = Object.values(fixtureHashes).every(({ expected, actual }) => expected === actual);
  const outputs = Object.fromEntries(await Promise.all(item.expectedFiles.map(async (name) => {
    const bytes = await read(join(dir, name));
    return [name, { present: bytes !== null, bytes: bytes?.length ?? 0, sha256: bytes === null ? null : sha(bytes) }];
  }))) as Record<string, { present: boolean; bytes: number; sha256: string | null }>;
  const structuralChecks: Record<string, boolean> = {};
  if (item.kind === "coding") {
    structuralChecks.solutionNonempty = outputs["solution.mjs"].bytes > 0;
  } else {
    const status = (await read(join(dir, "status.md")))?.toString("utf8") ?? "";
    const words = status.trim().split(/\s+/).filter(Boolean).length;
    structuralChecks.wordRange = words >= 90 && words <= 130;
    structuralChecks.title = /^#\s+Briar Hall signage status\s*$/im.test(status);
    structuralChecks.headings = ["Done", "Pending", "Decision"].every((heading) => new RegExp(`^#{1,6}\\s+${heading}\\s*$`, "im").test(status));
    structuralChecks.namedDates = /Nia/i.test(status) && /September 25/i.test(status) && /Omar/i.test(status) && /September 27/i.test(status);
  }
  return { fixtureHashes, fixturesUnchanged, outputs, structuralChecks, command: item.command, rubric: item.rubric,
    contentAcceptance: { accepted: null, notes: "Pending independent content review; structural checks are diagnostic only." } };
}
