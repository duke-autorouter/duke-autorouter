import React, { useState } from 'react';
import type { Model } from '../server/types';
import { ROSTER_LIMIT, workLabels, workTypes, type WorkPreferences } from '../shared/routing';
import { ImportDialog } from './SetupImport';

type Props = {
  models: Model[];
  needsReview?: boolean;
  preferences: WorkPreferences;
  busy: boolean;
  act: (fn: () => Promise<any>) => Promise<any>;
  api: (path: string, body?: unknown, method?: string) => Promise<any>;
  renderModel: (model: Model) => React.ReactNode;
};

export function ModelRoster(props: Props) {
  const [editing, setEditing] = useState(false);
  const selected = props.models.filter((m) => m.enabled);
  return (
    <section className="settings-section" aria-label="My models">
      <div className="section-heading">
        <h2>My models</h2>
        <span>{selected.length} selected</span>
      </div>
      <p className="quiet">
        Choose a small set of models you want DUKE to use. Jev assesses each task and chooses from
        this set, aiming to use only what the task needs.
      </p>
      {props.needsReview && (
        <div className="notice">
          Choose your models once to finish this update. Your connections and saved settings are
          still here; the previously discovered catalog is available under Choose models.
        </div>
      )}
      {!selected.length && (
        <div className="empty-state">Choose at least one model to start routing.</div>
      )}
      <div className="model-list">{selected.map(props.renderModel)}</div>
      <button disabled={props.busy} className="primary" onClick={() => setEditing(true)}>
        Choose models
      </button>
      <p className="quiet">
        Refreshing a connection adds choices to the catalog. It keeps your selection unchanged.
      </p>
      {!!selected.length && (
        <details className="work-preferences">
          <summary>
            Starting preferences <span className="quiet">· optional</span>
          </summary>
          <p className="quiet">
            Have a favorite for a type of work? Give Jev a starting point. It can choose another of
            your models when the task is harder, the preferred model is unavailable, or results
            support a more efficient choice.
          </p>
          <PreferenceForm {...props} />
        </details>
      )}
      <p className="quiet">
        DUKE starts with model descriptions and your preferences. It uses automatic checks and
        reported token usage from completed tasks to improve future choices. No scores or grading
        required.
      </p>
      {editing && <RosterDialog {...props} close={() => setEditing(false)} />}
    </section>
  );
}

function RosterDialog({ models, busy, act, api, close }: Props & { close: () => void }) {
  const [chosen, setChosen] = useState(
    () => new Set(models.filter((m) => m.enabled).map((m) => m.id)),
  );
  const [query, setQuery] = useState(''),
    [provider, setProvider] = useState(''),
    [limit, setLimit] = useState(60);
  const visible = models.filter(
    (m) =>
      (!provider || m.provider === provider) &&
      `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <ImportDialog
      label="Choose models"
      close={() => {
        if (!busy) close();
      }}
    >
      <h2>Choose your models</h2>
      <p>
        Select the models DUKE may use. A handful is a good starting point; you can change this
        later.
      </p>
      <div className="two-columns">
        <label>
          Search models
          <input
            autoFocus
            value={query}
            placeholder="Name or model ID"
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(60);
            }}
          />
        </label>
        <label>
          Connection
          <select
            aria-label="Connection"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setLimit(60);
            }}
          >
            <option value="">All connections</option>
            <option value="codex">Codex</option>
            <option value="claude">Claude</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
      </div>
      <p aria-live="polite">
        {chosen.size} selected across {models.length} available models · {visible.length} matching{' '}
        {visible.length === 1 ? 'model' : 'models'}
      </p>
      <div className="roster-choices">
        {visible.slice(0, limit).map((m) => (
          <label className="roster-choice" key={m.id}>
            <input
              type="checkbox"
              checked={chosen.has(m.id)}
              disabled={busy || (!chosen.has(m.id) && chosen.size >= ROSTER_LIMIT)}
              onChange={(e) =>
                setChosen((previous) => {
                  const next = new Set(previous);
                  if (e.target.checked) next.add(m.id);
                  else next.delete(m.id);
                  return next;
                })
              }
            />
            <span>
              <b>{m.label}</b>
              <small>{m.id}</small>
              <small>
                {m.provider === 'openrouter'
                  ? `API · ${m.inputPrice === undefined ? 'input price unknown' : `$${m.inputPrice}/M input`} · ${m.outputPrice === undefined ? 'output price unknown' : `$${m.outputPrice}/M output`}`
                  : 'Subscription allowance'}{' '}
                · {m.contextLimit.toLocaleString()} token context
              </small>
            </span>
          </label>
        ))}
        {!models.length && <p>Connect an account or refresh its models above, then return here.</p>}
        {!!models.length && !visible.length && <p>No models match this search.</p>}
        {visible.length > limit && (
          <button type="button" onClick={() => setLimit((n) => n + 60)}>
            Show more models
          </button>
        )}
      </div>
      {chosen.size >= ROSTER_LIMIT && (
        <p className="quiet">Your roster can contain up to {ROSTER_LIMIT} models.</p>
      )}
      {!chosen.size && <p className="quiet">Routing will wait until you select a model.</p>}
      <div className="button-row">
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            act(async () => {
              await api('/roster', { modelIds: [...chosen] }, 'PUT');
              close();
            })
          }
        >
          Save model selection
        </button>
        <button disabled={busy} onClick={close}>
          Cancel
        </button>
      </div>
    </ImportDialog>
  );
}

function PreferenceForm({ models, preferences, busy, api, act }: Props) {
  const [draft, setDraft] = useState(preferences),
    [saved, setSaved] = useState(false);
  const selected = models.filter((m) => m.enabled);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act(async () => {
          await api('/routing-preferences', draft, 'PUT');
          setSaved(true);
        });
      }}
    >
      <div className="preference-grid">
        {workTypes.map((work) => (
          <label key={work}>
            {workLabels[work]}
            <select
              aria-label={workLabels[work]}
              value={draft[work] ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setSaved(false);
                setDraft((previous) => {
                  const next = { ...previous };
                  if (value) next[work] = value;
                  else delete next[work];
                  return next;
                });
              }}
            >
              <option value="">Let DUKE decide</option>
              {draft[work] && !selected.some((m) => m.id === draft[work]) && (
                <option value={draft[work]} disabled>
                  {models.find((m) => m.id === draft[work])?.label ?? draft[work]} — outside my
                  models
                </option>
              )}
              {selected.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.provider}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button disabled={busy}>Save preferences</button>
      {saved && (
        <span className="quiet" role="status">
          {' '}
          Preferences saved.
        </span>
      )}
    </form>
  );
}
