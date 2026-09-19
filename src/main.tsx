import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Task, Workspace, Model, Approval, Settings, RoutePreview } from '../server/types';
import { brand } from '../shared/brand';
import { Markdown } from './Markdown';
import { SetupImport } from './SetupImport';
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
function Mark() {
  return (
    <div className="mark" aria-hidden="true">
      <img src={monogram} alt="" width="40" height="27" />
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
        <span className="side-label">Your projects</span>
        <button className="new-task" onClick={newTask}>
          <span>＋</span> New task <kbd>↗</kbd>
        </button>
        <nav>
          <button
            className={screen === 'tasks' ? 'nav active' : 'nav'}
            onClick={() => setScreen('tasks')}
          >
            <span>▤</span> Tasks <small>{tasks.length}</small>
          </button>
          <button
            className={screen === 'setup' ? 'nav active' : 'nav'}
            onClick={() => setScreen('setup')}
          >
            <span>◇</span> Connections & setup
          </button>
          <button
            className={screen === 'usage' ? 'nav active' : 'nav'}
            onClick={() => setScreen('usage')}
          >
            <span>◷</span> Usage & routing
          </button>
        </nav>
        <div className="task-history">
          <span className="side-label">Recent work</span>
          {!tasks.length && <p className="quiet">Your tasks will appear here.</p>}
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
        <div className="side-bottom">
          <div>
            <i className="live-dot" /> Local on this Mac
          </div>
          <p>Use only what the task needs.</p>
          <span className="version">Local router · 0.1</span>
        </div>
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
            <p className="intro">Describe the work. DUKE chooses the model and gets started.</p>
            <Composer
              workspaces={data.workspaces}
              models={data.models}
              revision={refresh}
              busy={busy}
              onSetup={() => setScreen('setup')}
              onSubmit={(input) =>
                act(async () => {
                  const t = await api('/tasks', input);
                  setSelected(t.id);
                })
              }
            />
            <div className="connection-strip">
              <div>
                <span className="side-label">Your model connections</span>
                <p>
                  {data.health.filter((h: any) => h.ready).length
                    ? `${data.health.filter((h: any) => h.ready).length} connected`
                    : 'Connect a runtime to get started'}
                </p>
              </div>
              <div className="provider-tags">
                {Object.entries(providers).map(([id, name]) => {
                  const h = data.health.find((h: any) => h.provider === id);
                  return (
                    <button key={id} onClick={() => setScreen('setup')}>
                      <i className={h?.ready ? 'live-dot' : 'empty-dot'} />
                      {name}
                      {id === 'jev' && <small>model selection</small>}
                    </button>
                  );
                })}
              </div>
            </div>
            {!!active.length && (
              <p className="quiet">
                {active.length} task{active.length === 1 ? '' : 's'} in progress. Work is saved
                locally.
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
        <footer>
          <span>Built around your work.</span>
          <span>Saved here. Task context goes to enabled providers.</span>
        </footer>
      </main>
    </div>
  );
}
function Composer({
  workspaces,
  models,
  revision,
  busy,
  onSetup,
  onSubmit,
}: {
  workspaces: Workspace[];
  models: Model[];
  revision: number;
  busy: boolean;
  onSetup: () => void;
  onSubmit: (input: any) => void;
}) {
  const [prompt, setPrompt] = useState(''),
    [workspaceId, setWorkspace] = useState(''),
    [modelOverride, setModel] = useState(''),
    [caps, setCaps] = useState<string[]>(['files', 'shell', 'web', 'browser', 'artifacts']),
    [advanced, setAdvanced] = useState(false),
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
          <label className="project-picker">
            Project
            <select
              aria-label="Project"
              value={workspace}
              onChange={(e) => {
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
            </select>
          </label>
          <span className="routing-mode">
            {selectedModel ? 'Manual model override' : '↗ Automatic routing'}
          </span>
        </div>
        <button
          type="submit"
          className="primary"
          disabled={busy || !workspace || !prompt.trim() || checkingRoute || blockedRoute}
        >
          Start task <span>↗</span>
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
              <small>
                This preview makes no model requests.
                {currentPreview?.value?.jevMayRefine
                  ? ' Jev assesses difficulty and selects the worker automatically when you start.'
                  : ' Connection, quota, and API budget checks run when the task starts.'}
              </small>
            </>
          )}
        </div>
      )}
      <div className="composer-bottom">
        <button type="button" className="text-button" onClick={() => setAdvanced(!advanced)}>
          {advanced ? '− Hide task options' : '+ Task options'}
        </button>
        <span>Files stay in your selected project</span>
      </div>
      {!workspaces.length && (
        <div className="inline-note">
          Choose a folder and connect a model to begin.{' '}
          <button type="button" onClick={onSetup}>
            Open setup →
          </button>
        </div>
      )}
      {advanced && (
        <div className="advanced">
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
                  {m.label} · {m.provider}
                </option>
              ))}
            </select>
            <small>Use a specific model for this task. Automatic routing is the default.</small>
          </label>
          <label>
            Available tools
            <div className="checks">
              {['files', 'shell', 'web', 'browser', 'artifacts'].map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    checked={caps.includes(c)}
                    onChange={() =>
                      setCaps(caps.includes(c) ? caps.filter((x) => x !== c) : [...caps, c])
                    }
                  />
                  {c}
                </label>
              ))}
            </div>
          </label>
          <label>
            What should the finished result contain?
            <input
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="A sourced comparison and a one-page recommendation"
            />
          </label>
          <div className="two-columns">
            <label>
              Expected files · one per line
              <textarea
                value={files}
                onChange={(e) => setFiles(e.target.value)}
                placeholder="artifacts/report.pdf"
                rows={2}
              />
            </label>
            <label>
              Project attachments · one per line
              <textarea
                value={attachments}
                onChange={(e) => setAttachments(e.target.value)}
                placeholder="brief.md"
                rows={2}
              />
            </label>
          </div>
          <label>
            Verification command
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npm test"
            />
          </label>
        </div>
      )}
    </form>
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
          className={
            'status-chip ' +
            (t.status === 'completed' && t.review?.status === 'unverified'
              ? 'unverified'
              : t.status)
          }
        >
          {t.status === 'completed' && t.review?.status === 'unverified'
            ? 'Saved · checks incomplete'
            : statusLabel(t.status)}
        </span>
      </div>
      {t.route && (
        <div className="route-card">
          <div className="route-icon">↗</div>
          <div>
            <b>{t.route.model}</b>
            <p>{t.route.reason}</p>
          </div>
          <span className="tag">{t.route.provider}</span>
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
                  <small>{(a.bytes / 1024).toFixed(1)} KB · version recorded</small>
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
                ? 'Checks passed'
                : t.review.status === 'failed'
                  ? 'Checks found issues'
                  : 'Checks incomplete'}
            </b>
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
          {detail.feedback && <small>Saved for future routing choices.</small>}
        </div>
      )}
      {preview && (
        <div className="modal-backdrop">
          <div className="modal preview-modal">
            <div className="section-heading">
              <h2>{preview.path}</h2>
              <button onClick={() => setPreview(undefined)}>Close</button>
            </div>
            {/\.(md|txt|html|pdf|png)$/i.test(preview.path) ? (
              <iframe title={preview.path} sandbox="" src={'/api/artifacts/' + preview.id} />
            ) : (
              <p>
                This format opens in its document application.{' '}
                <a href={'/api/artifacts/' + preview.id + '?download=1'}>Download file</a>
              </p>
            )}
          </div>
        </div>
      )}
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
                  {attempt.provider === 'codex' ? 'Codex' : 'Claude'} · {attempt.modelId}
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
          <span>
            <i className="live-dot" /> {statusLabel(t.status)} · work is being saved
          </span>
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
    [name, setName] = useState(''),
    [path, setPath] = useState(''),
    [allowed, setAllowed] = useState(['codex', 'claude', 'openrouter']),
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
      <h1>Connect and get started</h1>
      <p className="intro">Connect your accounts, choose your models, then give DUKE a task.</p>
      <div className="section-heading">
        <h2>Model connections</h2>
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
                ? 'ChatGPT subscription via Codex app-server'
                : p === 'claude'
                  ? 'Your account through Claude Code on this Mac'
                  : p === 'openrouter'
                    ? 'Optional: individual models through an API'
                    : 'Task difficulty assessment and automatic model selection'}
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
                <p>Use Claude Code’s own sign-in flow for your account.</p>
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
                  Console accounts use separate API billing. DUKE currently routes Claude tasks
                  through subscriptions; connecting Console does not enable paid execution.
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
                      Opens Claude Code in Terminal for API keys, cloud providers and other options.
                      Account changes there also apply to DUKE. When finished, choose Check
                      connections.
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
          <p>DUKE uses Claude’s own sign-in flow. Your account status updates when it finishes.</p>
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
      <section className="settings-section">
        <div className="section-heading">
          <h2>Projects</h2>
          <span>Only the folders you choose</span>
        </div>
        {data.workspaces.map((w: Workspace) => (
          <div className="workspace-row" key={w.id}>
            <span className="file-icon">▱</span>
            <div>
              <b>{w.name}</b>
              <small>{w.path}</small>
              <small>
                {w.instructions.length} imported instruction file
                {w.instructions.length === 1 ? '' : 's'}
              </small>
            </div>
            <button onClick={() => setImportW(w.id)}>Import instructions</button>
            <button onClick={() => setEditWorkspace(w)}>Project settings</button>
          </div>
        ))}
        <form
          className="form-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api('/workspaces', { name, path, providers: allowed });
              setName('');
              setPath('');
            });
          }}
        >
          <div className="two-columns">
            <label>
              Project name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My project"
                required
              />
            </label>
            <label>
              Absolute folder path
              <div className="folder-input">
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/Users/you/Projects/my-project"
                  required
                />
                {data.desktop && (
                  <button
                    type="button"
                    aria-label="Choose project folder"
                    onClick={() =>
                      act(async () => {
                        const selected = await api('/system/choose-folder', {});
                        if (selected.path) {
                          setPath(selected.path);
                          if (!name) setName(selected.path.split('/').pop());
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
          <div className="checks">
            {['codex', 'claude', 'openrouter'].map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={allowed.includes(p)}
                  onChange={() =>
                    setAllowed(
                      allowed.includes(p) ? allowed.filter((a) => a !== p) : [...allowed, p],
                    )
                  }
                />
                {providers[p as keyof typeof providers]}
              </label>
            ))}
          </div>
          <p className="quiet">
            Jev assesses your tasks and chooses the model automatically. Select which accounts can
            carry out this project’s work.
          </p>
          <button disabled={busy || !allowed.length}>Add project</button>
        </form>
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
            <p className="quiet">
              Jev assesses your tasks and chooses from the accounts selected above automatically.
            </p>
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
            <p>The key is saved in your Mac’s Keychain. It is never included in task exports.</p>
            {keyProvider === 'jev' && (
              <p>
                Jev chooses the model and checks the result automatically. It receives your task
                brief, bounded excerpts of selected attachments, task files read by the worker,
                deliverables, progress, retrieved source excerpts, and model profiles. Imported
                personal instructions and setup files are not included directly. Its requests use
                your API budget.
              </p>
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
            <p>
              Review a Markdown or text file before making it part of this project’s task context.
            </p>
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
function ModelCard({ model, act, busy }: { model: Model; act: any; busy: boolean }) {
  const [m, setM] = useState(model),
    [endpoints, setEndpoints] = useState<any[]>([]);
  useEffect(() => setM(model), [JSON.stringify(model)]);
  return (
    <details className="model-card">
      <summary>
        <div>
          <b>{model.label}</b>
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
            Your declared evaluation covers {Object.keys(m.quality).join(', ')}. Declared difficulty
            limit: {m.maxDifficulty ?? 'routine'}. Other work uses the initial catalog profile;
            these declarations are not DUKE benchmark results.
          </p>
        )}
        {!!m.feedback && m.feedback.worked + m.feedback.needsWork > 0 && (
          <p className="quiet">
            Your feedback: {m.feedback.worked} worked · {m.feedback.needsWork} needs work
          </p>
        )}
        {!!m.observations?.length && (
          <p className="quiet">
            Local automatic checks: {m.observations.reduce((n, o) => n + o.passed, 0)} passed ·{' '}
            {m.observations.reduce((n, o) => n + o.failed, 0)} found issues ·{' '}
            {m.observations.reduce((n, o) => n + o.unverified, 0)} incomplete. These are
            observations from your tasks, not benchmark scores.
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
            <small>Shared with Jev when it chooses a model.</small>
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
    .flatMap((m: Model) => m.efficiency ?? []);
  const evidenceTasks = evidence.reduce((n: number, e: any) => n + e.tasks, 0);
  const sampledTasks = evidence.reduce((n: number, e: any) => n + e.sampledTasks, 0);
  const recoveredTasks = evidence.reduce(
    (n: number, e: any) => n + (e.recoveredSuccessful ?? 0),
    0,
  );
  const recoveryUnknown = evidence.reduce((n: number, e: any) => n + (e.recoveryUnknown ?? 0), 0);
  return (
    <div className="page">
      <span className="eyebrow">Clear limits, visible choices</span>
      <h1>Make every route count.</h1>
      <p className="intro">
        See reported token use alongside subscription capacity and API spending.
      </p>
      <div className="usage-preferences">
        <UsageDisplaySelect
          value={data.preferences?.usageDisplay ?? 'compact'}
          disabled={busy}
          onChange={(usageDisplay) => void act(() => api('/preferences', { usageDisplay }, 'PUT'))}
        />
        <p className="quiet">
          Choose what stays visible while you work. Routing and budget limits stay active in every
          display mode.
        </p>
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
          <small>Uncertain charges stay counted in their original budget windows.</small>
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
          incomplete token reports. No savings estimate is claimed before comparable results exist.
        </p>
      </div>
      <div className="notice">
        These spending totals cover this app. Day and month boundaries use {data.settings.timezone}.
        Subscription usage is never counted as API dollars.
      </div>
      <section className="notice" aria-label="Learning evidence">
        <b>
          {sampledTasks} of {evidenceTasks} eligible past tasks have complete checks and usage
        </b>
        <p>
          DUKE can compare these results for your selected models under the current settings. Other
          results stay visible with their limitations. No grading is required.
        </p>
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
          <p className="quiet">
            {s.jevMode === 'assist'
              ? 'Jev assesses your task, chooses a capable model, and checks the result. Local check outcomes inform later choices; your feedback is optional.'
              : 'Routing diagnostics are active. Restore Automatic selection below for normal Jev routing.'}
          </p>
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
            <p className="quiet">
              Jev assesses task difficulty, chooses a qualified model, and DUKE starts it
              automatically. It receives bounded task evidence and checks the deliverable.
              Capability-first rules handle uncertain selections. Shadow test is an optional
              diagnostic mode.
            </p>
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
          Account-wide usage includes other apps. Each window has its own allowance and reset time.
          Readings older than 15 minutes need a refresh.
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
