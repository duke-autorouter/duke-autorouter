import React, { useState } from 'react';

type Entry = {
  id: string;
  provider: string;
  reserved: number;
  actual: number | null;
  state: string;
  at: string;
  reconciliation?: { note: string; at: string };
};
type Props = {
  entries: Entry[];
  busy: boolean;
  api: (path: string, body?: unknown) => Promise<any>;
  act: (fn: () => Promise<any>) => Promise<any>;
  refresh: () => Promise<void>;
};
const amount = (micros: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 6,
  }).format(micros / 1e6);

export function SpendingLedger({ entries, busy, api, act, refresh }: Props) {
  const [selected, setSelected] = useState('');
  const entry = entries.find((r) => r.id === selected && r.state === 'reserved');
  return (
    <section className="ledger" aria-label="API request ledger">
      <p className="quiet">
        Check the provider’s billing record before confirming an uncertain charge.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider / date</th>
            <th>Reserved</th>
            <th>Actual</th>
            <th>Status</th>
            <th>Billing review</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((r) => (
            <tr key={r.id}>
              <td>
                {r.provider}
                <small>{new Date(r.at).toLocaleString()}</small>
              </td>
              <td>{amount(r.reserved)}</td>
              <td>{r.actual === null ? 'Unknown' : amount(r.actual)}</td>
              <td>{r.state}</td>
              <td>
                {r.state === 'reserved' ? (
                  <button disabled={busy} onClick={() => setSelected(r.id)}>
                    Review charge
                  </button>
                ) : (
                  r.reconciliation && (
                    <span title={r.reconciliation.at}>{r.reconciliation.note}</span>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!entries.length && <p>No paid requests recorded.</p>}
      {entry && (
        <ReconcileCharge
          key={entry.id}
          entry={entry}
          busy={busy}
          close={() => setSelected('')}
          save={(body) =>
            act(async () => {
              await api('/spending/' + encodeURIComponent(entry.id) + '/reconcile', body);
              await refresh();
              setSelected('');
            })
          }
        />
      )}
    </section>
  );
}

function ReconcileCharge({
  entry,
  busy,
  close,
  save,
}: {
  entry: Entry;
  busy: boolean;
  close: () => void;
  save: (body: unknown) => Promise<any>;
}) {
  const [charge, setCharge] = useState(''),
    [note, setNote] = useState('');
  return (
    <form
      className="form-panel charge-review"
      aria-label="Review uncertain charge"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ actualUSD: Number(charge), reservedMicros: entry.reserved, note });
      }}
    >
      <h3>Record the verified {entry.provider} charge</h3>
      <p>
        Updates DUKE’s records only; no charge or refund is issued. Use zero only for a confirmed $0
        charge.
      </p>
      <label>
        Verified charge (USD)
        <input
          type="number"
          required
          min="0"
          max="1000000"
          step="any"
          value={charge}
          onChange={(e) => setCharge(e.target.value)}
        />
      </label>
      <label>
        Billing reference or verification note
        <input
          required
          minLength={5}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Provider request ID or billing record checked"
        />
      </label>
      <div className="button-row">
        <button className="primary" disabled={busy || charge === '' || note.trim().length < 5}>
          Record verified charge
        </button>
        <button type="button" disabled={busy} onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
