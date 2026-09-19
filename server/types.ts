import { z } from 'zod';
import type { WorkType, WorkPreferences, BriefSize } from '../shared/routing.js';
import type { ClaudeConnection } from '../shared/claude-connection.js';

export const Provider = z.enum(['codex', 'claude', 'openrouter']);
export type Provider = z.infer<typeof Provider>;
export type SpendingEntry = {
  id: string;
  taskId: string;
  provider: string;
  day: string;
  month: string;
  reserved: number;
  actual: number | null;
  state: 'reserved' | 'settled' | 'reconciled';
  reference: string;
  at: string;
  reconciliation?: {
    id: string;
    taskId: string;
    provider: string;
    reservedMicros: number;
    actualMicros: number;
    note: string;
    at: string;
    source: string;
  };
};
export const Cap = z.enum(['files', 'shell', 'web', 'browser', 'artifacts']);
export type Cap = z.infer<typeof Cap>;
export type TaskKind = 'coding' | 'research' | 'writing' | 'documents';
export const Difficulty = z.enum(['routine', 'standard', 'complex']);
export type Difficulty = z.infer<typeof Difficulty>;
export type TaskAssessment = {
  kind: TaskKind;
  difficulty: Difficulty;
  source: 'jev' | 'rules';
  confidence?: number;
  score?: number;
  uncertain?: boolean;
  workType?: WorkType;
  workTypeSource?: 'jev' | 'rules';
  briefSize?: BriefSize;
};
export type RoutingDecision = {
  assessment: TaskAssessment;
  modelId?: string;
  confidence?: number;
};
export type Status =
  | 'queued'
  | 'routing'
  | 'running'
  | 'awaiting_approval'
  | 'verifying'
  | 'completed'
  | 'blocked'
  | 'cancelled'
  | 'interrupted';
export const WorkspaceInput = z.object({
  name: z.string().trim().min(1).max(100),
  path: z.string().min(1),
  providers: z.array(Provider).min(1),
});
export type Workspace = z.infer<typeof WorkspaceInput> & {
  id: string;
  instructions: { source: string; content: string; sha256: string }[];
};
export const TaskInput = z.object({
  prompt: z.string().trim().min(1).max(32000),
  workspaceId: z.string(),
  expectedResult: z.string().max(4000).default(''),
  required: z.array(Cap).default(['files']),
  modelOverride: z.string().optional(),
  attachments: z.array(z.string()).max(20).default([]),
  evaluation: z.boolean().default(false),
  verification: z
    .object({
      files: z.array(z.string()).max(20).default([]),
      command: z.string().max(4000).default(''),
    })
    .default({ files: [], command: '' }),
});
export type Task = z.infer<typeof TaskInput> & {
  id: string;
  title: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  attempt: number;
  result?: string;
  error?: string;
  route?: Route;
  checkpoint?: Checkpoint;
  review?: TaskReview;
  usage?: TaskUsage;
  subscriptionUsage?: SubscriptionUsage;
};
export const ModelInput = z.object({
  id: z.string().min(1),
  provider: Provider,
  model: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean().default(false),
  capabilities: z.array(Cap),
  quality: z.object({
    coding: z.number().min(0).max(1),
    research: z.number().min(0).max(1),
    writing: z.number().min(0).max(1),
    documents: z.number().min(0).max(1).optional(),
  }),
  evaluated: z.boolean().default(false),
  evidence: z.string().default(''),
  // Missing legacy profiles qualify for routine work only until reviewed.
  maxDifficulty: Difficulty.optional(),
  routingNotes: z.string().max(2000).optional(),
  catalog: z
    .object({
      description: z.string().max(4000),
      preferred: z.boolean().default(false),
      discoveredAt: z.string(),
    })
    .optional(),
  catalogOverrides: z
    .array(z.enum(['inputPrice', 'outputPrice', 'requestPrice', 'contextLimit']))
    .optional(),
  feedback: z
    .object({ worked: z.number().int().nonnegative(), needsWork: z.number().int().nonnegative() })
    .optional(),
  inputPrice: z.number().finite().nonnegative().optional(),
  outputPrice: z.number().finite().nonnegative().optional(),
  requestPrice: z.number().finite().nonnegative().default(0),
  providerSlug: z.string().optional(),
  contextLimit: z.number().int().positive().default(32000),
  maxOutput: z.number().int().min(256).max(16384).default(4096),
});
export type Model = z.infer<typeof ModelInput> & {
  // Derived from local receipts, never accepted as a client-supplied quality score.
  observations?: OutcomeSummary[];
  efficiency?: EfficiencySummary[];
};
export type Check = {
  name: string;
  status: 'passed' | 'failed' | 'unverified';
  detail: string;
};
export type TaskReview = {
  status: 'passed' | 'failed' | 'unverified';
  summary: string;
  checks: Check[];
  limitations: string[];
  at: string;
  policy: string;
};
export type Outcome = {
  id: string;
  taskId: string;
  modelId: string;
  model: string;
  kind: TaskKind;
  difficulty: Difficulty;
  status: TaskReview['status'];
  at: string;
  policy: string;
  latencyMs: number;
  review: TaskReview;
  evaluation?: boolean;
  workType?: WorkType;
  briefSize?: BriefSize;
  modelKey?: string;
};
export type OutcomeSummary = {
  kind: TaskKind;
  difficulty: Difficulty;
  passed: number;
  failed: number;
  unverified: number;
  lowerBound: number;
  upperBound: number;
  workType?: WorkType;
  briefSize?: BriefSize;
};
export type ReportedUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  reasoningOutputTokens?: number;
  complete: boolean;
};
export type TaskUsage = {
  reportedTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  reasoningOutputTokens: number;
  complete: boolean;
  missingReports: number;
  records: number;
  byRole: { routing: number; worker: number; review: number };
  byProvider?: Partial<Record<Provider | 'jev', number>>;
};
export type AllowanceWindow = {
  limitId: string;
  window: 'primary' | 'secondary';
  durationMins?: number;
  resetsAt?: number;
  beforeUsedPercent?: number;
  afterUsedPercent?: number;
  changePercentagePoints?: number;
  status: 'observed' | 'unknown' | 'reset' | 'decreased' | 'window_changed';
};
export type SubscriptionAttempt = {
  id: string;
  provider: 'codex' | 'claude';
  modelId: string;
  beforeAt?: string;
  afterAt?: string;
  windows: AllowanceWindow[];
};
export type SubscriptionUsage = {
  attempts: SubscriptionAttempt[];
  unobservedAttempts: number;
  attribution: 'account-window-change';
};
export type EfficiencyRun = {
  id: string;
  taskId: string;
  modelId: string;
  model: string;
  assessment: TaskAssessment;
  status: 'passed' | 'failed' | 'unverified' | 'cancelled';
  recovered?: boolean;
  usage: TaskUsage;
  at: string;
  policy: string;
  evaluation: boolean;
  mode: Settings['jevMode'];
  rosterKey: string;
  inputKey: string;
  modelKey?: string;
  executionKey?: string;
};
export type EfficiencySummary = {
  kind: TaskKind;
  difficulty: TaskAssessment['difficulty'];
  workType: WorkType;
  briefSize: BriefSize;
  tasks: number;
  successful: number;
  recoveredSuccessful?: number;
  recoveryUnknown?: number;
  incomplete: number;
  sampledTasks: number;
  sampledSuccessful: number;
  knownReportedTokens: number;
  incompleteReportedTokens: number;
  changedRosterTasks: number;
  evidence: 'early' | 'established' | 'incomplete';
  // Estimate from complete, reviewed tasks only; consult coverage before comparison.
  tokensPerSuccess?: number;
};
export type Route = {
  modelId: string;
  provider: Provider;
  model: string;
  kind: TaskKind;
  reason: string;
  fallbacks: string[];
  assessment: TaskAssessment;
  selectionSource: 'manual' | 'jev' | 'rules';
};
export type RoutePreview = {
  status: 'available' | 'blocked';
  route?: Route;
  modelLabel?: string;
  message: string;
  manualModels: { id: string; label: string; provider: Provider }[];
  jevMayRefine: boolean;
};
export type Checkpoint = {
  summary: string;
  remaining: string;
  repairDifficulty?: Difficulty;
  artifacts: string[];
  session?: { provider: Provider; id: string; model: string };
  at: string;
};
export type Event = { id: number; taskId: string; kind: string; data: any; at: string };
export type Approval = {
  id: string;
  taskId: string;
  operation: string;
  args: unknown;
  hash: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: string;
};
export type Settings = {
  dailyLimit: number;
  monthlyLimit: number;
  timezone: string;
  qualityFloor: number;
  jevMode: 'off' | 'observe' | 'assist';
  jevModel: string;
  jevInputPrice: number;
  jevValidated: boolean;
  maxSteps: number;
  maxRecovery: number;
  workPreferences?: WorkPreferences;
};
export const defaults: Settings = {
  dailyLimit: 5,
  monthlyLimit: 25,
  timezone: 'America/New_York',
  qualityFloor: 0.8,
  jevMode: 'assist',
  jevModel: 'jev-1.13.0',
  jevInputPrice: 0.042,
  jevValidated: false,
  maxSteps: 24,
  maxRecovery: 2,
  workPreferences: {},
};
export type Health = {
  provider: string;
  ready: boolean;
  message: string;
  models?: any[];
  quota?: unknown;
  checkedAt?: string;
  quotaCheckedAt?: string;
  usageError?: string;
  version?: string;
  connection?: ClaudeConnection;
};
export type SubscriptionStatus = Pick<Health, 'quota' | 'quotaCheckedAt' | 'usageError'> & {
  ready?: boolean;
  connection?: ClaudeConnection;
  message?: string;
};
export interface WorkerContext {
  task: Task;
  workspace: Workspace;
  model: Model;
  signal: AbortSignal;
  prompt: string;
  tool: (name: string, args: any) => Promise<any>;
  emit: (kind: string, data: unknown) => void;
  session: (id: string) => void;
}
export interface Worker {
  run(context: WorkerContext): Promise<string>;
  health?(): Promise<Health>;
  subscription?(): Promise<SubscriptionStatus>;
}
export class Blocked extends Error {}
export class Unavailable extends Error {}
export class UncertainEffect extends Blocked {}
export const now = () => new Date().toISOString();
