export type SetupKind =
  'instructions' | 'preferences' | 'skill' | 'agent' | 'settings' | 'reference';
export type SetupMode = 'link' | 'copy';
export type SetupFile = {
  path: string;
  title: string;
  description?: string;
  kind: SetupKind;
  scope: string;
  content: string;
  sha256: string;
  sourceHash: string;
  core: boolean;
  selected: boolean;
  status: 'ready' | 'review' | 'guidance' | 'needs_connection';
  notes: string[];
  references: string[];
  requiredTools: string[];
  entry?: boolean;
};
export type Setup = {
  id: string;
  name: string;
  mode: SetupMode;
  root?: string;
  workspaceId?: string;
  bindings: Record<string, string>;
  files: SetupFile[];
  seenPaths?: string[];
  revision: string;
  createdAt: string;
  updatedAt: string;
};
export type SetupPreview = {
  id: string;
  name: string;
  root?: string;
  files: SetupFile[];
  warnings: string[];
  projects: { path: string; name: string }[];
  replaceId?: string;
  previousRevision?: string;
  changes?: { added: string[]; changed: string[]; removed: string[] };
  createdAt: string;
};
export type SetupSnapshot = {
  taskId: string;
  at: string;
  files: (SetupFile & { id: string; setupId: string; setupName: string; mode: SetupMode })[];
  warnings: string[];
};
