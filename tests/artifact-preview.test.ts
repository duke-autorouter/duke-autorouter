import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../server/app.js';
import { TaskInput } from '../server/types.js';
import { wordArtifact } from '../server/artifacts.js';
import { makeSpreadsheet } from '../server/spreadsheets.js';

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'duke-artifact-preview-')));
  const workspace = join(root, 'project');
  await mkdir(workspace);
  const r = await createApp({ stateDir: join(root, 'state'), serveUI: false });
  r.store.put('workspace', 'w', { id: 'w', name: 'Fixture', path: workspace, providers: [], instructions: [] });
  r.store.save({ ...TaskInput.parse({ workspaceId: 'w', prompt: 'Preview a saved artifact' }),
    id: 't', title: 'Fixture', status: 'completed', attempt: 0, createdAt: '', updatedAt: '' });
  const login = await r.app.inject({ method: 'POST', url: '/api/session',
    headers: { host: '127.0.0.1:4318' }, payload: { token: r.launchToken } });
  const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join(';');
  return { ...r, root, workspace,
    save: async (name: string, data: Uint8Array) => {
      await writeFile(join(workspace, name), data);
      r.store.put('artifact', name, { id: name, taskId: 't', path: name,
        sha256: createHash('sha256').update(data).digest('hex') });
    },
    get: (path: string, authenticated = true) => r.app.inject({ method: 'GET', url: `/api/artifacts/${path}`,
      headers: { host: '127.0.0.1:4318', ...(authenticated ? { cookie } : {}) } }),
    close: async () => { await r.app.close(); await rm(root, { recursive: true, force: true }); },
  };
}

test('artifact images require authentication, the recorded version and project containment', async () => {
  const f = await fixture();
  try {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC/UAAAAASUVORK5CYII=', 'base64');
    await f.save('tiny.png', png);
    assert.equal((await f.get('tiny.png/preview', false)).statusCode, 401);
    const good = await f.get('tiny.png/preview');
    assert.equal(good.statusCode, 200);
    assert.equal(good.headers['cache-control'], 'no-store');
    assert.deepEqual(Buffer.from(good.json().images[0].data, 'base64'), png);
    assert.equal((await f.get('tiny.png/preview?page=0')).statusCode, 400);
    assert.equal((await f.get('missing/preview')).statusCode, 409);
    await writeFile(join(f.workspace, 'tiny.png'), Buffer.concat([png, Buffer.from('changed')]));
    assert.equal((await f.get('tiny.png/preview')).statusCode, 409);
    await writeFile(join(f.root, 'outside.png'), png);
    f.store.put('artifact', 'outside', { id: 'outside', taskId: 't', path: '../outside.png',
      sha256: createHash('sha256').update(png).digest('hex') });
    assert.equal((await f.get('outside/preview')).statusCode, 409);
  } finally { await f.close(); }
});

test('PDF pages and Word previews return images without a browser PDF plugin', { skip: process.platform !== 'darwin' }, async () => {
  const f = await fixture();
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('First page');
    pdf.addPage().drawText('Second page');
    await f.save('pages.pdf', await pdf.save());
    const second = await f.get('pages.pdf/preview?page=2');
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().pages, 2);
    assert.equal(second.json().page, 2);
    assert.equal(second.json().images[0].mimeType, 'image/png');
    assert.notEqual((await f.get('pages.pdf/preview?page=3')).statusCode, 200);
    await f.save('report.docx', await wordArtifact('# Sample report\n\nInvented preview data.'));
    const word = await f.get('report.docx/preview');
    assert.equal(word.statusCode, 200);
    assert.equal(word.json().images[0].mimeType, 'image/png');
  } finally { await f.close(); }
});

test('artifact workbook preview selects a sheet and reports bounded cell coverage', async () => {
  const f = await fixture();
  try {
    const book = await makeSpreadsheet('', undefined, [
      { name: 'Inventory', rows: [['Item', 'Count'], ['Hammer', 8]] },
      { name: 'Summary', rows: [['Total', { formula: 'Inventory!B2' }]] },
    ]);
    await f.save('book.xlsx', book.bytes);
    const response = await f.get('book.xlsx/preview?sheet=Summary&range=A1:B1');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().sheets, ['Inventory', 'Summary']);
    assert.equal(response.json().sheet, 'Summary');
    assert.equal(response.json().range, 'A1:B1');
    assert.match(response.json().coverage, /does not reproduce native Excel layout/);
  } finally { await f.close(); }
});
