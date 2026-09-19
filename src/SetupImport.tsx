import React, { useEffect, useRef, useState } from 'react';
import type { Setup, SetupFile, SetupMode, SetupPreview } from '../shared/setup';
import type { Workspace } from '../server/types';

const labels = {
  instructions: 'Project instructions',
  preferences: 'Personal preferences',
  skill: 'Skills',
  agent: 'Agent roles',
  settings: 'Compatible settings',
  reference: 'Supporting files',
};
const status = {
  ready: 'Ready',
  review: 'Needs review',
  guidance: 'Role guidance',
  needs_connection: 'Needs connection',
};
type Props = {
  data: any;
  busy: boolean;
  act: (fn: () => Promise<any>) => Promise<any>;
  api: (path: string, body?: unknown, method?: string) => Promise<any>;
};

export function ImportDialog({
  children,
  close,
  label,
}: {
  children: React.ReactNode;
  close: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="modal setup-modal"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            close();
          }
          if (event.key !== 'Tab') return;
          const items = [
            ...(ref.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href]',
            ) ?? []),
          ].filter((e) => e.getClientRects().length > 0);
          const first = items[0],
            last = items.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === ref.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function SetupImport({ data, busy, act, api }: Props) {
  const [open, setOpen] = useState(false),
    [path, setPath] = useState(''),
    [mode, setMode] = useState<SetupMode>('link'),
    [preview, setPreview] = useState<SetupPreview>(),
    [selected, setSelected] = useState<string[]>([]),
    [name, setName] = useState(''),
    [workspaceId, setWorkspace] = useState(''),
    [projects, setProjects] = useState<Record<string, string>>({}),
    [replacing, setReplacing] = useState<Setup>(),
    [error, setError] = useState(''),
    [managed, setManaged] = useState<Setup>(),
    [exportFiles, setExportFiles] = useState<string[]>([]),
    [editing, setEditing] = useState<SetupFile>(),
    [editText, setEditText] = useState(''),
    [remove, setRemove] = useState<Setup>(),
    [filter, setFilter] = useState('');
  const workspaces = data.workspaces as Workspace[];
  const run = (fn: () => Promise<any>) =>
    act(async () => {
      setError('');
      try {
        return await fn();
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    });
  function begin(existing?: Setup) {
    setOpen(true);
    setPreview(undefined);
    setError('');
    setReplacing(existing);
    setFilter('');
    setPath(existing?.root ?? '');
    setMode(existing?.mode ?? 'link');
    setWorkspace(existing?.workspaceId ?? '');
    setProjects(existing?.bindings ?? {});
    setName(existing?.name ?? '');
  }
  function reviewed(p: SetupPreview) {
    setPreview(p);
    setName(replacing?.name ?? p.name);
    setSelected(p.files.filter((f) => f.selected).map((f) => f.path));
    if (!p.root) setMode('copy');
    setProjects(
      Object.fromEntries(
        p.projects.map((project) => [
          project.path,
          replacing?.bindings[project.path] ??
            workspaces.find(
              (w) => w.path === p.root + (project.path === '.' ? '' : '/' + project.path),
            )?.id ??
            '',
        ]),
      ),
    );
  }
  function select(file: SetupFile, checked: boolean) {
    setSelected((current) => {
      if (!checked) return current.filter((p) => p !== file.path);
      const next = new Set(
        current.filter(
          (p) =>
            !(
              file.entry &&
              preview?.files.find((f) => f.path === p)?.entry &&
              preview.files.find((f) => f.path === p)?.scope === file.scope
            ),
        ),
      );
      const queue = [file];
      const visited = new Set<string>();
      for (const f of queue) {
        if (visited.has(f.path)) continue;
        visited.add(f.path);
        next.add(f.path);
        for (const path of f.references) {
          const target = preview?.files.find((f) => f.path === path && f.content && !f.entry);
          if (target) queue.push(target);
        }
      }
      return [...next];
    });
  }
  const missingBindings =
    preview?.files.filter(
      (f) => selected.includes(f.path) && f.scope !== '.' && !projects[f.scope],
    ) ?? [];
  const close = () => {
    setOpen(false);
    setPreview(undefined);
    setReplacing(undefined);
    setError('');
  };
  return (
    <section className="settings-section setup-import">
      <div className="section-heading">
        <div>
          <h2>Your setup</h2>
          <p className="quiet">
            Bring your instructions, voice guide, skills and agent roles with you.
          </p>
        </div>
        <button onClick={() => begin()}>Bring your setup</button>
      </div>
      {!data.setups?.length && (
        <p className="quiet">
          Choose a folder from an existing setup. Review it once, then DUKE uses it when working on
          your tasks.
        </p>
      )}
      {(data.setups ?? []).map((setup: Setup) => (
        <div className="setup-saved" key={setup.id}>
          <div>
            <b>{setup.name}</b>
            <span className="tag">{setup.mode === 'link' ? 'Linked' : 'Copied'}</span>
            <p>
              {setup.files.length} files ·{' '}
              {setup.workspaceId
                ? (workspaces.find((w) => w.id === setup.workspaceId)?.name ??
                  'Project unavailable')
                : 'Across your projects'}
            </p>
            {setup.root && <small>{setup.root}</small>}
          </div>
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const s = await api('/setups/' + setup.id);
                  setManaged(s);
                  setExportFiles(s.files.map((f: SetupFile) => f.path));
                })
              }
            >
              View files
            </button>
            <button disabled={busy} onClick={() => begin(setup)}>
              {setup.root ? 'Review updates / locate folder' : 'Replace from folder'}
            </button>
            <button className="text-button" onClick={() => setRemove(setup)}>
              Remove
            </button>
          </div>
        </div>
      ))}
      {open && (
        <ImportDialog
          label={preview ? 'Review your setup' : 'Bring your setup'}
          close={() => {
            if (!busy) close();
          }}
        >
          <div className="section-heading">
            <h2 id="setup-import-title">{preview ? 'Review your setup' : 'Bring your setup'}</h2>
            <button onClick={close} disabled={busy} aria-label="Close setup importer">
              ✕
            </button>
          </div>
          {error && (
            <div className="notice" role="alert">
              {error}
            </div>
          )}
          {!preview ? (
            <>
              <p>
                Point DUKE at a folder with your existing instructions and preferences. It will find
                the connected files for you to review.
              </p>
              <label>
                Setup folder
                <div className="folder-input">
                  <input
                    aria-label="Setup folder"
                    value={path}
                    placeholder="/Users/you/My setup"
                    onChange={(e) => setPath(e.target.value)}
                  />
                  {data.desktop && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await api('/system/choose-folder', { purpose: 'setup' });
                          if (result.path) setPath(result.path);
                        })
                      }
                    >
                      Choose setup folder…
                    </button>
                  )}
                </div>
              </label>
              <div className="import-modes" role="group" aria-label="How to use your setup">
                <label className={mode === 'link' ? 'chosen' : ''}>
                  <input
                    type="radio"
                    name="setup-mode"
                    checked={mode === 'link'}
                    onChange={() => setMode('link')}
                  />
                  <span>
                    <b>Link to existing files</b>
                    <small>Future tasks use your latest edits in that folder.</small>
                  </span>
                </label>
                <label className={mode === 'copy' ? 'chosen' : ''}>
                  <input
                    type="radio"
                    name="setup-mode"
                    checked={mode === 'copy'}
                    onChange={() => setMode('copy')}
                  />
                  <span>
                    <b>Copy into DUKE</b>
                    <small>Keep an independent copy you can edit here.</small>
                  </span>
                </label>
              </div>
              {replacing && (
                <p className="quiet">
                  The next screen compares this folder with “{replacing.name}”. Your saved setup
                  changes only after you review and apply it.
                </p>
              )}
              <button
                className="primary"
                disabled={busy || !path.trim()}
                onClick={() =>
                  run(async () =>
                    reviewed(await api('/setups/preview', { path, replaceId: replacing?.id })),
                  )
                }
              >
                Review folder
              </button>
              {!replacing && (
                <label className="bundle-input">
                  Or import a DUKE setup bundle
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void run(async () => {
                        if (file.size > 2_000_000)
                          throw new Error('Choose a setup bundle under 2 MB.');
                        reviewed(
                          await api('/setups/bundle-preview', JSON.parse(await file.text())),
                        );
                      });
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </>
          ) : (
            <>
              <p>
                {mode === 'link'
                  ? 'Linked files update for future tasks. Each task keeps the version it started with.'
                  : 'These files will be copied into DUKE. Edits to the originals will not change your copy.'}
              </p>
              <div className="two-columns">
                <label>
                  Setup name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
                </label>
                <label>
                  Apply general preferences to
                  <select value={workspaceId} onChange={(e) => setWorkspace(e.target.value)}>
                    <option value="">All my projects</option>
                    {workspaces.map((w) => (
                      <option value={w.id} key={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {preview.changes && (
                <div className="notice">
                  <b>
                    Review changes before replacing{' '}
                    {replacing?.mode === 'copy' ? 'your copy' : 'this link'}
                  </b>
                  <p>
                    {preview.changes.added.length} new · {preview.changes.changed.length} changed ·{' '}
                    {preview.changes.removed.length} removed
                  </p>
                  <p>
                    New files are not selected automatically. Any edited DUKE copies you select will
                    be replaced by the folder version shown below.
                  </p>
                  {!!preview.changes.removed.length && (
                    <p>Removed from the next setup: {preview.changes.removed.join(', ')}</p>
                  )}
                </div>
              )}
              {!!preview.warnings.length && (
                <details className="setup-notices">
                  <summary>{preview.warnings.length} scan notices</summary>
                  <ul>
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              {!!preview.projects.length && (
                <details className="project-mapping" open={missingBindings.length > 0}>
                  <summary>
                    Project folders{' '}
                    {missingBindings.length > 0 ? '— choose where their rules apply' : '(optional)'}
                  </summary>
                  <p className="quiet">
                    Adding a project lets DUKE work on its files. Linking instructions alone gives
                    read-only context.
                  </p>
                  {preview.projects.map((p) => (
                    <label key={p.path}>
                      {p.path === '.'
                        ? 'Use this source folder as a project'
                        : `Project: ${p.path}`}
                      <select
                        value={projects[p.path] ?? ''}
                        onChange={(e) => setProjects({ ...projects, [p.path]: e.target.value })}
                      >
                        <option value="">
                          {p.path === '.'
                            ? 'Do not add a project'
                            : 'Choose a project for these rules'}
                        </option>
                        {preview.root && <option value="create">Add {p.name} as a project</option>}
                        {workspaces.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {Object.values(projects).includes('create') && (
                    <p className="notice">
                      New projects allow your selected Codex, Claude and OpenRouter models to
                      receive their task context. Review those accounts in Project settings before
                      starting a task. Existing projects keep their current account permissions.
                    </p>
                  )}
                </details>
              )}
              <div className="section-heading">
                <b>
                  {selected.length} of {preview.files.length} files selected
                </b>
                <input
                  aria-label="Find setup files"
                  placeholder="Find a file…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="setup-file-list">
                {(Object.keys(labels) as SetupFile['kind'][]).map((kind) => {
                  const files = preview.files.filter(
                    (f) =>
                      f.kind === kind &&
                      (f.path + ' ' + f.title).toLowerCase().includes(filter.toLowerCase()),
                  );
                  return (
                    !!files.length && (
                      <div className="setup-file-group" key={kind}>
                        <h3>{labels[kind]}</h3>
                        {files.map((file) => (
                          <details className="setup-file" key={file.path}>
                            <summary>
                              <label onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selected.includes(file.path)}
                                  disabled={!file.content}
                                  aria-label={`Include ${file.path}`}
                                  onChange={(e) => select(file, e.target.checked)}
                                />
                                <span>
                                  {file.path}
                                  <small>
                                    {file.scope !== '.'
                                      ? `Project: ${file.scope}`
                                      : file.core
                                        ? 'Operating instructions'
                                        : 'Available when relevant'}
                                  </small>
                                </span>
                              </label>
                              <span className={'tag ' + (file.status === 'ready' ? '' : 'amber')}>
                                {status[file.status]}
                              </span>
                            </summary>
                            {!!file.notes.length && (
                              <ul className="quiet">
                                {file.notes.map((n, i) => (
                                  <li key={i}>{n}</li>
                                ))}
                              </ul>
                            )}
                            {!!file.requiredTools.length && (
                              <p className="quiet">
                                Requested tools: {file.requiredTools.join(', ')}
                              </p>
                            )}
                            {!!file.references.length && (
                              <p className="quiet">References: {file.references.join(', ')}</p>
                            )}
                            {preview.changes?.changed.includes(file.path) && (
                              <p className="notice">
                                This version replaces the currently saved content.
                              </p>
                            )}
                            <pre className="import-preview">
                              {file.content || 'No compatible content to import.'}
                            </pre>
                          </details>
                        ))}
                      </div>
                    )
                  );
                })}
                {!preview.files.length && (
                  <p>
                    No supported files found. Choose a folder containing Markdown instructions,
                    skills or supported preferences.
                  </p>
                )}
              </div>
              {missingBindings.length > 0 && (
                <p className="notice">
                  Some selected rules belong to a specific project. Choose their project above, or
                  deselect those files.
                </p>
              )}
              <div className="setup-footer">
                <small>
                  Used by the model carrying out your work. These setup files are not sent directly
                  to Jev. Task attachments and deliverables have a separate, bounded review.
                </small>
                <div className="button-row">
                  <button onClick={() => setPreview(undefined)} disabled={busy}>
                    Back
                  </button>
                  <button
                    className="primary"
                    disabled={
                      busy || !selected.length || !name.trim() || missingBindings.length > 0
                    }
                    onClick={() =>
                      run(async () => {
                        await api('/setups', {
                          previewId: preview.id,
                          selected,
                          mode,
                          name,
                          workspaceId: workspaceId || undefined,
                          projects,
                        });
                        close();
                      })
                    }
                  >
                    {replacing ? 'Apply reviewed update' : 'Use this setup'}
                  </button>
                </div>
              </div>
            </>
          )}
        </ImportDialog>
      )}
      {managed && (
        <ImportDialog
          label={managed.name}
          close={() => {
            if (!busy) {
              setManaged(undefined);
              setEditing(undefined);
            }
          }}
        >
          <div className="section-heading">
            <h2 id="managed-setup-title">{managed.name}</h2>
            <button
              onClick={() => {
                setManaged(undefined);
                setEditing(undefined);
                setError('');
              }}
              aria-label="Close setup files"
            >
              ✕
            </button>
          </div>
          {error && (
            <div className="notice" role="alert">
              {error}
            </div>
          )}
          <p>
            {managed.mode === 'link'
              ? 'Read from your linked folder. Edit originals there; future tasks will pick up the changes.'
              : 'Your independent DUKE copy. Changes here apply to future tasks.'}
          </p>
          {editing ? (
            <>
              <h3>Edit {editing.path}</h3>
              <textarea
                className="copy-editor"
                aria-label="Copied file content"
                rows={16}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setManaged(
                        await api(
                          '/setups/' + managed.id + '/file',
                          { path: editing.path, content: editText, revision: managed.revision },
                          'PUT',
                        ),
                      );
                      setEditing(undefined);
                    })
                  }
                >
                  Save copy
                </button>
                <button onClick={() => setEditing(undefined)}>Cancel edit</button>
              </div>
            </>
          ) : (
            <>
              <p className="quiet">
                Select the files to include if you export this setup. Accounts, task history and
                local folder paths are not bundled.
              </p>
              <div className="setup-file-list">
                {managed.files.map((f) => (
                  <details className="setup-file" key={f.path}>
                    <summary>
                      <label onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Export ${f.path}`}
                          checked={exportFiles.includes(f.path)}
                          onChange={(e) =>
                            setExportFiles(
                              e.target.checked
                                ? [...exportFiles, f.path]
                                : exportFiles.filter((p) => p !== f.path),
                            )
                          }
                        />
                        <span>{f.path}</span>
                      </label>
                      <span className="tag">{labels[f.kind]}</span>
                    </summary>
                    <pre className="import-preview">{f.content}</pre>
                    {managed.mode === 'copy' && (
                      <button
                        onClick={() => {
                          setEditing(f);
                          setEditText(f.content);
                        }}
                      >
                        Edit copy
                      </button>
                    )}
                  </details>
                ))}
              </div>
              <div className="setup-footer">
                <small>
                  {exportFiles.length} files selected for export. Review their content before
                  sharing.
                </small>
                <button
                  disabled={busy || !exportFiles.length}
                  onClick={() =>
                    run(async () => {
                      const bundle = await api('/setups/' + managed.id + '/export', {
                        selected: exportFiles,
                      });
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
                      );
                      const a = document.createElement('a');
                      a.href = url;
                      a.download =
                        managed.name.replace(/[^a-zA-Z0-9_-]/g, '-') + '.duke-setup.json';
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    })
                  }
                >
                  Export selected files
                </button>
              </div>
            </>
          )}
        </ImportDialog>
      )}
      {remove && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Remove setup">
            <h2>Remove {remove.name}?</h2>
            <p>
              Future tasks will stop using this setup. Original files and the snapshots used by past
              tasks are kept.{' '}
              {remove.mode === 'copy' &&
                'This removes your editable DUKE copy; export it first if you want to keep it.'}
            </p>
            <div className="button-row">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api('/setups/' + remove.id, undefined, 'DELETE');
                    setRemove(undefined);
                  })
                }
              >
                Remove from DUKE
              </button>
              <button onClick={() => setRemove(undefined)}>Keep setup</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
