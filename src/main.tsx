import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Task, Workspace, Model, Approval, Settings, RoutePreview } from '../server/types';
import { brand } from '../shared/brand';
import { Markdown } from './Markdown';
import { displayName } from './displayNames';
import { effortLabel } from '../shared/effort';
import { chooseFolder } from './desktop';
import { ImportDialog, SetupImport } from './SetupImport';
import { ModelRoster } from './ModelRoster';
import { SpendingLedger } from './SpendingLedger';
import { UsageControl, SubscriptionCards, UsageDisplaySelect } from './UsageControl';
import wordmark from './brand/wordmark.svg';
import monogram from './brand/mark.svg';
import type { ClaudeLoginMethod, ClaudeLoginState } from '../shared/claude-connection';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './style.css';

async function api(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch('/api' + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 3,
  }).format(n);
const providers = { codex: 'Codex', claude: 'Claude', openrouter: 'OpenRouter', jev: 'Jev' };
const statusLabel = (s: string) => s.replaceAll('_', ' ');
function WorkingDots() {
  return (
    <span className="working-dots" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}
function Mark() {
  return (
    <div className="mark" aria-hidden="true">
      <img src={monogram} alt="" width="40" height="27" />
    </div>
  );
}
function TaskArrow() {
  return (
    <svg className="task-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 15 15 5M5 5h10v10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function NavigationIcon({ kind }: { kind: 'tasks' | 'connections' | 'usage' }) {
  const paths = {
    tasks: 'M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01',
    connections: 'M9 3v4m6-4v4M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v3a2 2 0 0 1-2 2H8',
    usage: 'M21 12a9 9 0 1 1-9-9v9h9ZM16 3.9a9 9 0 0 1 4.1 4.1H16V3.9Z',
  };
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={paths[kind]}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ArtifactPreview({ artifact, close }: { artifact: { id: string; path: string }; close: () => void }) {
  const rendered = /\.(pdf|docx|xlsx|png|jpe?g)$/i.test(artifact.path);
  const [page, setPage] = useState(1), [sheet, setSheet] = useState('');
  const [result, setResult] = useState<{
    page?: number; pages?: number; sheet?: string; sheets?: string[]; range?: string;
    images: { mimeType: string; data: string }[];
  }>();
  const [loading, setLoading] = useState(rendered), [error, setError] = useState('');
  useEffect(() => {
    if (!rendered) return;
    let active = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ page: String(page), ...(sheet ? { sheet } : {}) });
    void api(`/artifacts/${artifact.id}/preview?${query}`)
      .then((value) => { if (active) setResult(value); })
      .catch((failure: Error) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [artifact.id, rendered, page, sheet]);
  return (
    <div className="modal-backdrop" onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
      <div className="modal preview-modal" role="dialog" aria-modal="true" aria-label={artifact.path}>
        <div className="section-heading">
          <h2>{artifact.path}</h2>
          <button autoFocus onClick={close}>Close</button>
        </div>
        {rendered ? <>
          <div className="preview-controls">
            {result?.pages && <>
              <button disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous page</button>
              <span>Page {page} of {result.pages}</span>
              <button disabled={loading || page >= result.pages} onClick={() => setPage(page + 1)}>Next page</button>
            </>}
            {!!result?.sheets?.length && <label>Sheet <select aria-label="Preview sheet" disabled={loading}
              value={sheet || result.sheet} onChange={(event) => setSheet(event.target.value)}>
              {result.sheets.map((name) => <option key={name}>{name}</option>)}
            </select></label>}
            <a href={'/api/artifacts/' + artifact.id + '?download=1'}>Download file</a>
          </div>
          {loading ? <p role="status">Loading preview…</p> : error ? <p role="alert">{error}</p> :
            <div className="document-preview">
              {result?.images.map((image, index) => <img key={index}
                alt={`${artifact.path}${result.page ? `, page ${result.page}` : ''}${result.sheet ? `, ${result.sheet} ${result.range}` : ''}`}
                src={`data:${image.mimeType};base64,${image.data}`} />)}
            </div>}
          {/\.docx$/i.test(artifact.path) && <p>First-page preview. Download to view the full document.</p>}
          {/\.xlsx$/i.test(artifact.path) && <p>Saved cells{result?.range ? ` · ${result.range}` : ''}. Open in Excel for the full layout.</p>}
        </> : /\.(md|txt|html)$/i.test(artifact.path) ? (
          <iframe title={artifact.path} sandbox="" src={'/api/artifacts/' + artifact.id} />
        ) : <p><a href={'/api/artifacts/' + artifact.id + '?download=1'}>Download file</a> to open it in its application.</p>}
      </div>
    </div>
  );
}
function App() {
  const [data, setData] = useState<any>(),
    [screen, setScreen] = useState('tasks'),
    [selected, setSelected] = useState<string>(),
    [detail, setDetail] = useState<any>(),
    [error, setError] = useState(''),
    [locked, setLocked] = useState(false),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const load = async () => {
    try {
      setData(await api('/state'));
      setLocked(false);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setLocked(true);
    }
  };
  useEffect(() => {
    let events: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const p = new URLSearchParams(location.hash.slice(1)),
        token = p.get('launch');
      if (token) {
        history.replaceState(null, '', location.pathname);
        try {
          await api('/session', { token });
        } catch (e) {
          setError((e as Error).message);
        }
      }
      await load();
      events = new EventSource('/api/events');
      events.onmessage = () => {
        if (!timer)
          timer = setTimeout(() => {
            timer = undefined;
            void load();
          }, 180);
      };
    })();
    return () => {
      events?.close();
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    let current = true;
    if (selected)
      void api('/tasks/' + selected)
        .then((value) => {
          if (current) setDetail(value);
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    else setDetail(undefined);
    return () => {
      current = false;
    };
  }, [selected, refresh]);
  async function act(fn: () => Promise<any>) {
    setBusy(true);
    setError('');
    try {
      const result = await fn();
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const newTask = () => {
    setScreen('tasks');
    setSelected(undefined);
  };
  if (!data)
    return (
      <div className="gate">
        <Mark />
        <h1>{locked ? 'Open your private workspace' : `Opening ${brand.name}`}</h1>
        <p>{error || 'Connecting to the local task service…'}</p>
        {locked && <p>Open DUKE Autorouter from Applications to reconnect to your saved work.</p>}
      </div>
    );
  const tasks: Task[] = data.tasks,
    active = tasks.filter((t) =>
      ['running', 'routing', 'verifying', 'awaiting_approval', 'queued'].includes(t.status),
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          aria-label={brand.name}
          onClick={(e) => {
            e.preventDefault();
            newTask();
          }}
        >
          <img className="brand-wordmark" src={wordmark} alt="" width="190" height="53" />
          <img className="brand-symbol" src={monogram} alt="" width="40" height="27" />
        </a>
        <button className="new-task" onClick={newTask}>
          <span aria-hidden="true">＋</span> New task <TaskArrow />
        </button>
        <nav>
          <button
            className={screen === 'tasks' ? 'nav active' : 'nav'}
            onClick={() => setScreen('tasks')}
          >
            <NavigationIcon kind="tasks" /> Tasks <small>{tasks.length}</small>
          </button>
          <button
            className={screen === 'setup' ? 'nav active' : 'nav'}
            onClick={() => setScreen('setup')}
          >
            <NavigationIcon kind="connections" />
            Connections & setup
          </button>
          <button
            className={screen === 'usage' ? 'nav active' : 'nav'}
            onClick={() => setScreen('usage')}
          >
            <NavigationIcon kind="usage" /> Usage & routing
          </button>
        </nav>
        {!!tasks.length && (
          <div className="task-history">
            <span className="side-label">Recent work</span>
            {tasks.slice(0, 15).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelected(t.id);
                  setScreen('tasks');
                }}
                className={'history-item ' + (selected === t.id ? 'selected' : '')}
              >
                <i className={'status-dot ' + t.status} />
                <span>{t.title}</span>
              </button>
            ))}
          </div>
        )}
      </aside>
      <main>
        <header className="topbar">
          <span>
            {screen === 'setup'
              ? 'Connections & setup'
              : screen === 'usage'
                ? 'Usage & routing'
                : 'Tasks'}
          </span>
          <UsageControl data={data} api={api} reload={load} onDetails={() => setScreen('usage')} />
        </header>
        {error && (
          <div className="error" role="alert">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {screen === 'tasks' && !selected && (
          <div className="home">
            <h1>What are we working on?</h1>
            <Composer
              workspaces={data.workspaces}
              models={data.models}
              revision={refresh}
              busy={busy}
              desktop={data.desktop}
              act={act}
              onSetup={() => setScreen('setup')}
              onSubmit={(input) =>
                act(async () => {
                  const t = await api('/tasks', input);
                  setSelected(t.id);
                })
              }
            />
            {!!active.length && (
              <p className="quiet">
                {active.length} task{active.length === 1 ? '' : 's'} in progress
                {active.some((task) =>
                  ['queued', 'routing', 'running', 'verifying'].includes(task.status),
                ) && <WorkingDots />}
              </p>
            )}
          </div>
        )}
        {screen === 'tasks' && selected && detail && (
          <TaskView
            key={selected}
            detail={detail}
            approvals={data.approvals.filter((a: Approval) => a.taskId === selected)}
            busy={busy}
            act={act}
          />
        )}
        {screen === 'setup' && <Setup data={data} act={act} busy={busy} />}
        {screen === 'usage' && <Usage data={data} act={act} busy={busy} />}
      </main>
    </div>
  );
}
function ProjectForm({
  desktop,
  busy,
  act,
  onCreated,
  onCancel,
}: {
  desktop: boolean;
  busy: boolean;
  act: (fn: () => Promise<any>) => Promise<any>;
  onCreated?: (workspace: Workspace) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [allowed, setAllowed] = useState(['codex', 'claude', 'openrouter']);
  const [error, setError] = useState('');
  return (
    <form
      className="form-panel"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        void act(async () => {
          try {
            const workspace = await api('/workspaces', { name, path, providers: allowed });
            setName('');
            setPath('');
            onCreated?.(workspace);
          } catch (error) {
            setError((error as Error).message);
          }
        });
      }}
    >
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="two-columns">
        <label>
          Project name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My project"
            required
          />
        </label>
        <label>
          Project folder
          <div className="folder-input">
            <input
              aria-label="Project folder"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/Users/you/Projects/my-project"
              required
            />
            {desktop && (
              <button
                type="button"
                aria-label="Choose project folder"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const selected = await chooseFolder(api);
                    if (selected.path) {
                      setPath(selected.path);
                      if (!name) setName(selected.path.split('/').pop() ?? '');
                    }
                  })
                }
              >
                Choose folder…
              </button>
            )}
          </div>
        </label>
      </div>
      <details className="project-account-options">
        <summary>Account access</summary>
        <fieldset className="project-accounts">
          <legend>Accounts for this project</legend>
          <div className="checks">
            {['codex', 'claude', 'openrouter'].map((provider) => (
              <label key={provider}>
                <input
                  type="checkbox"
                  checked={allowed.includes(provider)}
                  onChange={() =>
                    setAllowed(
                      allowed.includes(provider)
                        ? allowed.filter((value) => value !== provider)
                        : [...allowed, provider],
                    )
                  }
                />
                {providers[provider as keyof typeof providers]}
              </label>
            ))}
          </div>
        </fieldset>
      </details>
      <div className="button-row">
        <button className="primary" disabled={busy || !allowed.length}>
          Add project
        </button>
        {onCancel && (
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
function Composer({
  workspaces,
  models,
  revision,
  busy,
  desktop,
  act,
  onSetup,
  onSubmit,
}: {
  workspaces: Workspace[];
  models: Model[];
  revision: number;
  busy: boolean;
  desktop: boolean;
  act: (fn: () => Promise<any>) => Promise<any>;
  onSetup: () => void;
  onSubmit: (input: any) => void;
}) {
  const [prompt, setPrompt] = useState(''),
    [workspaceId, setWorkspace] = useState(''),
    [modelOverride, setModel] = useState(''),
    [caps, setCaps] = useState<string[]>(['files', 'shell', 'web', 'browser', 'artifacts']),
    [advanced, setAdvanced] = useState(false),
    [addingProject, setAddingProject] = useState(false),
    [expected, setExpected] = useState(''),
    [files, setFiles] = useState(''),
    [command, setCommand] = useState(''),
    [attachments, setAttachments] = useState(''),
    [preview, setPreview] = useState<{ key: string; value?: RoutePreview; error?: string }>();
  const workspace = workspaceId || workspaces[0]?.id || '';
  const allowedProviders = workspaces.find((w) => w.id === workspace)?.providers ?? [];
  const compatibleModels = models.filter(
    (model) =>
      model.enabled &&
      allowedProviders.includes(model.provider) &&
      caps.every((cap) => model.capabilities.some((allowed) => allowed === cap)),
  );
  const selectedModel = compatibleModels.some((model) => model.id === modelOverride)
    ? modelOverride
    : '';
  const lines = (value: string) =>
    value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  const taskInput = {
    prompt: prompt.trim(),
    workspaceId: workspace,
    required: caps,
    modelOverride: selectedModel || undefined,
    expectedResult: expected,
    attachments: lines(attachments),
    verification: { files: lines(files), command },
  };
  const previewInput = JSON.stringify(taskInput);
  const previewKey = JSON.stringify([previewInput, revision]);
  const currentPreview = preview?.key === previewKey ? preview : undefined;
  const checkingRoute = !!workspace && !!prompt.trim() && !currentPreview;
  const blockedRoute =
    currentPreview?.value?.status === 'blocked' && !currentPreview.value.jevMayRefine;
  useEffect(() => {
    const input = JSON.parse(previewInput);
    if (!input.workspaceId || !input.prompt) return;
    let active = true;
    const timer = setTimeout(() => {
      void api('/routes/preview', input)
        .then((value: RoutePreview) => {
          if (active) setPreview({ key: previewKey, value });
        })
        .catch((error: Error) => {
          if (active) setPreview({ key: previewKey, error: error.message });
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [previewInput, previewKey]);
  return (
    <>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(taskInput);
        }}
      >
        <label htmlFor="prompt" className="sr-only">
          Describe your task
        </label>
        <textarea
          id="prompt"
          placeholder="What would you like to get done?"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          rows={4}
        />
        <div className="composer-controls">
          <div className="composer-selects">
            {workspaces.length ? (
              <label className="project-picker">
                Project
                <select
                  aria-label="Project"
                  value={workspace}
                  onChange={(e) => {
                    if (e.target.value === '__add_project__') {
                      setAddingProject(true);
                      return;
                    }
                    setWorkspace(e.target.value);
                    setModel('');
                  }}
                >
                  <option value="" disabled>
                    Choose a project
                  </option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                  <option value="__add_project__">＋ Add a project…</option>
                </select>
              </label>
            ) : (
              <button type="button" className="add-project" onClick={() => setAddingProject(true)}>
                ＋ Add a project
              </button>
            )}
            <span className="routing-mode">
              {selectedModel ? 'Manual model override' : '↗ Automatic routing'}
            </span>
          </div>
          <button
            type="submit"
            className="primary"
            disabled={busy || !workspace || !prompt.trim() || checkingRoute || blockedRoute}
          >
            Start task <TaskArrow />
          </button>
        </div>
        {!!workspace && !!prompt.trim() && (
          <div
            className={'routing-check ' + (blockedRoute ? 'blocked' : '')}
            role="status"
            aria-label="Route preview"
          >
            {checkingRoute ? (
              <span>Checking the available routes…</span>
            ) : currentPreview?.error ? (
              <p>
                Preview unavailable: {currentPreview.error} Routing will be checked when you start.
              </p>
            ) : (
              <>
                <b>
                  {currentPreview?.value?.route
                    ? `Estimated model: ${currentPreview.value.modelLabel}`
                    : 'Before you start'}
                </b>
                <p>
                  {currentPreview?.value?.route && currentPreview.value.jevMayRefine
                    ? `${currentPreview.value.route.assessment.difficulty} ${currentPreview.value.route.kind} · local rules estimate; Jev may choose another model when you start.`
                    : currentPreview?.value?.message}
                </p>
                {currentPreview?.value?.status === 'blocked' && (
                  <button type="button" className="text-button" onClick={onSetup}>
                    Open setup →
                  </button>
                )}
              </>
            )}
          </div>
        )}
        <div className="composer-bottom">
          <button type="button" className="text-button" onClick={() => setAdvanced(!advanced)}>
            {advanced ? '− Hide task options' : '+ Task options'}
          </button>
        </div>
        {advanced && (
          <div className="advanced">
            {!!compatibleModels.length && (
              <label>
                Model override
                <select
                  aria-label="Model routing"
                  value={selectedModel}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="">Automatic — let DUKE choose</option>
                  {compatibleModels.map((m) => (
                    <option value={m.id} key={m.id}>
                      {displayName(m.label)} · {providers[m.provider]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!!workspace && !compatibleModels.length && (
              <p className="quiet">
                No selected models support these tools for this project.{' '}
                <button type="button" className="text-button" onClick={onSetup}>
                  Choose models →
                </button>
              </p>
            )}
            <label>
              Result instructions (optional)
              <input
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="e.g. A one-page comparison with sources"
              />
            </label>
            <label>
              Attachments (optional)
              <textarea
                value={attachments}
                onChange={(e) => setAttachments(e.target.value)}
                placeholder="brief.md"
                rows={2}
                aria-describedby="attachments-help"
              />
              <small id="attachments-help">
                Files already in your project folder, one path per line.
              </small>
            </label>
            <details className="task-advanced-options">
              <summary>Advanced options</summary>
              <fieldset className="project-accounts">
                <legend>Tool permissions</legend>
                <p className="quiet">Tools the model must support and may use for this task.</p>
                <div className="checks">
                  {Object.entries({
                    files: 'Read and write files',
                    shell: 'Run terminal commands',
                    web: 'Search the web',
                    browser: 'Use a browser',
                    artifacts: 'Create documents',
                  }).map(([capability, label]) => (
                    <label key={capability}>
                      <input
                        type="checkbox"
                        checked={caps.includes(capability)}
                        onChange={() =>
                          setCaps(
                            caps.includes(capability)
                              ? caps.filter((c) => c !== capability)
                              : [...caps, capability],
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                Files to check for
                <textarea
                  value={files}
                  onChange={(e) => setFiles(e.target.value)}
                  placeholder="artifacts/report.pdf"
                  rows={2}
                  aria-describedby="files-help"
                />
                <small id="files-help">
                  Optional output paths to verify after the task, one per line.
                </small>
              </label>
              <label>
                Test command
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npm test"
                  aria-describedby="command-help"
                />
                <small id="command-help">
                  Optional command to run in the project folder after the task.
                </small>
              </label>
            </details>
          </div>
        )}
      </form>
      {addingProject && (
        <ImportDialog
          label="Add a project"
          close={() => {
            if (!busy) setAddingProject(false);
          }}
        >
          <h2>Add a project</h2>
          <ProjectForm
            desktop={desktop}
            busy={busy}
            act={act}
            onCancel={() => setAddingProject(false)}
            onCreated={(project) => {
              setWorkspace(project.id);
              setModel('');
              setAddingProject(false);
            }}
          />
        </ImportDialog>
      )}
    </>
  );
}
function TaskView({ detail, approvals, busy, act }: any) {
  const t: Task = detail.task,
    [followup, setFollowup] = useState(''),
    [reconciled, setReconciled] = useState(false),
    [preview, setPreview] = useState<any>();
  const terminal = ['completed', 'blocked', 'interrupted', 'cancelled'].includes(t.status);
  const events = detail.events as any[];
  const original =
    events.find((e) => e.kind === 'created')?.data?.prompt ??
    t.prompt.split('\n\nUser follow-up:')[0];
  const history = events.filter(
    (e) => e.kind === 'completed' || (e.kind === 'resumed' && e.data.followup),
  );
  const lastRoute = events.findLastIndex((e) => e.kind === 'route');
  const liveText = events
    .slice(lastRoute + 1)
    .filter((e) => ['message', 'message_delta'].includes(e.kind))
    .map((e) => (e.data.text ?? '') + (e.kind === 'message' ? '\n\n' : ''))
    .join('');
  const latestTool = events.findLast(
    (e) => e.kind === 'tool_started' || e.kind === 'tool_completed',
  );
  return (
    <div className="page task-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">TASK</span>
          <h1>{t.title}</h1>
        </div>
        <span
          role="status"
          className={
            'status-chip ' +
            (t.status === 'completed' && t.review?.status === 'failed'
              ? 'blocked'
              : t.status === 'completed' && t.review?.status === 'unverified'
                ? 'unverified'
                : t.status)
          }
        >
          {t.status === 'completed' && t.review?.status === 'failed'
            ? 'Saved · checks found issues'
            : t.status === 'completed' && t.review?.status === 'unverified'
              ? 'Saved · checks incomplete'
              : statusLabel(t.status)}
          {['queued', 'routing', 'running', 'verifying'].includes(t.status) && <WorkingDots />}
        </span>
      </div>
      {!terminal && t.phase && (
        <p className="quiet" role="status">
          {t.phase.name}…
        </p>
      )}
      {t.route && (
        <div className="route-card">
          <div className="route-icon">↗</div>
          <div>
            <b>
              {displayName(t.route.model)} · {effortLabel(t.route.effort)} effort
            </b>
            <p>{t.route.reason}</p>
          </div>
          <span className="tag">{providers[t.route.provider]}</span>
        </div>
      )}
      <div className="request-block">
        <span className="side-label">Your request</span>
        <p>{original}</p>
      </div>
      {!!detail.setupContext?.files.length && (
        <details className="task-setup-receipt">
          <summary>Setup used for this task · {detail.setupContext.files.length} files</summary>
          <p className="quiet">
            Captured {new Date(detail.setupContext.at).toLocaleString()}. This task keeps these
            versions when you continue it.
          </p>
          {detail.setupContext.files.map((f: any) => (
            <div key={f.id}>
              <b>{f.setupName}</b> / {f.path}{' '}
              <small>
                {f.mode === 'link' ? 'Linked' : 'Copied'} · {f.sha256.slice(0, 12)}
              </small>
            </div>
          ))}
          {detail.setupContext.warnings.map((w: string, i: number) => (
            <p className="notice" key={i}>
              {w}
            </p>
          ))}
        </details>
      )}
      {history.map((event) =>
        event.kind === 'resumed' ? (
          <div className="request-block" key={event.id}>
            <span className="side-label">YOU</span>
            <p>{event.data.followup}</p>
          </div>
        ) : (
          <section className="result" key={event.id}>
            <span className="eyebrow">DUKE</span>
            <div className="result-text">
              <Markdown text={event.data.result} />
            </div>
          </section>
        ),
      )}
      {approvals.map((a: Approval) => (
        <section className="approval" key={a.id}>
          <span className="eyebrow">Your approval is needed</span>
          <h2>{a.operation}</h2>
          <pre>{JSON.stringify(a.args, null, 2)}</pre>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() => act(() => api('/approvals/' + a.id, { allow: true, hash: a.hash }))}
            >
              Approve this action
            </button>
            <button
              disabled={busy}
              onClick={() => act(() => api('/approvals/' + a.id, { allow: false, hash: a.hash }))}
            >
              Decline
            </button>
          </div>
        </section>
      ))}
      {t.error && <div className="notice">{t.error}</div>}
      {!!detail.artifacts.length && (
        <section>
          <div className="section-heading">
            <h2>Deliverables</h2>
            <span>
              {detail.artifacts.length} saved version{detail.artifacts.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="artifacts">
            {detail.artifacts.map((a: any) => (
              <div key={a.id} className="artifact">
                <span className="file-icon">▧</span>
                <div>
                  <b>{a.path}</b>
                  <small>{(a.bytes / 1024).toFixed(1)} KB</small>
                </div>
                <button onClick={() => setPreview(a)}>Preview</button>
                <a href={'/api/artifacts/' + a.id + '?download=1'} download>
                  ↓
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
      {t.review && (
        <details
          className="task-setup-receipt check-summary"
          aria-label="Automatic checks"
          open={t.review.status === 'failed'}
        >
          <summary>
            <b>
              {t.review.status === 'passed'
                ? t.review.limitations.some((note) => /layout/i.test(note))
                  ? 'Content checks passed'
                  : 'Checks passed'
                : t.review.status === 'failed'
                  ? 'Checks found issues'
                  : 'Checks incomplete'}
            </b>
            {t.review.status === 'passed' && t.review.limitations.some((note) => /layout/i.test(note)) && (
              <span className="check-reason">Layout has not been independently checked.</span>
            )}
            {t.review.status !== 'passed' && (
              <span className="check-reason">
                {(
                  t.review.checks.find((c) => c.status !== 'passed')?.detail ||
                  t.review.limitations[0] ||
                  t.review.summary
                ).slice(0, 240)}
              </span>
            )}
          </summary>
          <p>{t.review.summary}</p>
          {t.review.checks.map((check, i) => (
            <div key={i}>
              <b>{check.name}</b> ·{' '}
              {check.status === 'unverified' ? 'not established' : check.status}
              <p className="quiet">{check.detail}</p>
            </div>
          ))}
          {t.review.limitations.map((note, i) => (
            <p className="quiet" key={i}>
              {note}
            </p>
          ))}
          {t.status === 'completed' && t.review.status === 'unverified' && (
            <button
              disabled={busy}
              onClick={() => act(() => api('/tasks/' + t.id + '/review', {}))}
            >
              Retry checks
            </button>
          )}
        </details>
      )}
      {t.result && !history.some((e) => e.kind === 'completed') && terminal && (
        <section className="result">
          <span className="eyebrow">RESULT</span>
          <div className="result-text">
            <Markdown text={t.result} />
          </div>
        </section>
      )}
      {!terminal && (liveText || latestTool) && (
        <section className="result" aria-label="Work in progress">
          <span className="eyebrow">DUKE is working</span>
          {liveText && (
            <div className="result-text">
              <Markdown text={liveText} />
            </div>
          )}
          {latestTool && (
            <small>
              {latestTool.kind === 'tool_started' ? 'Using' : 'Finished'}{' '}
              {statusLabel(latestTool.data.name)}
            </small>
          )}
        </section>
      )}
      {terminal && t.route && (
        <div className="feedback-row">
          <span>Optional feedback</span>
          <button
            aria-pressed={detail.feedback?.rating === 'worked'}
            disabled={busy}
            onClick={() => act(() => api('/tasks/' + t.id + '/feedback', { rating: 'worked' }))}
          >
            Worked
          </button>
          <button
            aria-pressed={detail.feedback?.rating === 'needs_work'}
            disabled={busy}
            onClick={() => act(() => api('/tasks/' + t.id + '/feedback', { rating: 'needs_work' }))}
          >
            Needs work
          </button>
          {detail.feedback && <small>Saved.</small>}
        </div>
      )}
      {preview && <ArtifactPreview key={preview.id} artifact={preview} close={() => setPreview(undefined)} />}
      <details className="task-setup-receipt resource-receipts" aria-label="Resource receipts">
        <summary>Usage & execution receipts</summary>
        {t.usage && (
          <details className="task-setup-receipt" aria-label="Token usage">
            <summary>
              {t.usage.reportedTokens.toLocaleString()} reported tokens
              {!t.usage.complete ? ' · incomplete' : ''}
            </summary>
            <p>
              Routing {t.usage.byRole.routing.toLocaleString()} · Workers{' '}
              {t.usage.byRole.worker.toLocaleString()} · Review{' '}
              {t.usage.byRole.review.toLocaleString()}
            </p>
            <p className="quiet">
              Includes reported usage from all attempts and continuations. Cached input and
              reasoning are included once. Provider token counts do not directly measure
              subscription quota.
            </p>
            {!t.usage.complete && (
              <p className="quiet">
                One or more calls did not report complete usage. DUKE will not use this total to
                claim an efficiency improvement.
              </p>
            )}
          </details>
        )}
        {!!t.subscriptionUsage?.attempts.length && (
          <details className="task-setup-receipt" aria-label="Subscription allowance">
            <summary>Subscription allowance</summary>
            {t.subscriptionUsage.attempts.map((attempt) => (
              <div key={attempt.id}>
                <b>
                  {attempt.provider === 'codex' ? 'Codex' : 'Claude'} ·{' '}
                  {displayName(attempt.modelId)}
                </b>
                {!attempt.windows.length ? (
                  <p className="quiet">Allowance change was not reported.</p>
                ) : (
                  attempt.windows.map((window, i) => (
                    <p className="quiet" key={i}>
                      {window.limitId} ·{' '}
                      {window.durationMins
                        ? `${window.durationMins / 60}-hour window`
                        : window.window}
                      :{' '}
                      {window.status === 'observed'
                        ? `reported use changed from ${window.beforeUsedPercent}% to ${window.afterUsedPercent}%`
                        : window.status === 'reset'
                          ? 'allowance reset during this attempt; change is unknown'
                          : 'no comparable before-and-after report'}
                    </p>
                  ))
                )}
              </div>
            ))}
            <p className="quiet">
              These are changes in your account’s reported use while the workers ran. Other apps may
              contribute. An unchanged percentage can reflect rounding or delayed updates.
            </p>
          </details>
        )}
        {t.checkpoint && (
          <details className="details">
            <summary>Saved checkpoint</summary>
            <p>{t.checkpoint.summary || 'Native session recorded.'}</p>
            <p>{t.checkpoint.remaining}</p>
          </details>
        )}
        <details className="details">
          <summary>
            Execution evidence <span>{detail.events.length} events</span>
          </summary>
          <div className="event-list">
            {detail.events.map((e: any) => (
              <details key={e.id}>
                <summary>
                  <span>{new Date(e.at).toLocaleTimeString()}</span>
                  {statusLabel(e.kind)}
                </summary>
                <pre>{JSON.stringify(e.data, null, 2)}</pre>
              </details>
            ))}
          </div>
        </details>
      </details>
      {terminal ? (
        <form
          className="followup"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api('/tasks/' + t.id + '/resume', { followup, reconciled });
              setFollowup('');
            });
          }}
        >
          <label>
            Follow up
            <textarea
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              placeholder="Add a refinement or explain what to try next…"
              rows={2}
            />
          </label>
          {t.error?.includes('uncertain') && (
            <label className="checkline">
              <input
                type="checkbox"
                checked={reconciled}
                onChange={(e) => setReconciled(e.target.checked)}
              />
              I reviewed the external action’s outcome.
            </label>
          )}
          <button className="primary" disabled={busy}>
            Continue task ↗
          </button>
        </form>
      ) : (
        <div className="running-row">
          <button onClick={() => act(() => api('/tasks/' + t.id + '/cancel', {}))}>
            Stop task
          </button>
        </div>
      )}
    </div>
  );
}
function Setup({ data, act, busy }: any) {
  const [keyProvider, setKeyProvider] = useState(''),
    [key, setKey] = useState(''),
    [loginUrl, setLoginUrl] = useState(''),
    [claudeLogin, setClaudeLogin] = useState<ClaudeLoginState>(),
    [claudeSetupOpen, setClaudeSetupOpen] = useState(false),
    [editWorkspace, setEditWorkspace] = useState<Workspace>(),
    [importW, setImportW] = useState(''),
    [importPath, setImportPath] = useState(''),
    [importPreview, setImportPreview] = useState<any>();
  const health = (p: string) => data.health.find((h: any) => h.provider === p);
  const connectClaude = (method: ClaudeLoginMethod = 'subscription') =>
    act(async () => {
      setClaudeSetupOpen(false);
      setClaudeLogin(await api('/login/claude', { method }));
    });
  return (
    <div className="page">
      <div className="section-heading">
        <h1>Connections & setup</h1>
        <button disabled={busy} onClick={() => act(() => api('/health', {}))}>
          Check connections ↻
        </button>
      </div>
      <div className="provider-grid">
        {Object.entries(providers).map(([p, label]) => (
          <div className="provider-card" key={p}>
            <div className="provider-heading">
              <span className={'provider-monogram ' + p}>{label[0]}</span>
              <h3>{label}</h3>
              <i
                className={
                  health(p)?.ready
                    ? 'live-dot'
                    : health(p)?.connection?.signedIn
                      ? 'connected-dot'
                      : 'empty-dot'
                }
              />
            </div>
            <p>
              {p === 'codex'
                ? 'ChatGPT subscription'
                : p === 'claude'
                  ? 'Claude Code account'
                  : p === 'openrouter'
                    ? 'API models'
                    : 'Automatic model selection'}
            </p>
            <small>{health(p)?.message ?? 'Not checked yet'}</small>
            <div className="button-row">
              <button
                disabled={busy}
                onClick={() => {
                  if (p === 'codex')
                    void act(async () => {
                      const d = await api('/login/codex', {});
                      setLoginUrl(d.authUrl);
                    });
                  else if (p === 'claude') void connectClaude();
                  else setKeyProvider(p);
                }}
              >
                {p === 'jev' || p === 'openrouter' ? 'Add API key' : 'Connect subscription'}
              </button>
              {p !== 'jev' && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => act(() => api('/discover/' + p, {}))}
                >
                  Refresh models
                </button>
              )}
              {['codex', 'claude'].includes(p) &&
                (health(p)?.ready || health(p)?.connection?.signedIn) && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => act(() => api('/logout/' + p, {}))}
                  >
                    Disconnect
                  </button>
                )}
            </div>
            {p === 'claude' && (
              <details className="claude-signin-options">
                <summary>Other sign-in options</summary>
                <div className="button-row">
                  <button
                    className="text-button"
                    disabled={busy || data.claudeLoginPending}
                    onClick={() => void connectClaude('sso')}
                  >
                    Organization SSO
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || data.claudeLoginPending}
                    onClick={() => void connectClaude('console')}
                  >
                    Claude Console sign-in
                  </button>
                </div>
                <small>
                  Console uses separate API billing. DUKE currently runs Claude tasks through
                  subscriptions.
                </small>
                {data.claudeSetupAvailable && (
                  <>
                    <button
                      className="text-button"
                      disabled={busy || data.claudeLoginPending}
                      onClick={() =>
                        act(async () => {
                          await api('/claude/setup', {});
                          setClaudeLogin(undefined);
                          setClaudeSetupOpen(true);
                        })
                      }
                    >
                      Open full Claude Code setup
                    </button>
                    <small>
                      Opens Terminal. Account changes apply to DUKE; check connections when
                      finished.
                    </small>
                  </>
                )}
              </details>
            )}
          </div>
        ))}
      </div>
      {loginUrl && !health('codex')?.ready && (
        <div className="notice">
          Finish your Codex sign-in:{' '}
          <a href={loginUrl} target="_blank" rel="noreferrer">
            Open secure login →
          </a>
        </div>
      )}
      {claudeLogin && data.claudeLoginPending && (
        <div className="notice">
          <b>
            Finish your {claudeLogin.method === 'console' ? 'Claude Console' : 'Claude'} sign-in in
            the browser
          </b>
          {claudeLogin.authUrl && (
            <a href={claudeLogin.authUrl} target="_blank" rel="noreferrer">
              Open secure login →
            </a>
          )}
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await api('/login/claude/cancel', {});
                setClaudeLogin(undefined);
              })
            }
          >
            Cancel sign-in
          </button>
        </div>
      )}
      {claudeSetupOpen && (
        <div className="notice" role="status">
          Claude Code setup opened in Terminal. Finish there, then choose Check connections.
          <button className="text-button" onClick={() => setClaudeSetupOpen(false)}>
            Dismiss
          </button>
        </div>
      )}
      <ModelRoster
        models={data.models}
        preferences={data.settings.workPreferences ?? {}}
        needsReview={data.roster?.needsReview}
        act={act}
        busy={busy}
        api={api}
        renderModel={(m) => <ModelCard key={m.id} model={m} act={act} busy={busy} />}
      />
      <SetupImport data={data} act={act} busy={busy} api={api} />
      <RemoteAccessPanel data={data} act={act} busy={busy} />
      <section className="settings-section">
        <div className="section-heading">
          <h2>Projects</h2>
        </div>
        {data.workspaces.map((w: Workspace) => (
          <div className="workspace-row" key={w.id}>
            <span className="file-icon">▱</span>
            <div>
              <b>{w.name}</b>
              <small>{w.path}</small>
              {!!w.instructions.length && (
                <small>
                  {w.instructions.length} instruction file{w.instructions.length === 1 ? '' : 's'}
                </small>
              )}
            </div>
            <button onClick={() => setImportW(w.id)}>Import instructions</button>
            <button onClick={() => setEditWorkspace(w)}>Project settings</button>
          </div>
        ))}
        <ProjectForm desktop={data.desktop} busy={busy} act={act} />
      </section>
      {editWorkspace && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api('/workspaces/' + editWorkspace.id, editWorkspace, 'PUT');
                setEditWorkspace(undefined);
              });
            }}
          >
            <h2>Project settings</h2>
            <label>
              Project name
              <input
                value={editWorkspace.name}
                onChange={(e) => setEditWorkspace({ ...editWorkspace, name: e.target.value })}
                required
              />
            </label>
            <p className="quiet">{editWorkspace.path}</p>
            <fieldset className="project-accounts">
              <legend>Accounts for this project</legend>
              <div className="checks">
                {(['codex', 'claude', 'openrouter'] as const).map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={editWorkspace.providers.includes(p)}
                      onChange={(e) =>
                        setEditWorkspace({
                          ...editWorkspace,
                          providers: e.target.checked
                            ? [...editWorkspace.providers, p]
                            : editWorkspace.providers.filter((v) => v !== p),
                        })
                      }
                    />
                    {providers[p]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="button-row">
              <button className="primary" disabled={busy || !editWorkspace.providers.length}>
                Save project settings
              </button>
              <button type="button" onClick={() => setEditWorkspace(undefined)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {keyProvider && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api('/keys/' + keyProvider, { key });
                setKey('');
                setKeyProvider('');
              });
            }}
          >
            <h2>Connect {providers[keyProvider as keyof typeof providers]}</h2>
            <p>Saved in your Mac’s Keychain; excluded from exports.</p>
            {keyProvider === 'jev' && (
              <>
                <p>Jev selects models and checks results using your API budget.</p>
                <details>
                  <summary>What Jev receives</summary>
                  <p>
                    Your task brief, model profiles, and limited excerpts of attachments, task
                    files, deliverables, progress, and retrieved sources. Imported setup files are
                    not sent directly.
                  </p>
                </details>
              </>
            )}
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
              />
            </label>
            <div className="button-row">
              <button className="primary" disabled={busy}>
                Save to Keychain
              </button>
              <button
                type="button"
                onClick={() => {
                  setKey('');
                  setKeyProvider('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {importW && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Import selected instructions</h2>
            <p>Choose a Markdown or text file to use as project instructions.</p>
            <label>
              File path
              <input
                value={importPath}
                onChange={(e) => {
                  setImportPath(e.target.value);
                  setImportPreview(undefined);
                }}
              />
            </label>
            <button
              onClick={() =>
                act(async () =>
                  setImportPreview(
                    await api('/workspaces/' + importW + '/import-preview', { path: importPath }),
                  ),
                )
              }
            >
              Preview file
            </button>
            {importPreview && (
              <>
                <pre className="import-preview">{importPreview.content}</pre>
                <button
                  className="primary"
                  onClick={() =>
                    act(async () => {
                      await api('/workspaces/' + importW + '/import', importPreview);
                      setImportW('');
                      setImportPreview(undefined);
                    })
                  }
                >
                  Import this copy
                </button>
              </>
            )}
            <button
              onClick={() => {
                setImportW('');
                setImportPreview(undefined);
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RemoteAccessPanel({ data, act, busy }: any) {
  const [selected, setSelected] = useState<string[]>([]),
    [pairing, setPairing] = useState<{ code: string; expiresAt: string }>();
  return (
    <section className="settings-section remote-access">
      <div className="section-heading">
        <div>
          <h2>iPhone access</h2>
          <p className="quiet">Pair a phone with selected projects. Accounts, keys, model settings and project paths stay on this Mac.</p>
        </div>
        <span className={'tag ' + (data.remoteEnabled ? 'green' : 'amber')}>{data.remoteEnabled ? 'Private gateway on' : 'Private gateway off'}</span>
      </div>
      {!data.remoteEnabled && <p className="notice">The phone gateway is opt-in and still needs an approved private HTTPS transport. No public listener was opened.</p>}
      {!!data.workspaces.length && (
        <fieldset>
          <legend>Projects this phone can use</legend>
          <div className="checks">
            {data.workspaces.map((workspace: Workspace) => (
              <label key={workspace.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(workspace.id)}
                  onChange={(event) => setSelected(event.target.checked ? [...selected, workspace.id] : selected.filter((id) => id !== workspace.id))}
                />
                {workspace.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="button-row">
        <button
          disabled={busy || !data.remoteEnabled || !selected.length}
          onClick={() =>
            void act(async () => {
              setPairing(
                await api('/remote/pairing-challenges', {
                  workspaceIds: selected,
                }),
              );
            })
          }
        >
          Create one-time pairing code
        </button>
      </div>
      {pairing && (
        <div className="pairing-code" role="status">
          <b>Enter this code on the iPhone</b>
          <code>{pairing.code}</code>
          <small>Expires {new Date(pairing.expiresAt).toLocaleTimeString()} and works once.</small>
        </div>
      )}
      {!!data.remoteDevices?.length && (
        <div className="paired-devices">
          <h3>Paired devices</h3>
          {data.remoteDevices.map((device: any) => (
            <div className="workspace-row" key={device.id}>
              <span className="file-icon">▯</span>
              <div>
                <b>{device.name}</b>
                <small>{device.revokedAt ? 'Revoked' : `${device.allowedWorkspaceIds.length} project${device.allowedWorkspaceIds.length === 1 ? '' : 's'}`}</small>
              </div>
              {!device.revokedAt && (
                <button className="text-button" disabled={busy} onClick={() => act(() => api('/remote/devices/' + device.id + '/revoke', {}))}>
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function ModelCard({ model, act, busy }: { model: Model; act: any; busy: boolean }) {
  const [m, setM] = useState(model),
    [endpoints, setEndpoints] = useState<any[]>([]);
  useEffect(() => setM(model), [JSON.stringify(model)]);
  const observations =
    model.effortProfiles?.flatMap((profile) => profile.observations) ?? model.observations ?? [];
  return (
    <details className="model-card">
      <summary>
        <div>
          <b>{displayName(model.label)}</b>
          <small>{model.id}</small>
        </div>
        <span className={'tag ' + (model.enabled ? 'green' : '')}>
          {model.enabled ? 'Selected' : 'Not selected'}
        </span>
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => api('/models/' + encodeURIComponent(m.id), m, 'PUT'));
        }}
      >
        {m.catalog && <p className="quiet">{m.catalog.description}</p>}
        {m.evaluated && (
          <p className="quiet">
            Your evaluation: {Object.keys(m.quality).join(', ')} · up to{' '}
            {m.maxDifficulty ?? 'routine'} difficulty. Other work uses the catalog profile.
          </p>
        )}
        {!!m.feedback && m.feedback.worked + m.feedback.needsWork > 0 && (
          <p className="quiet">
            Your feedback: {m.feedback.worked} worked · {m.feedback.needsWork} needs work
          </p>
        )}
        {!!observations.length && (
          <p className="quiet">
            Local automatic checks: {observations.reduce((n, o) => n + o.passed, 0)} passed ·{' '}
            {observations.reduce((n, o) => n + o.failed, 0)} found issues ·{' '}
            {observations.reduce((n, o) => n + o.unverified, 0)} incomplete.
          </p>
        )}
        <div className="checks">
          <label>
            <input
              type="checkbox"
              checked={m.enabled}
              onChange={(e) => setM({ ...m, enabled: e.target.checked })}
            />
            Enable model
          </label>
        </div>
        <details>
          <summary>Advanced model settings</summary>
          <label>
            Optional guidance for Jev
            <textarea
              value={m.routingNotes ?? ''}
              maxLength={2000}
              onChange={(e) => setM({ ...m, routingNotes: e.target.value })}
              placeholder="Any preferences Jev should consider when choosing this model"
            />
          </label>
          {m.provider === 'openrouter' && (
            <>
              <button
                type="button"
                onClick={() =>
                  act(async () =>
                    setEndpoints(await api('/models/' + encodeURIComponent(m.id) + '/endpoints')),
                  )
                }
              >
                Load provider endpoints
              </button>
              {!!endpoints.length && (
                <label>
                  Choose a provider endpoint
                  <select
                    value={m.providerSlug ?? ''}
                    onChange={(e) => {
                      const ep = endpoints.find((x) => x.tag === e.target.value);
                      if (ep)
                        setM({
                          ...m,
                          providerSlug: ep.tag,
                          inputPrice: Number(ep.pricing.prompt) * 1e6,
                          outputPrice: Number(ep.pricing.completion) * 1e6,
                          requestPrice: Number(ep.pricing.request ?? 0),
                          contextLimit: ep.context_length ?? m.contextLimit,
                          maxOutput: Math.min(4096, ep.max_completion_tokens ?? 4096),
                        });
                    }}
                  >
                    <option value="">Select an endpoint</option>
                    {endpoints
                      .filter((ep) => ep.supported_parameters?.includes('tools') && ep.tag)
                      .map((ep) => (
                        <option key={ep.tag} value={ep.tag}>
                          {ep.tag} · ${Number(ep.pricing.prompt) * 1e6} / $
                          {Number(ep.pricing.completion) * 1e6} per M tokens
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Approved OpenRouter provider slug
                <input
                  value={m.providerSlug ?? ''}
                  onChange={(e) => setM({ ...m, providerSlug: e.target.value })}
                  placeholder="Exact provider endpoint slug from OpenRouter"
                />
              </label>
              <div className="two-columns">
                <label>
                  Input $ / million tokens
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={m.inputPrice ?? ''}
                    onChange={(e) =>
                      setM({
                        ...m,
                        inputPrice: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Output $ / million tokens
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={m.outputPrice ?? ''}
                    onChange={(e) =>
                      setM({
                        ...m,
                        outputPrice: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            </>
          )}
        </details>
        <button disabled={busy} className="primary">
          Save model
        </button>
      </form>
    </details>
  );
}
function Usage({ data, act, busy }: any) {
  const [s, setS] = useState<Settings>(data.settings),
    [ledger, setLedger] = useState<any[]>();
  const evidence = data.models
    .filter((m: Model) => m.enabled)
    .flatMap(
      (m: Model) =>
        m.effortProfiles?.flatMap((profile) => profile.efficiency) ?? m.efficiency ?? [],
    );
  const evidenceTasks = evidence.reduce((n: number, e: any) => n + e.tasks, 0);
  const sampledTasks = evidence.reduce((n: number, e: any) => n + e.sampledTasks, 0);
  const recoveredTasks = evidence.reduce(
    (n: number, e: any) => n + (e.recoveredSuccessful ?? 0),
    0,
  );
  const recoveryUnknown = evidence.reduce((n: number, e: any) => n + (e.recoveryUnknown ?? 0), 0);
  return (
    <div className="page">
      <h1>Usage & routing</h1>
      <div className="usage-preferences">
        <UsageDisplaySelect
          value={data.preferences?.usageDisplay ?? 'compact'}
          disabled={busy}
          onChange={(usageDisplay) => void act(() => api('/preferences', { usageDisplay }, 'PUT'))}
        />
      </div>
      <div className="metrics">
        <div>
          <span>API spending today</span>
          <b>{usd(data.spend.day)}</b>
          <progress value={data.spend.day} max={data.settings.dailyLimit || 1} />
          <small>{usd(data.settings.dailyLimit)} daily limit</small>
        </div>
        <div>
          <span>This calendar month</span>
          <b>{usd(data.spend.month)}</b>
          <progress value={data.spend.month} max={data.settings.monthlyLimit || 1} />
          <small>{usd(data.settings.monthlyLimit)} monthly limit</small>
        </div>
        <div>
          <span>Unreconciled requests</span>
          <b>{data.spend.unreconciled}</b>
          <small>Includes reserved charges.</small>
        </div>
      </div>
      <div className="notice">
        <b>
          {data.tasks
            .reduce((n: number, t: Task) => n + (t.usage?.reportedTokens ?? 0), 0)
            .toLocaleString()}{' '}
          reported tokens across saved task runs
        </b>
        <p>
          Includes routing, worker attempts, and review.{' '}
          {data.tasks.filter((t: Task) => t.usage && !t.usage.complete).length} tasks have
          incomplete token reports.
        </p>
      </div>
      <div className="notice">API spending in DUKE · {data.settings.timezone}</div>
      <section className="notice" aria-label="Learning evidence">
        <b>
          {sampledTasks} of {evidenceTasks} eligible past tasks have complete checks and usage
        </b>
        <p>These results inform future model choices.</p>
        <p className="quiet">
          {recoveredTasks} accepted tasks needed recovery; their full cost stays with the initial
          route.{' '}
          {recoveryUnknown > 0
            ? `${recoveryUnknown} older accepted tasks lack recovery detail.`
            : ''}
        </p>
      </section>
      <section className="settings-section">
        <h2>Routing policy</h2>
        <form
          className="form-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => api('/settings', s, 'PUT'));
          }}
        >
          <div className="two-columns">
            <label>
              Daily API limit ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={s.dailyLimit}
                onChange={(e) => setS({ ...s, dailyLimit: Number(e.target.value) })}
              />
            </label>
            <label>
              Monthly API limit ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={s.monthlyLimit}
                onChange={(e) => setS({ ...s, monthlyLimit: Number(e.target.value) })}
              />
            </label>
          </div>
          {s.jevMode !== 'assist' && (
            <p className="notice">
              Routing diagnostics are active. Restore Automatic selection below to use Jev.
            </p>
          )}
          <label>
            Jev fallback model
            <select
              value={s.jevFallbackModel ?? ''}
              onChange={(e) => setS({ ...s, jevFallbackModel: e.target.value })}
            >
              <option value="">Automatic — Luna or Haiku</option>
              {s.jevFallbackModel &&
                !data.models.some((m: Model) => m.enabled && m.id === s.jevFallbackModel) && (
                  <option value={s.jevFallbackModel}>
                    Previously selected model (unavailable)
                  </option>
                )}
              {data.models
                .filter((m: Model) => m.enabled)
                .map((m: Model) => (
                  <option key={m.id} value={m.id}>
                    {displayName(m.label)} · {providers[m.provider]}
                  </option>
                ))}
            </select>
            <small>
              Used if Jev fails or cannot choose. The model must be selected and available;
              otherwise the task pauses.
            </small>
          </label>
          <details>
            <summary>Advanced routing diagnostics</summary>
            <label>
              Minimum success rate for declared evaluations
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={s.qualityFloor}
                onChange={(e) => setS({ ...s, qualityFloor: Number(e.target.value) })}
              />
            </label>
            <label>
              Jev routing mode
              <select
                value={s.jevMode}
                onChange={(e) => setS({ ...s, jevMode: e.target.value as Settings['jevMode'] })}
              >
                <option value="off">Off — automatic rules</option>
                <option value="observe">
                  Shadow test — compare decisions without applying them
                </option>
                <option value="assist">Automatic selection — Jev assesses and chooses</option>
              </select>
            </label>
            <div className="two-columns">
              <label>
                Pinned Jev model
                <input
                  value={s.jevModel}
                  onChange={(e) => setS({ ...s, jevModel: e.target.value })}
                />
              </label>
              <label>
                Jev input $ / million tokens
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={s.jevInputPrice}
                  onChange={(e) => setS({ ...s, jevInputPrice: Number(e.target.value) })}
                />
              </label>
            </div>
          </details>
          <button className="primary" disabled={busy}>
            Save routing policy
          </button>
        </form>
      </section>
      <section className="settings-section">
        <div className="section-heading">
          <h2>Subscription capacity</h2>
          <button disabled={busy} onClick={() => void act(() => api('/usage/refresh', {}))}>
            Refresh subscriptions
          </button>
        </div>
        <p className="quiet">
          Includes usage outside DUKE. Refresh readings older than 15 minutes.
        </p>
        <SubscriptionCards health={data.health} />
      </section>
      <button onClick={() => act(async () => setLedger(await api('/spending')))}>
        Review request ledger
      </button>
      {ledger && (
        <SpendingLedger
          entries={ledger}
          busy={busy}
          api={api}
          act={act}
          refresh={async () => setLedger(await api('/spending'))}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
