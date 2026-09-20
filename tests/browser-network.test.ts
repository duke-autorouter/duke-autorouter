import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { connect } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { researchBrowser } from '../server/research-browser.js';
import { publicBrowserProxy } from '../server/browser-network.js';
import { publicURL } from '../server/web.js';

test(
  'browser blocks private redirects before contact and preserves public redirects and approved writes',
  { timeout: 60000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'duke-browser-boundary-'));
    // Synthetic, short-lived TLS material; no real provider or public site is contacted.
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=public.test',
        '-keyout',
        join(root, 'key'),
        '-out',
        join(root, 'cert'),
      ],
      { stdio: 'ignore' },
    );
    let privateHits = 0;
    let privateTLSURL = '';
    const internal = http.createServer((_req, res) => {
      privateHits++;
      res.end('PRIVATE-MARKER');
    });
    await new Promise<void>((resolve) => internal.listen(0, '127.0.0.1', resolve));
    const privateURL = `http://127.0.0.1:${(internal.address() as any).port}/secret`;
    const seen: string[] = [],
      validations: string[] = [],
      dials: string[] = [];
    const fixture = https.createServer(
      { key: await readFile(join(root, 'key')), cert: await readFile(join(root, 'cert')) },
      (req, res) => {
        seen.push(`${req.method} ${req.headers.host}${req.url}`);
        if (req.url === '/secret') {
          privateHits++;
          res.end('PRIVATE-MARKER');
          return;
        }
        const redirect = (url: string, status = 302) => {
          res.writeHead(status, { Location: url });
          res.end();
        };
        if (req.url === '/private') return redirect(privateURL);
        if (req.url === '/private-tls') return redirect(privateTLSURL);
        if (req.url === '/chain') return redirect('https://next.test/private');
        if (req.url === '/public') return redirect('https://next.test/ok');
        if (req.url === '/post-redirect') return redirect('https://next.test/received', 307);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          `<html><body>PUBLIC-MARKER${req.url === '/subresource' ? `<iframe src="https://next.test/private-tls"></iframe>` : ''}</body></html>`,
        );
      },
    );
    await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
    privateTLSURL = `https://127.0.0.1:${(fixture.address() as any).port}/secret`;
    const validate: typeof publicURL = async (raw) => {
      validations.push(raw);
      const url = new URL(raw);
      if (['https://public.test', 'https://next.test'].includes(url.origin))
        return { url, address: { address: '8.8.8.8', family: 4 } };
      return publicURL(raw);
    };
    const dial = (address: { address: string; family: number }) => {
      dials.push(address.address);
      assert.equal(address.address, '8.8.8.8');
      // Map the already-approved synthetic public address to our local TLS fixture.
      return connect({ host: '127.0.0.1', port: (fixture.address() as any).port });
    };
    let permit: string | undefined;
    const browser = await researchBrowser(() => permit, [validate, dial]);
    try {
      const security = await browser.context.newCDPSession(browser.page);
      await security.send('Security.setIgnoreCertificateErrors', { ignore: true }); // fixture cert only
      await browser.page.goto('https://public.test/public');
      assert.equal(browser.page.url(), 'https://next.test/ok');
      assert.match(await browser.page.locator('body').innerText(), /PUBLIC-MARKER/);
      for (const path of ['/private', '/chain', '/private-tls']) {
        const settled = browser.page.waitForEvent('domcontentloaded', { timeout: 10000 });
        await assert.rejects(browser.page.goto(`https://public.test${path}`, { timeout: 10000 }));
        await settled;
      }
      await browser.page.goto('https://public.test/subresource');
      assert.equal(privateHits, 0);
      assert.ok(validations.some((url) => url === privateURL));
      assert.ok(validations.some((url) => url === privateTLSURL));
      permit = 'https://public.test';
      assert.equal(
        await browser.page.evaluate(async () => (await fetch('/ok', { method: 'POST' })).status),
        200,
      );
      await browser.page.evaluate(async () => {
        try {
          await fetch('/post-redirect', { method: 'POST' });
        } catch {}
      });
      assert.ok(seen.includes('POST public.test/post-redirect'));
      assert.ok(!seen.includes('POST next.test/received'));
      assert.ok(dials.length > 0);
      assert.equal(privateHits, 0);
    } finally {
      await browser.close();
      fixture.closeAllConnections();
      internal.closeAllConnections();
      await Promise.all([
        new Promise<void>((r) => fixture.close(() => r())),
        new Promise<void>((r) => internal.close(() => r())),
      ]);
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('proxy refuses private CONNECT targets, HTTP and unauthenticated clients without dialing', async () => {
  let dials = 0;
  const proxy = await publicBrowserProxy(publicURL, () => {
    dials++;
    throw new Error('Must not dial');
  });
  try {
    const address = new URL(proxy.options.server);
    const auth = `Basic ${Buffer.from(`${proxy.options.username}:${proxy.options.password}`).toString('base64')}`;
    const request = (target: string, method = 'CONNECT', authenticated = true) =>
      new Promise<number>((resolve, reject) => {
        const req = http.request({
          hostname: address.hostname,
          port: address.port,
          path: target,
          method,
          headers: authenticated ? { 'Proxy-Authorization': auth } : {},
        });
        req.on('connect', (res, socket) => {
          socket.destroy();
          resolve(res.statusCode!);
        });
        req.on('response', (res) => {
          res.resume();
          resolve(res.statusCode!);
        });
        req.on('error', reject);
        req.end();
      });
    for (const target of [
      '127.0.0.1:443',
      '[::1]:443',
      '169.254.169.254:443',
      '10.1.2.3:443',
      'localhost:443',
      'example.com:8443',
    ])
      assert.equal(await request(target), 403);
    assert.equal(await request('http://127.0.0.1/', 'GET'), 403);
    assert.equal(await request('example.com:443', 'CONNECT', false), 407);
    assert.equal(dials, 0);
  } finally {
    await proxy.close();
  }
});
