import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resource } from '../server/runtime.js';
import { runProcess, stopTree } from '../server/process.js';
import { packageApp } from './package-paths.js';

const resources = join(packageApp, 'Contents/Resources');
const node = join(resources, 'runtime/bin/node');
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', packageApp]);
const root = await mkdtemp(join(tmpdir(), 'duke-standalone-'));
const home = join(root, 'home'),
  state = join(root, 'state'),
  work = join(root, 'work');
await Promise.all([mkdir(home), mkdir(state), mkdir(work)]);
const env = {
  HOME: home,
  PATH: join(resources, 'runtime/bin') + ':/usr/bin:/bin:/usr/sbin:/sbin',
  TMPDIR: tmpdir(),
  LANG: 'en_US.UTF-8',
  NODE_ENV: 'production',
  ROUTER_DATA_DIR: state,
  PLAYWRIGHT_BROWSERS_PATH: join(resources, 'browsers'),
  PORT: '0',
  DUKE_DESKTOP_EXECUTABLE: 'standalone-test',
};
const receipts: string[] = [];
const pass = (name: string) => {
  receipts.push(name);
  console.log('PASS ' + name);
};
const plist = await readFile(join(packageApp, 'Contents/Info.plist'), 'utf8');
assert.match(plist, /<key>CFBundleIconFile<\/key><string>AppIcon<\/string>/);
assert.match(plist, /<key>LSUIElement<\/key><false\/>/);
const linkedFrameworks = execFileSync(
  '/usr/bin/otool',
  ['-L', join(packageApp, 'Contents/MacOS/DUKE Autorouter')],
  { encoding: 'utf8' },
);
assert.match(linkedFrameworks, /WebKit\.framework/);
assert.equal((await readFile(join(resources, 'AppIcon.icns'))).toString('ascii', 0, 4), 'icns');
for (const file of ['MenuBarTemplate.png', 'MenuBarTemplate@2x.png'])
  assert.equal((await readFile(join(resources, file))).toString('hex', 0, 8), '89504e470d0a1a0a');
pass('Regular Mac application includes its Dock icon, menu bar images and native WebKit framework');
const child = spawn(node, [join(resources, 'app/server/index.js')], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let restarted: ReturnType<typeof spawn> | undefined;
let diagnostics = '';
child.stderr.on('data', (b) => {
  diagnostics = (diagnostics + b).slice(-4000);
});
let launch: { url: string; token: string; pid: number } | undefined;
try {
  for (let i = 0; i < 150; i++) {
    try {
      launch = JSON.parse(await readFile(join(state, 'launch.json'), 'utf8'));
      break;
    } catch {}
    if (child.exitCode !== null) throw new Error(`Standalone service exited: ${diagnostics}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(launch, `No ready signal: ${diagnostics}`);
  assert.equal(launch.pid, child.pid);
  const session = await fetch(launch.url + '/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: launch.token }),
  });
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie')!.split(';')[0];
  const response = await fetch(launch.url);
  const html = await response.text();
  assert.match(html, /DUKE Autorouter/);
  const script = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(script);
  assert.match((await fetch(launch.url + script)).headers.get('content-type')!, /javascript/);
  assert.equal((await fetch(launch.url + '/api/state', { headers: { cookie } })).status, 200);
  pass(
    'Bundled Node serves authenticated app and assets from an unrelated folder with no developer PATH',
  );
  const workspace = await fetch(launch.url + '/api/workspaces', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Portable check', path: work, providers: ['codex'] }),
  });
  assert.equal(workspace.status, 200);
  pass('Project setup persists in a separate application data directory');
  const put = async (path: string, body: unknown) => {
    const response = await fetch(launch!.url + '/api' + path, {
      method: 'PUT',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  await put('/preferences', { usageDisplay: 'both' });
  await put('/models/portable-fixture', {
    id: 'portable-fixture',
    model: 'portable-fixture',
    provider: 'codex',
    label: 'Portable fixture',
    enabled: false,
    capabilities: ['files'],
    quality: { coding: 0, research: 0, writing: 0 },
    catalog: {
      description: 'Synthetic package fixture only',
      discoveredAt: new Date().toISOString(),
    },
  });
  await put('/roster', { modelIds: ['portable-fixture'] });
  await put('/routing-preferences', { writing: 'portable-fixture' });
  pass('Packaged roster and work preferences save through the authenticated API without inference');
  const setupFolder = join(root, 'sample-setup');
  await mkdir(setupFolder);
  await writeFile(join(setupFolder, 'AGENTS.md'), 'Original portable instructions.');
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(launch!.url + '/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const imported = [];
  for (const mode of ['link', 'copy']) {
    const preview = await request('/setups/preview', { path: setupFolder });
    imported.push(
      await request('/setups', {
        previewId: preview.id,
        name: 'Portable ' + mode,
        mode,
        selected: ['AGENTS.md'],
      }),
    );
  }
  await writeFile(join(setupFolder, 'AGENTS.md'), 'Updated portable instructions.');
  assert.equal(
    (await request('/setups/' + imported[0].id)).files[0].content,
    'Updated portable instructions.',
  );
  assert.equal(
    (await request('/setups/' + imported[1].id)).files[0].content,
    'Original portable instructions.',
  );
  const exported = await request('/setups/' + imported[1].id + '/export', {
    selected: ['AGENTS.md'],
  });
  assert.equal(exported.format, 'duke-setup');
  assert.ok(!JSON.stringify(exported).includes(root));
  pass(
    'Packaged importer supports Link, independent Copy, portable export and authenticated local persistence',
  );
  const duplicate = await runProcess(node, [join(resources, 'app/server/index.js')], {
    cwd: root,
    env,
    timeout: 5000,
  });
  assert.notEqual(duplicate.code, 0);
  assert.match(duplicate.stderr, /already has a running router/i);
  assert.equal(JSON.parse(await readFile(join(state, 'launch.json'), 'utf8')).pid, child.pid);
  pass('A duplicate service cannot take over the active application state');

  const imports = (path: string) =>
    JSON.stringify(pathToFileURL(join(resources, 'app', path)).href);
  const runtimeChecks = `
    import {CodexWorker} from ${imports('server/adapters/codex.js')};
    import {ClaudeWorker} from ${imports('server/adapters/claude.js')};
    import {chromium} from ${imports('node_modules/playwright/index.mjs')};
    const results = await Promise.all([new CodexWorker(process.env.ROUTER_DATA_DIR).health(),new ClaudeWorker(process.env.ROUTER_DATA_DIR).health()]);
    for (const r of results) if (!r.models?.length) throw new Error(r.provider + ': ' + r.message);
    const browser = await chromium.launch({headless:true});
    const page = await browser.newPage();
    await page.setContent('<h1>Packaged Chromium</h1>');
    if (await page.locator('h1').innerText() !== 'Packaged Chromium') throw new Error('Browser failed');
    await browser.close();
    console.log(JSON.stringify(results.map(r=>({provider:r.provider,ready:r.ready,models:r.models.length}))));
  `;
  const checked = await runProcess(node, ['--input-type=module', '-e', runtimeChecks], {
    cwd: root,
    env,
    timeout: 60000,
  });
  assert.equal(checked.code, 0, checked.stderr + checked.stdout);
  assert.ok(JSON.parse(checked.stdout.trim()).every((r: any) => r.models > 0));
  pass(
    'Bundled Codex, Claude SDK and Chromium initialize without global installations; no inference',
  );
  await writeFile(join(work, 'check.cjs'), 'console.log("portable-code-test");');
  const shell = await runProcess(node, [join(resources, 'app/server/shell-runner.js')], {
    cwd: root,
    env,
    input: JSON.stringify({ workspace: work, command: 'node check.cjs', writable: false }),
    timeout: 20000,
  });
  assert.equal(shell.code, 0, shell.stderr);
  const ran = JSON.parse(shell.stdout);
  assert.equal(ran.code, 0, ran.stderr);
  assert.match(ran.stdout, /portable-code-test/);
  pass('Sandboxed coding task can use bundled Node');
  const toolAudit = await runProcess(
    node,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { Store } from ${JSON.stringify(pathToFileURL(join(resources, 'app/server/store.js')).href)};
    import { ToolService } from ${JSON.stringify(pathToFileURL(join(resources, 'app/server/tools.js')).href)};
    import { Approvals } from ${JSON.stringify(pathToFileURL(join(resources, 'app/server/approval.js')).href)};
    import { TaskInput } from ${JSON.stringify(pathToFileURL(join(resources, 'app/server/types.js')).href)};
    const store = new Store(${JSON.stringify(join(root, 'tool-state/db'))});
    const tools = new ToolService(store, new Approvals(store), ${JSON.stringify(join(root, 'tool-state'))});
    store.put('workspace','w',{id:'w',name:'Package check',path:${JSON.stringify(work)},providers:['codex'],instructions:[]});
    store.save({...TaskInput.parse({prompt:'Invented package check',workspaceId:'w',required:['files','artifacts']}),id:'t',title:'check',status:'running',attempt:0,createdAt:'',updatedAt:''});
    const call = (name,args) => tools.call('t',name,args,new AbortController().signal);
    try {
      assert.equal((await call('setup_list',{})).defaultSkills.length,4);
      for (const format of ['pdf','docx']) {
        await call('create_artifact',{path:'sample.'+format,format,content:'# Sample résumé\\n\\n| Tool | Count |\\n|---|---|\\n| Hammer | 8 |'});
        assert.match((await call('read_file',{path:'sample.'+format})).content,/Hammer/);
        const preview = await call('preview_file',{path:'sample.'+format});
        assert.equal(preview.images[0].mimeType,'image/png');
        assert.ok(preview.images[0].data.length>1000);
      }
      await call('create_artifact',{path:'sample.xlsx',format:'xlsx',content:'',rows:[['Item','Count'],['Hammer',8],['Drill',4],['Total',{formula:'SUM(B2:B3)'}]]});
      assert.match((await call('read_file',{path:'sample.xlsx'})).content,/B4: 12/);
      assert.ok((await call('preview_file',{path:'sample.xlsx'})).images[0].data.length>1000);
      await call('write_file',{path:'edit.txt',content:'one needle'});
      await call('edit_file',{path:'edit.txt',old_text:'one needle',new_text:'two needles'});
      assert.equal((await call('search_files',{query:'two needles'})).matches[0].path,'edit.txt');
      console.log('packaged-default-tools-pass');
    } finally { store.close(); }
  `,
    ],
    { cwd: root, env, timeout: 100000 },
  );
  assert.equal(toolAudit.code, 0, toolAudit.stderr + toolAudit.stdout);
  assert.match(toolAudit.stdout, /packaged-default-tools-pass/);
  pass(
    'Bundled default skills, precise edits, search, Word/PDF reading and previews, and spreadsheet formulas work without developer tools',
  );
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  assert.equal(child.exitCode, 0);
  await assert.rejects(readFile(join(state, 'launch.json')));
  pass('Graceful shutdown removes the launch receipt and releases state');
  restarted = spawn(node, [join(resources, 'app/server/index.js')], {
    cwd: root,
    env,
    stdio: 'ignore',
    detached: true,
  });
  let next: typeof launch | undefined;
  for (let i = 0; i < 100; i++) {
    try {
      next = JSON.parse(await readFile(join(state, 'launch.json'), 'utf8'));
      break;
    } catch {}
    if (restarted.exitCode !== null) throw new Error('Service could not restart');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(next);
  assert.equal(next.pid, restarted.pid);
  const nextSession = await fetch(next.url + '/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: next.token }),
  });
  assert.equal(nextSession.status, 200);
  const nextCookie = nextSession.headers.get('set-cookie')!.split(';')[0];
  const restored = await (
    await fetch(next.url + '/api/state', { headers: { cookie: nextCookie } })
  ).json();
  assert.equal(restored.workspaces.length, 1);
  assert.equal(restored.workspaces[0].name, 'Portable check');
  assert.equal(restored.setups.length, 2);
  assert.equal(restored.models.find((m: any) => m.id === 'portable-fixture')?.enabled, true);
  assert.equal(restored.settings.workPreferences.writing, 'portable-fixture');
  assert.equal(restored.roster.needsReview, false);
  assert.equal(restored.preferences.usageDisplay, 'both');
  assert.deepEqual(restored.setups.map((s: any) => s.mode).sort(), ['copy', 'link']);
  restarted.kill('SIGTERM');
  await new Promise<void>((resolve) => restarted!.once('exit', () => resolve()));
  assert.equal(restarted.exitCode, 0);
  pass('Relaunch restores the saved project and creates a new authenticated local session');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', packageApp]);
  pass('Application signature remains valid after bundled workers, browser and restart');
  await mkdir(resource('outputs'), { recursive: true });
  await writeFile(
    resource('outputs/standalone-verification.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks: receipts,
        liveInference: false,
        minimalEnvironment: true,
      },
      null,
      2,
    ),
  );
} finally {
  if (child.exitCode === null) stopTree(child);
  if (restarted && restarted.exitCode === null) stopTree(restarted);
  await rm(root, { recursive: true, force: true });
}
