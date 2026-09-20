import http from 'node:http';
import { connect, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { publicURL } from './web.js';

// Chromium's routing callbacks do not cover every redirect. Enforce the network
// boundary at CONNECT as well: resolve once, validate all answers, then dial the
// approved IP. The browser keeps end-to-end TLS and its normal redirect semantics.
export async function publicBrowserProxy(
  validate = publicURL,
  dial = (address: { address: string; family: number }) =>
    connect({ host: address.address, family: address.family, port: 443 }),
) {
  const username = 'duke',
    password = randomBytes(24).toString('hex');
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const sockets = new Set<Socket>();
  let closed = false;
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(60000, () => socket.destroy());
    return socket;
  };
  const server = http.createServer({ maxHeaderSize: 8192 }, (_req, res) => {
    // Only HTTPS tunnels are allowed. HTTP, ws:// and proxy management requests fail closed.
    res.writeHead(403, { Connection: 'close' });
    res.end();
  });
  server.maxConnections = 128;
  server.on('connection', track);
  server.on('clientError', (_error, socket) => socket.destroy());
  server.on('upgrade', (_req, socket) => socket.destroy());
  server.on('connect', (req, client, head) => {
    const deny = () =>
      client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    if (req.headers['proxy-authorization'] !== authorization) {
      client.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="DUKE"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
      );
      return;
    }
    if (!/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+):443$/i.test(req.url ?? '')) {
      deny();
      return;
    }
    void (async () => {
      try {
        const { address } = await validate(`https://${req.url}/`);
        if (closed || client.destroyed) return;
        const upstream = track(dial(address));
        const timer = setTimeout(() => upstream.destroy(), 10000);
        upstream.once('connect', () => {
          clearTimeout(timer);
          if (closed || client.destroyed) {
            upstream.destroy();
            return;
          }
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) upstream.write(head);
          upstream.pipe(client);
          client.pipe(upstream);
        });
        upstream.once('close', () => {
          clearTimeout(timer);
          client.destroy();
        });
        client.once('close', () => upstream.destroy());
      } catch {
        deny();
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as { port: number };
  return {
    // Explicitly remove Chromium's implicit loopback bypass. There is no DIRECT fallback.
    options: {
      server: `http://127.0.0.1:${address.port}`,
      bypass: '<-loopback>',
      username,
      password,
    },
    close: async () => {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
