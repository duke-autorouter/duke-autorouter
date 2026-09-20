export const effortLevels = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;
export type Effort = (typeof effortLevels)[number];
export const effortLabel = (effort?: Effort) =>
  effort
    ? {
        xhigh: 'Very high',
        none: 'None',
        minimal: 'Minimal',
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        max: 'Max',
        ultra: 'Ultra',
      }[effort]
    : 'Provider default';
export function orderedEfforts(values: unknown): Effort[] {
  return Array.isArray(values) ? effortLevels.filter((level) => values.includes(level)) : [];
}
