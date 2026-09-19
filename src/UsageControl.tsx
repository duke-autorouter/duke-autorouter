import { useEffect, useRef, useState } from 'react';
import {
  subscriptionView,
  subscriptionHeadline,
  usageAttention,
  type SubscriptionView,
  type UsageDisplay,
  type UsageHealth,
  type UsagePreferences,
} from '../shared/usage-display';

type UsageData = {
  preferences?: UsagePreferences;
  health: UsageHealth[];
  spend: { day: number; month: number; unreconciled: number };
  settings: { dailyLimit: number; monthlyLimit: number; timezone: string };
};
type API = (path: string, body?: unknown, method?: string) => Promise<unknown>;
const dollars = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 3,
  }).format(n);
const when = (n: number) =>
  new Date(n).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function useClock() {
  const [at, setAt] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setAt(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return at;
}

function AllowanceWindow({
  view,
  window,
}: {
  view: SubscriptionView;
  window: SubscriptionView['windows'][number];
}) {
  return (
    <div className={'usage-window ' + window.state}>
      <div className="usage-row">
        <span>
          {window.scope ? `${window.scope} · ` : ''}
          {window.label}
        </span>
        <strong>
          {window.state === 'reset'
            ? 'Refresh needed'
            : window.usedPercent === undefined
              ? 'Not reported'
              : `${Math.floor(100 - window.usedPercent)}% left${window.state === 'stale' ? ' (last known)' : ''}`}
        </strong>
      </div>
      {window.usedPercent !== undefined && window.state !== 'reset' && (
        <progress
          max={100}
          value={100 - window.usedPercent}
          aria-label={`${view.name} ${window.scope ?? ''} ${window.label} remaining${window.state === 'stale' ? ', last known' : ''}`}
        />
      )}
      <small>
        {window.state === 'reset'
          ? 'Reset time passed. Refresh for the new allowance.'
          : window.resetsAt
            ? `Resets ${when(window.resetsAt * 1000)}`
            : 'Reset time not reported'}
      </small>
    </div>
  );
}

function SubscriptionCard({
  view,
  compact = false,
}: {
  view: SubscriptionView;
  compact?: boolean;
}) {
  const primary = compact ? view.windows.filter((w) => !w.scope) : view.windows;
  const scoped = compact ? view.windows.filter((w) => w.scope) : [];
  return (
    <section className="subscription-card" aria-label={`${view.name} subscription`}>
      <div className="usage-row">
        <h3>{view.name}</h3>
        <span className="usage-status">
          {view.connectionLabel ??
            (view.connected
              ? view.windows.length
                ? view.fresh
                  ? 'Updated'
                  : 'Last known'
                : 'Not reported'
              : 'Not connected')}
        </span>
      </div>
      {view.blocked && <p className="usage-warning">Subscription limit reached.</p>}
      {view.connectionNote ? (
        <p>{view.connectionNote}</p>
      ) : !view.connected ? (
        <p>Connect your account in Connections & setup.</p>
      ) : !view.windows.length ? (
        <p>Allowance unavailable. Refresh to check what this account reports.</p>
      ) : (
        <>
          {primary.map((window) => (
            <AllowanceWindow key={window.id} view={view} window={window} />
          ))}
          {!!scoped.length && (
            <details className="usage-model-windows" open={!primary.length || undefined}>
              <summary>Model allowances ({scoped.length})</summary>
              {scoped.map((window) => (
                <AllowanceWindow key={window.id} view={view} window={window} />
              ))}
            </details>
          )}
        </>
      )}
      {view.error && <p className="usage-warning">{view.error}</p>}
      {view.connected && (
        <small className="usage-updated">
          {view.checkedAt
            ? `Checked ${when(Date.parse(view.checkedAt))}${view.fresh ? '' : ' · refresh needed'}`
            : 'Not checked yet'}
        </small>
      )}
      {view.experimental && view.connected && (
        <small
          className="usage-source"
          title="Uses an experimental interface in the pinned Claude runtime."
        >
          Usage availability may vary.
        </small>
      )}
    </section>
  );
}

export function SubscriptionCards({ health }: { health: UsageHealth[] }) {
  const at = useClock();
  return (
    <div className="subscription-cards">
      {(['codex', 'claude'] as const).map((p) => (
        <SubscriptionCard
          key={p}
          view={subscriptionView(
            p,
            health.find((h) => h.provider === p),
            at,
          )}
        />
      ))}
    </div>
  );
}

export function UsageDisplaySelect({
  value,
  disabled,
  onChange,
}: {
  value: UsageDisplay;
  disabled?: boolean;
  onChange: (value: UsageDisplay) => void;
}) {
  return (
    <label className="usage-display-select">
      Show in header
      <select
        aria-label="Show in header"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as UsageDisplay)}
      >
        <option value="compact">Usage button only</option>
        <option value="api">API budget</option>
        <option value="subscriptions">Subscriptions</option>
        <option value="both">API budget and subscriptions</option>
      </select>
    </label>
  );
}

export function UsageControl({
  data,
  api,
  reload,
  onDetails,
}: {
  data: UsageData;
  api: API;
  reload: () => Promise<void>;
  onDetails: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const at = useClock();
  const views = (['codex', 'claude'] as const).map((p) =>
    subscriptionView(
      p,
      data.health.find((h) => h.provider === p),
      at,
    ),
  );
  const mode = data.preferences?.usageDisplay ?? 'compact';
  const attention = usageAttention(views, data.spend, data.settings);
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      await api('/usage/refresh', {});
      await reload();
    } catch {
      setError('Could not refresh usage. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }
  async function save(usageDisplay: UsageDisplay) {
    setSaving(true);
    setError('');
    try {
      await api('/preferences', { usageDisplay }, 'PUT');
      await reload();
    } catch {
      setError('Could not save the display preference. Please try again.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="usage-control">
      <div className="usage-pins" aria-label="Pinned usage">
        {(mode === 'api' || mode === 'both') && (
          <span>
            API <b>{dollars(data.spend.day)}</b> / {dollars(data.settings.dailyLimit)} today
          </span>
        )}
        {(mode === 'subscriptions' || mode === 'both') &&
          views.map((view) => <span key={view.provider}>{subscriptionHeadline(view)}</span>)}
      </div>
      <button
        className="usage-trigger"
        popoverTarget="usage-overview"
        aria-haspopup="dialog"
        title={attention.length ? attention.join('. ') : undefined}
      >
        {attention.length > 0 && <span className="usage-alert-dot" aria-hidden="true" />}
        Usage
        {attention.length > 0 && (
          <>
            <span className="usage-attention">Check limits</span>
            <span className="sr-only"> · {attention.join('. ')}</span>
          </>
        )}
        <span aria-hidden="true">⌄</span>
      </button>
      <div
        id="usage-overview"
        className="usage-popover"
        popover="auto"
        ref={panel}
        role="dialog"
        aria-labelledby="usage-title"
        onToggle={(event) => {
          if (event.newState === 'open') {
            panel.current?.querySelector('button')?.focus();
            void refresh();
          }
        }}
      >
        <div className="usage-row usage-heading">
          <h2 id="usage-title">Usage</h2>
          <button
            popoverTarget="usage-overview"
            popoverTargetAction="hide"
            aria-label="Close usage"
          >
            ×
          </button>
        </div>
        <p className="usage-description">Your subscriptions and API budget, in one place.</p>
        <section className="usage-api" aria-label="API budget">
          <h3>API budget</h3>
          <div className="usage-row">
            <span>Today</span>
            <strong>
              {dollars(data.spend.day)} <span>/ {dollars(data.settings.dailyLimit)}</span>
            </strong>
          </div>
          <div className="usage-row">
            <span>This month</span>
            <strong>
              {dollars(data.spend.month)} <span>/ {dollars(data.settings.monthlyLimit)}</span>
            </strong>
          </div>
          <small>DUKE only, including reserved and uncertain charges.</small>
        </section>
        <div className="usage-row usage-subheading">
          <h3>Subscriptions</h3>
          <button className="text-button" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? 'Refreshing…' : 'Refresh usage'}
          </button>
        </div>
        <p className="usage-description">Account-wide allowances, including use outside DUKE.</p>
        <div className="subscription-cards">
          {views.map((view) => (
            <SubscriptionCard key={view.provider} view={view} compact />
          ))}
        </div>
        {error && (
          <p role="alert" className="usage-warning">
            {error}
          </p>
        )}
        <UsageDisplaySelect value={mode} disabled={saving} onChange={(value) => void save(value)} />
        <small className="usage-source">
          This changes visibility only. Your routing and budget limits stay active. Small screens
          keep the button only.
        </small>
        <button
          className="usage-details"
          onClick={() => {
            panel.current?.hidePopover();
            onDetails();
          }}
        >
          Usage & routing settings <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
