import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resource } from './runtime.js';
import type { TaskKind } from './types.js';

export const TOOLCHAIN_POLICY = 'duke-tools-v2';
const kinds: TaskKind[] = ['coding', 'research', 'writing', 'documents'];
export const coreSkills = kinds.map((kind) => {
  const content = readFileSync(resource('skills', kind, 'SKILL.md'), 'utf8');
  return {
    id: `duke-core:${kind}`,
    kind,
    path: `skills/${kind}/SKILL.md`,
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
    version: TOOLCHAIN_POLICY,
  };
});
export const coreSkillsHash = createHash('sha256')
  .update(coreSkills.map((s) => s.sha256).join(':'))
  .digest('hex');
export const coreSkill = (kind: TaskKind) => coreSkills.find((s) => s.kind === kind)!;
