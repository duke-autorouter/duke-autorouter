export const workLabels = {
  ui: 'UI design and implementation',
  writing: 'Writing and drafting',
  repetitive: 'Routine, repetitive work',
  coding: 'General coding',
  debugging: 'Debugging and investigation',
  editing: 'Editing and rewriting',
  research: 'Research and sources',
  documents: 'Documents and spreadsheets',
  general: 'Other work',
} as const;
export type WorkType = keyof typeof workLabels;
export const workTypes = Object.keys(workLabels) as WorkType[];
export type WorkPreferences = Partial<Record<WorkType, string>>;
export type BriefSize = 'short' | 'medium' | 'long';
export const ROSTER_LIMIT = 32;
