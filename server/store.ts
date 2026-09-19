import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import { summarizeUsage } from './usage.js';
import { summarizeSubscriptionUsage } from './subscription-usage.js';
import {
  defaults,
  now,
  Blocked,
  type Task,
  type Event,
  type Settings,
  type Approval,
  type SpendingEntry,
} from './types.js';

export class Store {
  db: DatabaseSync;
  changes = new EventEmitter();
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    const version = (this.db.prepare('PRAGMA user_version').get() as any).user_version;
    if (version > 1) {
      this.db.close();
      throw new Blocked('Database was created by a newer router version.');
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities(kind TEXT,key TEXT,json TEXT NOT NULL,PRIMARY KEY(kind,key));
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,taskId TEXT,kind TEXT,data TEXT,at TEXT);
      CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS spending(id TEXT PRIMARY KEY,taskId TEXT,provider TEXT,day TEXT,month TEXT,reserved INTEGER,actual INTEGER,state TEXT,reference TEXT,at TEXT);
      PRAGMA user_version=1;`);
  }
  settings(): Settings {
    return { ...defaults, ...this.get<Partial<Settings>>('settings', 'main') };
  }
  get<T>(kind: string, key: string): T | undefined {
    const r = this.db
      .prepare('SELECT json FROM entities WHERE kind=? AND key=?')
      .get(kind, key) as any;
    return r ? JSON.parse(r.json) : undefined;
  }
  list<T>(kind: string): T[] {
    return this.db
      .prepare('SELECT json FROM entities WHERE kind=? ORDER BY key')
      .all(kind)
      .map((r: any) => JSON.parse(r.json));
  }
  put(kind: string, key: string, value: unknown) {
    this.db
      .prepare('INSERT OR REPLACE INTO entities VALUES(?,?,?)')
      .run(kind, key, JSON.stringify(value));
    this.changes.emit('change');
  }
  remove(kind: string, key: string) {
    this.db.prepare('DELETE FROM entities WHERE kind=? AND key=?').run(kind, key);
    this.changes.emit('change');
  }
  tasks(): Task[] {
    return this.db
      .prepare('SELECT json FROM tasks ORDER BY rowid DESC')
      .all()
      .map((r: any) => JSON.parse(r.json));
  }
  task(id: string): Task {
    const r = this.db.prepare('SELECT json FROM tasks WHERE id=?').get(id) as any;
    if (!r) throw new Blocked('Task not found');
    return JSON.parse(r.json);
  }
  save(task: Task) {
    task.updatedAt = now();
    this.db.prepare('INSERT OR REPLACE INTO tasks VALUES(?,?)').run(task.id, JSON.stringify(task));
    this.changes.emit('change');
  }
  update(id: string, patch: Partial<Task>) {
    const task = { ...this.task(id), ...patch };
    this.save(task);
    return task;
  }
  event(taskId: string, kind: string, data: unknown) {
    const at = now();
    const r = this.db
      .prepare('INSERT INTO events(taskId,kind,data,at) VALUES(?,?,?,?)')
      .run(taskId, kind, JSON.stringify(data), at);
    const event = { id: Number(r.lastInsertRowid), taskId, kind, data, at };
    this.changes.emit('event', event);
    return event;
  }
  events(id: string, after = 0): Event[] {
    return this.db
      .prepare('SELECT * FROM events WHERE taskId=? AND id>? ORDER BY id')
      .all(id, after)
      .map((r: any) => ({ ...r, data: JSON.parse(r.data) }));
  }
  approvals(): Approval[] {
    return this.db
      .prepare('SELECT json FROM approvals ORDER BY rowid')
      .all()
      .map((r: any) => JSON.parse(r.json));
  }
  approval(a: Approval) {
    this.db.prepare('INSERT OR REPLACE INTO approvals VALUES(?,?)').run(a.id, JSON.stringify(a));
    this.changes.emit('change');
  }
  recover() {
    for (const t of this.tasks())
      if (['routing', 'running', 'verifying', 'awaiting_approval'].includes(t.status)) {
        this.update(t.id, {
          status: 'interrupted',
          usage: summarizeUsage(this.events(t.id)),
          subscriptionUsage: summarizeSubscriptionUsage(this.events(t.id)),
          error: 'App restarted. Review the last checkpoint before resuming.',
        });
        this.event(t.id, 'interrupted', { reason: 'restart' });
      }
    for (const a of this.approvals())
      if (a.status === 'pending') this.approval({ ...a, status: 'expired' });
  }
  periods(date = new Date()) {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.settings().timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return { day, month: day.slice(0, 7) };
  }
  spend(date = new Date()) {
    const { day, month } = this.periods(date);
    const sum = (col: string, v: string) =>
      Number(
        (
          this.db
            .prepare(
              `SELECT COALESCE(SUM(CASE WHEN actual IS NULL THEN reserved ELSE actual END),0) AS n FROM spending WHERE ${col}=?`,
            )
            .get(v) as any
        ).n,
      ) / 1e6;
    return {
      day: sum('day', day),
      month: sum('month', month),
      ...this.settings(),
      unreconciled: Number(
        (this.db.prepare("SELECT COUNT(*) n FROM spending WHERE state='reserved'").get() as any).n,
      ),
    };
  }
  reserve(taskId: string, provider: string, dollars: number, date = new Date()) {
    if (!Number.isFinite(dollars) || dollars < 0)
      throw new Blocked('Unknown request price. Paid execution is disabled.');
    const micro = Math.ceil(dollars * 1e6);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const s = this.spend(date);
      if (s.day + micro / 1e6 > s.dailyLimit || s.month + micro / 1e6 > s.monthlyLimit)
        throw new Blocked(
          'API budget cannot cover this request. Choose an included route or wait for the budget window.',
        );
      const id = randomUUID(),
        p = this.periods(date);
      this.db
        .prepare('INSERT INTO spending VALUES(?,?,?,?,?,?,NULL,?,?,?)')
        .run(id, taskId, provider, p.day, p.month, micro, 'reserved', '', now());
      this.db.exec('COMMIT');
      this.changes.emit('change');
      return id;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  settle(id: string, dollars: number, reference = '') {
    if (!Number.isFinite(dollars) || dollars < 0) throw new Error('Invalid usage');
    this.db
      .prepare(
        "UPDATE spending SET actual=?,state='settled',reference=? WHERE id=? AND state='reserved'",
      )
      .run(Math.ceil(dollars * 1e6), reference, id);
    this.changes.emit('change');
  }
  reconcileSpending(
    id: string,
    input: { actualUSD: number; reservedMicros: number; note: string },
  ) {
    if (
      !Number.isFinite(input.actualUSD) ||
      input.actualUSD < 0 ||
      input.actualUSD > 1_000_000 ||
      !input.note.trim() ||
      input.note.length > 2000
    )
      throw new Blocked('Enter a verified non-negative charge and its billing reference.');
    this.db.exec('BEGIN IMMEDIATE');
    let receipt;
    try {
      const row = this.db.prepare('SELECT * FROM spending WHERE id=?').get(id) as any;
      if (
        !row ||
        row.state !== 'reserved' ||
        row.actual !== null ||
        row.reserved !== input.reservedMicros
      )
        throw new Blocked('This request changed or was already reconciled. Refresh the ledger.');
      const task = this.tasks().find((t) => t.id === row.taskId);
      if (
        task &&
        ['queued', 'routing', 'running', 'verifying', 'awaiting_approval'].includes(task.status)
      )
        throw new Blocked('Wait for this task to stop before reconciling its charge.');
      receipt = {
        id,
        taskId: row.taskId,
        provider: row.provider,
        reservedMicros: row.reserved,
        actualMicros: Math.ceil(input.actualUSD * 1e6),
        note: input.note.trim(),
        at: now(),
        source: 'user-verified-provider-billing',
      };
      this.db
        .prepare("UPDATE spending SET actual=?,state='reconciled' WHERE id=? AND state='reserved'")
        .run(receipt.actualMicros, id);
      this.db
        .prepare('INSERT INTO entities(kind,key,json) VALUES(?,?,?)')
        .run('spending_reconciliation', id, JSON.stringify(receipt));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    this.changes.emit('change');
    return receipt;
  }
  spending() {
    return (
      this.db.prepare('SELECT * FROM spending ORDER BY at DESC').all() as unknown as SpendingEntry[]
    ).map((row) => ({
      ...row,
      reconciliation: this.get<SpendingEntry['reconciliation']>('spending_reconciliation', row.id),
    }));
  }
  close() {
    this.db.close();
  }
}
