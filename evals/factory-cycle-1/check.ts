import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { cases } from "./fixtures.js";

export const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const read = (path: string) => readFile(path).catch(() => null);
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// Read-only evidence. This never executes worker code or claims semantic acceptance.
export async function check(caseId: string, dir: string) {
  const item = cases.find((entry) => entry.id === caseId);
  if (!item) throw new Error(`Unknown case: ${caseId}`);
  const fixtureHashes = Object.fromEntries(await Promise.all(Object.entries(item.files).map(async ([name, original]) => {
    const actual = await read(join(dir, name));
    return [name, { expected: sha(original), actual: actual ? sha(actual) : null }];
  }))) as Record<string, { expected: string; actual: string | null }>;
  const fixturesUnchanged = Object.values(fixtureHashes).every(({ expected, actual }) => expected === actual);
  const outputs = Object.fromEntries(await Promise.all(item.expectedFiles.map(async (name) => {
    const bytes = await read(join(dir, name));
    return [name, { present: bytes !== null, bytes: bytes?.length ?? 0, sha256: bytes ? sha(bytes) : null }];
  }))) as Record<string, { present: boolean; bytes: number; sha256: string | null }>;
  const text = async (name: string) => (await read(join(dir, name)))?.toString("utf8") ?? "";
  const structuralChecks: Record<string, boolean> = {};
  if (item.kind === "coding") {
    structuralChecks.solutionNonempty = outputs["solution.mjs"].bytes > 0;
  } else if (item.kind === "writing") {
    const draft = await text("draft.md");
    structuralChecks.wordRange = words(draft) >= 100 && words(draft) <= 150;
    structuralChecks.subject = /^subject:/im.test(draft);
    structuralChecks.greeting = /^(dear|hi|hello)\b/im.test(draft);
    structuralChecks.quotedLabel = draft.includes("“Step-free entrance”");
    structuralChecks.dates = /september 29/i.test(draft) && /september 27/i.test(draft);
  } else if (item.kind === "research") {
    const findings = await text("findings.md");
    structuralChecks.wordRange = words(findings) >= 300 && words(findings) <= 450;
    structuralChecks.citesSources = [1, 2, 3, 4, 5, 6].every((n) => findings.includes(`[${n}]`));
  } else {
    const docx = await read(join(dir, "handoff.docx"));
    const review = await text("handoff.md");
    structuralChecks.docxZipSignature = !!docx && docx.length > 100 && docx.subarray(0, 4).toString("hex") === "504b0304";
    structuralChecks.reviewSections = ["Alder Library kiosk trial", "Current status", "Before trial", "Open decisions", "Prepared from the September 23 fictional brief."].every((part) => review.includes(part));
  }
  return {
    fixtureHashes, fixturesUnchanged, outputs, structuralChecks,
    command: item.command, rubric: item.rubric,
    semanticAcceptance: { accepted: null, notes: "Pending human review; structural checks are diagnostic only." },
  };
}
