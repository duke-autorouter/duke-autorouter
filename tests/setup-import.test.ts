import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  rm,
  symlink,
  rename,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { Store } from '../server/store.js';
import { SetupImporter, setupPrompt } from '../server/setup-import.js';
import { ToolService } from '../server/tools.js';
import { Approvals } from '../server/approval.js';
import { Engine } from '../server/engine.js';
import { Jev } from '../server/adapters/jev.js';
import { ModelInput, type Workspace, type Worker } from '../server/types.js';
import { createApp } from '../server/app.js';
import type { SetupFile, SetupPreview, SetupSnapshot } from '../shared/setup.js';

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'duke-import-')));
  const source = join(root, 'setup'),
    state = join(root, 'state'),
    work = join(root, 'project');
  await mkdir(source);
  await mkdir(work);
  const store = new Store(join(state, 'router.sqlite'));
  const importer = new SetupImporter(store, state);
  const workspace: Workspace = {
    id: 'project',
    name: 'Project',
    path: work,
    providers: ['codex', 'claude', 'openrouter'],
    instructions: [],
  };
  store.put('workspace', workspace.id, workspace);
  const write = async (path: string, content: string) => {
    await mkdir(dirname(join(source, path)), { recursive: true });
    await writeFile(join(source, path), content);
  };
  const commit = (p: SetupPreview, patch: Record<string, unknown> = {}) =>
    importer.commit({
      previewId: p.id,
      name: 'Sample setup',
      mode: 'link',
      selected: p.files.filter((f) => f.selected).map((f) => f.path),
      ...patch,
    });
  const close = async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  };
  return { root, source, state, work, store, importer, workspace, write, commit, close };
}

test('folder discovery follows Markdown/wiki links, keeps one entry point, labels skill/role requirements and sanitizes settings', async () => {
  const f = await fixture();
  try {
    await f.write('AGENTS.md', '# Start here\nRead [[DESK]].');
    await f.write('CLAUDE.md', '# Other host\nDifferent instructions.');
    await f.write('DESK.md', 'Use [[VOICE_GUIDE]] then [current work](context/active.md).');
    await f.write('VOICE_GUIDE.md', 'Write like a considerate colleague.');
    await f.write('context/active.md', 'Read [[DESK]] only when needed.');
    await f.write(
      'skills/brief/SKILL.md',
      '---\nname: brief\nallowed-tools: [Read, Write]\n---\nUse [template](template.md).',
    );
    await f.write('skills/brief/template.md', '# Brief template\nState the decision first.');
    await f.write(
      '.claude/agents/reviewer.md',
      '---\nname: reviewer\ntools: [Read, mcp__service__send]\n---\nReview the draft.',
    );
    await f.write(
      '.claude/settings.json',
      JSON.stringify({
        outputStyle: 'concise',
        apiKey: 'never-transfer-this-value',
        hooks: { start: 'dangerous-command' },
      }),
    );
    await f.write(
      '.codex/config.toml',
      'language = "English"\nmodel = "ignored"\n[hooks]\nstart = "ignored"',
    );
    const p = await f.importer.preview(f.source);
    assert.equal(p.files.find((x) => x.path === 'AGENTS.md')?.selected, true);
    assert.equal(p.files.find((x) => x.path === 'CLAUDE.md')?.selected, false);
    assert.equal(p.files.find((x) => x.path === 'context/active.md')?.selected, true);
    assert.match(p.warnings.join(), /Reference cycle/);
    assert.equal(p.files.find((x) => x.path.endsWith('template.md'))?.selected, true);
    assert.equal(p.files.find((x) => x.kind === 'skill')?.status, 'ready');
    assert.equal(p.files.find((x) => x.kind === 'agent')?.status, 'needs_connection');
    assert.deepEqual(p.files.find((x) => x.kind === 'skill')?.requiredTools, ['Read', 'Write']);
    assert.doesNotMatch(JSON.stringify(p), /never-transfer|dangerous-command/);
    assert.deepEqual(JSON.parse(p.files.find((x) => x.path === '.claude/settings.json')!.content), {
      outputStyle: 'concise',
    });
    await assert.rejects(f.commit(p, { selected: ['AGENTS.md', 'CLAUDE.md'] }), /one entry point/);
    const setup = await f.commit(p);
    const snap = await f.importer.snapshot('first', f.workspace);
    assert.match(setupPrompt(snap, ['files']), /considerate colleague/);
    assert.equal(
      snap.files.find((x) => x.path.endsWith('template.md'))?.content,
      '# Brief template\nState the decision first.',
    );
    assert.equal(setup.mode, 'link');
  } finally {
    await f.close();
  }
});

test('Link updates the next task, existing snapshots stay stable, and new dependencies require review', async () => {
  const f = await fixture();
  try {
    await f.write('AGENTS.md', 'Original operating rules.');
    const setup = await f.commit(await f.importer.preview(f.source));
    const first = await f.importer.snapshot('first', f.workspace);
    await f.write('AGENTS.md', 'Updated rules. Read [[new-reference]].');
    await f.write('new-reference.md', 'Never silently added.');
    const second = await f.importer.snapshot('second', f.workspace);
    assert.equal(first.files[0].content, 'Original operating rules.');
    assert.deepEqual(await f.importer.snapshot('first', f.workspace), first);
    assert.match(second.files[0].content, /Updated/);
    assert.equal(second.files.length, 1);
    assert.match(second.warnings.join(), /not approved/);
    const review = await f.importer.preview(f.source, setup.id);
    assert.ok(review.changes!.added.includes('new-reference.md'));
    assert.equal(review.files.find((x) => x.path === 'new-reference.md')?.selected, false);
    await rm(join(f.source, 'AGENTS.md'));
    await assert.rejects(f.importer.snapshot('third', f.workspace), /Review the link/);
    assert.deepEqual(await f.importer.snapshot('first', f.workspace), first);
  } finally {
    await f.close();
  }
});

test('Copy is independent, edits are versioned, reviewed refresh detects concurrent edits, removal retains task receipts', async () => {
  const f = await fixture();
  try {
    await f.write('AGENTS.md', 'Initial copy.');
    let copy = await f.commit(await f.importer.preview(f.source), { mode: 'copy' });
    await f.write('AGENTS.md', 'Changed source.');
    assert.equal(
      (await f.importer.snapshot('first', f.workspace)).files[0].content,
      'Initial copy.',
    );
    copy = f.importer.edit(copy.id, {
      path: 'AGENTS.md',
      content: 'Edited in DUKE.',
      revision: copy.revision,
    });
    assert.equal(
      (await f.importer.snapshot('second', f.workspace)).files[0].content,
      'Edited in DUKE.',
    );
    assert.equal(await readFile(join(f.source, 'AGENTS.md'), 'utf8'), 'Changed source.');
    const preview = await f.importer.preview(f.source, copy.id);
    assert.deepEqual(preview.changes?.changed, ['AGENTS.md']);
    f.importer.edit(copy.id, {
      path: 'AGENTS.md',
      content: 'Another edit.',
      revision: copy.revision,
    });
    await assert.rejects(f.commit(preview, { mode: 'copy' }), /saved copy changed/);
    const fresh = await f.importer.preview(f.source, copy.id);
    await f.commit(fresh, { mode: 'copy' });
    assert.equal(
      (await f.importer.snapshot('third', f.workspace)).files[0].content,
      'Changed source.',
    );
    f.importer.remove(copy.id);
    assert.equal(f.store.list('setup').length, 0);
    assert.equal(
      f.store.get<SetupSnapshot>('setup_snapshot', 'second')?.files[0].content,
      'Edited in DUKE.',
    );
    assert.equal(await readFile(join(f.source, 'AGENTS.md'), 'utf8'), 'Changed source.');
  } finally {
    await f.close();
  }
});

test('source revalidation, unsafe paths, credentials, oversized files, symlinks, expired previews and missing roots fail locally', async () => {
  const f = await fixture();
  try {
    await f.write('AGENTS.md', 'Read [outside](../outside.md), [[missing]], and [key](.env).');
    await f.write('.env', 'SECRET=never');
    await f.write('auth.json', '{"token":"never"}');
    await f.write('credentials.md', 'SECRET');
    await f.write('too-large.md', 'x'.repeat(64001));
    await f.write('unsafe.md', 'A key: sk-' + 'a'.repeat(30));
    await f.write('private/key.md', 'secret');
    await writeFile(join(f.root, 'outside.md'), 'outside-content');
    await symlink(join(f.root, 'outside.md'), join(f.source, 'shortcut.md'));
    await symlink(f.root, join(f.source, 'escape'));
    const preview = await f.importer.preview(f.source);
    assert.doesNotMatch(
      JSON.stringify(preview),
      /outside-content|SECRET=never|"token":"never"|sk-aaa/,
    );
    assert.match(preview.warnings.join(), /symlink/);
    assert.match(preview.warnings.join(), /64 KB/);
    assert.match(preview.files[0].notes.join(), /Reference needs review/);
    await f.write('AGENTS.md', 'Changed after review.');
    await assert.rejects(f.commit(preview), /changed after preview/);
    assert.equal(f.store.list('setup').length, 0);
    const fresh = await f.importer.preview(f.source);
    fresh.createdAt = '2000-01-01T00:00:00Z';
    await assert.rejects(f.commit(fresh), /expired/);
    const linked = await f.commit(await f.importer.preview(f.source));
    await rm(join(f.source, 'AGENTS.md'));
    await symlink(join(f.root, 'outside.md'), join(f.source, 'AGENTS.md'));
    await assert.rejects(f.importer.snapshot('symlink', f.workspace), /Symlink/);
    await rename(f.source, join(f.root, 'moved'));
    await assert.rejects(
      f.importer.snapshot('missing', f.workspace),
      /linked folder is unavailable/,
    );
    assert.equal(f.importer.get(linked.id).root, f.source);
    await assert.rejects(f.importer.root(f.root), /private app data/);
    await assert.rejects(f.importer.root(f.state), /private app data/);
  } finally {
    await f.close();
  }
});

test('nested project rules require an explicit workspace mapping and never spill into another project', async () => {
  const f = await fixture();
  try {
    await f.write('VOICE_GUIDE.md', 'Shared personal style.');
    await f.write('projects/alpha/AGENTS.md', 'Alpha-specific rules.');
    await f.write('projects/beta/AGENTS.md', 'Beta-specific rules.');
    const preview = await f.importer.preview(f.source);
    await assert.rejects(f.commit(preview), /Choose a workspace/);
    assert.equal(f.store.list('workspace').length, 1);
    const setup = await f.commit(preview, {
      projects: { 'projects/alpha': 'create', 'projects/beta': 'create' },
    });
    const alpha = f.store.get<Workspace>('workspace', setup.bindings['projects/alpha'])!;
    const beta = f.store.get<Workspace>('workspace', setup.bindings['projects/beta'])!;
    assert.equal(f.store.list('workspace').length, 3);
    assert.match(
      setupPrompt(await f.importer.snapshot('alpha', alpha), ['files']),
      /Alpha-specific/,
    );
    assert.doesNotMatch(
      setupPrompt(await f.importer.snapshot('alpha', alpha), ['files']),
      /Beta-specific/,
    );
    assert.match(setupPrompt(await f.importer.snapshot('beta', beta), ['files']), /Beta-specific/);
    assert.doesNotMatch(
      setupPrompt(await f.importer.snapshot('other', f.workspace), ['files']),
      /Alpha-specific|Beta-specific/,
    );
    await rm(join(f.source, 'projects/beta/AGENTS.md'));
    assert.ok((await f.importer.snapshot('alpha-2', alpha)).files.length);
  } finally {
    await f.close();
  }
});

test('portable export/reimport preserves selected context without accounts, history or machine paths', async () => {
  const f = await fixture(),
    other = await fixture();
  try {
    await f.write('AGENTS.md', 'Use [[VOICE_GUIDE]].');
    await f.write('VOICE_GUIDE.md', 'Portable voice.');
    await f.write(
      '.claude/settings.json',
      JSON.stringify({ outputStyle: 'concise', apiKey: 'never-export-this', hooks: { run: 'no' } }),
    );
    const setup = await f.commit(await f.importer.preview(f.source), { mode: 'copy' });
    const bundle = await f.importer.export(
      setup.id,
      setup.files.map((f) => f.path),
    );
    assert.doesNotMatch(
      JSON.stringify(bundle),
      /never-export|hooks|\/Users\/|duke-import-|workspaceId|sourceHash/,
    );
    const imported = await other.commit(other.importer.bundlePreview(bundle), { mode: 'copy' });
    assert.equal(imported.root, undefined);
    assert.deepEqual(
      imported.files.map((f) => [f.path, f.content, f.sha256]),
      setup.files.map((f) => [f.path, f.content, f.sha256]),
    );
    await assert.rejects(
      other.commit(other.importer.bundlePreview(bundle), { mode: 'link' }),
      /Portable bundles/,
    );
    assert.throws(
      () =>
        other.importer.bundlePreview({
          ...bundle,
          files: [{ ...bundle.files[0], path: '../escape.md' }],
        }),
      /unsafe path/,
    );
    assert.throws(
      () => other.importer.bundlePreview({ ...bundle, files: [bundle.files[0], bundle.files[0]] }),
      /duplicate/,
    );
    f.importer.edit(setup.id, {
      path: 'AGENTS.md',
      content: 'Use /Users/example/private/file.md',
      revision: setup.revision,
    });
    await assert.rejects(f.importer.export(setup.id, ['AGENTS.md']), /absolute path/);
  } finally {
    await f.close();
    await other.close();
  }
});

test('portable settings preserve multiline values through copy, edits, export and reimport', async () => {
  const f = await fixture(),
    other = await fixture();
  try {
    const value = {
      outputStyle: 'Lead with the result.\nExample: two concise paragraphs.\nKeep newlines.',
      language: 'English',
    };
    await f.write('.claude/settings.json', JSON.stringify(value));
    const setup = await f.commit(await f.importer.preview(f.source), { mode: 'copy' });
    const path = '.claude/settings.json';
    assert.deepEqual(JSON.parse(setup.files[0].content), value);
    const edited = {
      ...value,
      outputStyle: value.outputStyle + '\nFinal note: use plain English.',
    };
    const copy = f.importer.edit(setup.id, {
      path,
      content: JSON.stringify(edited),
      revision: setup.revision,
    });
    const bundle = await f.importer.export(copy.id, [path]);
    const imported = await other.commit(other.importer.bundlePreview(bundle), { mode: 'copy' });
    assert.deepEqual(JSON.parse(imported.files[0].content), edited);
    assert.deepEqual(JSON.parse(await readFile(join(f.source, path), 'utf8')), value);
    const legacy = {
      ...bundle,
      files: [{ ...bundle.files[0], content: 'outputStyle: concise\nand kind\nlanguage: English' }],
    };
    assert.deepEqual(JSON.parse(other.importer.bundlePreview(legacy).files[0].content), {
      outputStyle: 'concise\nand kind',
      language: 'English',
    });
    for (const content of [
      'hooks: run-something',
      '{"outputStyle":false}',
      '{"outputStyle":"fine","model":"ignored"}',
    ]) {
      assert.throws(
        () => other.importer.bundlePreview({ ...bundle, files: [{ ...bundle.files[0], content }] }),
        /portable/,
      );
      assert.throws(
        () => f.importer.edit(copy.id, { path, content, revision: copy.revision }),
        /portable/,
      );
    }
    const emptied = f.importer.edit(copy.id, { path, content: '', revision: copy.revision });
    assert.equal(emptied.files[0].content, '');
  } finally {
    await f.close();
    await other.close();
  }
});

test('missing role references require review and credential directories are excluded', async () => {
  const f = await fixture();
  try {
    await f.write('AGENTS.md', 'Read [.gitconfig](.gitconfig) and [cluster](.kube/config).');
    await f.write(
      '.claude/agents/reviewer.md',
      '---\nname: reviewer\n---\nUse [rubric](missing.md).',
    );
    await f.write('.gitconfig', 'Private identity marker');
    await f.write('.kube/config', 'Private cluster marker');
    const p = await f.importer.preview(f.source);
    assert.equal(p.files.find((x) => x.kind === 'agent')?.status, 'review');
    assert.doesNotMatch(JSON.stringify(p.files), /Private identity marker|Private cluster marker/);
    const bundle = {
      format: 'duke-setup',
      version: 1,
      name: 'Bad path',
      files: [
        {
          path: '.docker/settings.json',
          content: '{}',
          kind: 'settings',
          scope: '.',
          core: false,
        },
      ],
    };
    assert.throws(() => f.importer.bundlePreview(bundle), /unsafe path/);
  } finally {
    await f.close();
  }
});

test('setup context reaches workers and persists; Jev sees task evidence without the private setup library', async () => {
  const f = await fixture();
  const tools = new ToolService(f.store, new Approvals(f.store), f.state);
  const jevCalls: any[] = [];
  const jev = new Jev(f.store, { get: async () => 'synthetic-key' } as any, async (_u, o) => {
    jevCalls.push(JSON.parse(String(o?.body)));
    return new Response('Synthetic unavailable response', { status: 503 });
  });
  const runs: string[] = [];
  const worker: Worker = {
    run: async (ctx) => {
      runs.push(ctx.model.provider);
      assert.match(ctx.prompt, /PRIVATE-VOICE-MARKER/);
      assert.doesNotMatch(ctx.prompt, /CHANGED-DURING-TASK/);
      const list = await ctx.tool('setup_list', {});
      const skill = list.files.find((x: SetupFile) => x.kind === 'skill');
      assert.ok(skill);
      const read = await ctx.tool('setup_read', { id: skill.id });
      assert.match(read.content, /Use the template/);
      const template = list.files.find((x: SetupFile) => x.path.endsWith('template.md'));
      const detail = await ctx.tool('setup_read', { id: template.id });
      await ctx.tool('write_file', { path: 'brief.md', content: detail.content });
      await assert.rejects(
        ctx.tool('setup_read', { id: '../../outside.md' }),
        /not part of this task/,
      );
      return 'Used the skill and saved its result.';
    },
  };
  const engine = new Engine(
    f.store,
    tools,
    { codex: worker, claude: worker, openrouter: worker },
    jev,
  );
  engine.stopped = true;
  try {
    await f.write('AGENTS.md', 'Use [[VOICE_GUIDE]].');
    await f.write('VOICE_GUIDE.md', 'PRIVATE-VOICE-MARKER');
    await f.write(
      'skills/brief/SKILL.md',
      '---\nname: brief\nallowed-tools: [Read, Write]\n---\nUse the template [here](template.md).',
    );
    await f.write('skills/brief/template.md', '# Decision\nEvidence first.');
    await f.commit(await f.importer.preview(f.source));
    for (const provider of ['codex', 'claude', 'openrouter'] as const) {
      f.store.put(
        'model',
        provider,
        ModelInput.parse({
          id: provider,
          model: 'fixture',
          label: provider,
          provider,
          enabled: true,
          evaluated: true,
          evidence: 'synthetic',
          maxDifficulty: 'complex',
          quality: { coding: 1, research: 1, writing: 1 },
          capabilities: ['files'],
          inputPrice: 0,
          outputPrice: 0,
          providerSlug: 'fixture',
          contextLimit: 128000,
          maxOutput: 1000,
        }),
      );
      const task = await engine.create({
        prompt: 'Write a brief',
        workspaceId: f.workspace.id,
        modelOverride: provider,
      });
      await engine.execute(task.id);
      assert.equal(
        f.store.task(task.id).status,
        'completed',
        f.store.task(task.id).error ?? provider,
      );
      if (provider === 'codex') {
        await f.write('VOICE_GUIDE.md', 'CHANGED-DURING-TASK');
        await engine.execute(task.id);
        await f.write('VOICE_GUIDE.md', 'PRIVATE-VOICE-MARKER');
      }
    }
    // An automatic task exercises the actual Jev transport boundary (stubbed above).
    const automatic = await engine.create({ prompt: 'Write a brief', workspaceId: f.workspace.id });
    await engine.execute(automatic.id);
    assert.ok(jevCalls.length > 0);
    assert.doesNotMatch(JSON.stringify(jevCalls), /PRIVATE-VOICE|CHANGED-DURING|template.md/);
    assert.doesNotMatch(
      JSON.stringify(jevCalls.filter((c) => c.questions.difficulty)),
      /Evidence first/,
    );
    assert.deepEqual(new Set(runs), new Set(['codex', 'claude', 'openrouter']));
    assert.match(await readFile(join(f.work, 'brief.md'), 'utf8'), /Evidence first/);
  } finally {
    await engine.shutdown();
    await f.close();
  }
});

test('authenticated HTTP importer round trip preserves legacy single-file import and exposes provenance without content in state', async () => {
  const f = await fixture();
  f.store.close();
  const r = await createApp({ stateDir: f.state, serveUI: false });
  try {
    await f.write('AGENTS.md', 'HTTP import rules.');
    const headers: Record<string, string> = { host: '127.0.0.1:4318' };
    const req = (method: any, url: string, payload?: any) =>
      r.app.inject({ method, url, payload, headers });
    assert.equal((await req('POST', '/api/setups/preview', { path: f.source })).statusCode, 401);
    const login = await req('POST', '/api/session', { token: r.launchToken });
    headers.cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join(';');
    const p = await req('POST', '/api/setups/preview', { path: f.source });
    assert.equal(p.statusCode, 200);
    const commit = await req('POST', '/api/setups', {
      previewId: p.json().id,
      name: 'HTTP fixture',
      mode: 'copy',
      selected: ['AGENTS.md'],
    });
    assert.equal(commit.statusCode, 200, commit.body);
    const state = (await req('GET', '/api/state')).json();
    assert.equal(state.setups.length, 1);
    assert.equal(Object.hasOwn(state.setups[0].files[0], 'content'), false);
    const single = await req('POST', '/api/workspaces/project/import-preview', {
      path: join(f.source, 'AGENTS.md'),
    });
    assert.equal(
      (await req('POST', '/api/workspaces/project/import', single.json())).statusCode,
      200,
    );
    assert.equal((await req('GET', '/api/state')).json().workspaces[0].instructions.length, 1);
    assert.equal((await req('DELETE', '/api/setups/' + commit.json().id)).statusCode, 200);
    assert.deepEqual((await req('GET', '/api/state')).json().setups, []);
  } finally {
    await r.app.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
