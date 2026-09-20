import { chromium } from 'playwright';
import { publicBrowserProxy } from './browser-network.js';
import { publicURL } from './web.js';

export async function researchBrowser(
  approvedOrigin: () => string | undefined,
  network: Parameters<typeof publicBrowserProxy> = [],
) {
  const proxy = await publicBrowserProxy(...network);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      proxy: proxy.options,
      args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
    });
    browser.on('disconnected', () => void proxy.close());
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
    // Live sockets have no per-action approval boundary. Keep them off.
    await context.routeWebSocket('**/*', (socket) => socket.close());
    const validate = network[0] ?? publicURL;
    // Also cover initial worker and popup requests before their targets are closed.
    await context.route('**/*', async (route) => {
      try {
        const { url } = await validate(route.request().url());
        if (!['GET', 'HEAD'].includes(route.request().method()) && url.origin !== approvedOrigin())
          return await route.abort();
        await route.continue();
      } catch {
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    // CDP Fetch pauses each redirect hop, including POST redirects that the
    // Playwright route handler may not see. The proxy independently pins DNS.
    const session = await context.newCDPSession(page);
    const authenticated = new Set<string>();
    session.on('Fetch.authRequired', async ({ requestId, authChallenge }) => {
      const allowed =
        authChallenge.source === 'Proxy' &&
        authChallenge.origin === proxy.options.server &&
        !authenticated.has(requestId);
      authenticated.add(requestId);
      await session
        .send('Fetch.continueWithAuth', {
          requestId,
          authChallengeResponse: allowed
            ? {
                response: 'ProvideCredentials',
                username: proxy.options.username,
                password: proxy.options.password,
              }
            : { response: 'CancelAuth' },
        })
        .catch(() => {});
    });
    session.on('Fetch.requestPaused', async ({ requestId, request }) => {
      try {
        const { url } = await validate(request.url);
        if (!['GET', 'HEAD'].includes(request.method) && url.origin !== approvedOrigin())
          throw new Error('Unapproved browser write');
        await session.send('Fetch.continueRequest', { requestId });
      } catch {
        await session
          .send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
          .catch(() => {});
      }
    });
    await session.send('Fetch.enable', {
      handleAuthRequests: true,
      patterns: [{ urlPattern: '*', requestStage: 'Request' }],
    });
    context.on('page', (other) => {
      if (other !== page) void other.close().catch(() => {});
    });
    return {
      browser,
      context,
      page,
      close: async () => {
        await browser!.close().catch(() => {});
        await proxy.close();
      },
    };
  } catch (error) {
    await browser?.close().catch(() => {});
    await proxy.close();
    throw error;
  }
}
