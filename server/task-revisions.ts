import { createHash } from 'node:crypto';
import type { Task } from './types.js';

export type Requirement = {
  id: string;
  kind: 'result' | 'file' | 'command';
  value: string;
};
export function requirements(task: Task): Requirement[] {
  return [
    ...(task.expectedResult
      ? [{ id: 'result', kind: 'result' as const, value: task.expectedResult }]
      : []),
    ...task.verification.files.map((value, i) => ({
      id: `file_${i}`,
      kind: 'file' as const,
      value,
    })),
    ...(task.verification.command
      ? [
          {
            id: 'command',
            kind: 'command' as const,
            value: task.verification.command,
          },
        ]
      : []),
  ];
}

// Put the latest request first so a long conversation cannot hide it from the
// bounded judge context. Full earlier requests remain in the conversation log.
export function taskBrief(task: Task) {
  if (!task.continuation) return task.prompt;
  return `Current user follow-up (takes precedence where it explicitly changes earlier requirements):\n${task.continuation.text}\n\nEarlier task context:\n${task.prompt.slice(0, task.continuation.previousLength)}`;
}
export function taskInputKey(task: Task) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        prompt: task.prompt,
        expectedResult: task.expectedResult,
        attachments: task.attachments,
        verification: task.verification,
        required: task.required,
        workspaceId: task.workspaceId,
        revision: task.revision ?? 0,
      }),
    )
    .digest('hex');
}

export function currentEvents<T extends { kind: string; data: any }>(events: T[]) {
  const start = events.findLastIndex((e) => e.kind === 'resumed' && e.data.followup?.trim());
  return events.slice(start + 1);
}
