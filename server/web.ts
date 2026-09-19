import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import { Blocked } from './types.js';
export function publicIP(ip: string) {
  if (!isIP(ip)) return false;
  if (ip.includes(':')) return /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:db8:/i.test(ip);
  const [a, b] = ip.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function publicURL(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443'))
    throw new Blocked('Research accepts public HTTPS URLs only.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicIP(a.address)))
    throw new Blocked('Private or local network access is blocked.');
  return { url: u, address: addresses[0] };
}
export async function fetchPublic(
  raw: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<{ url: string; text: string; links: { text: string; url: string }[] }> {
  if (redirects > 4) throw new Blocked('Too many redirects');
  const { url, address } = await publicURL(raw);
  const result = await new Promise<{ status: number; location?: string; body: string }>(
    (resolve, reject) => {
      const req = https.get(
        url,
        {
          signal,
          headers: {
            'User-Agent': 'DukeRouter/0.1 (public research)',
            Accept: 'text/html,text/plain,application/json',
          },
          lookup: ((_h: any, _o: any, cb: any) =>
            cb(null, [{ address: address.address, family: address.family }])) as any,
        },
        (res) => {
          let body = '';
          res.on('data', (b) => {
            body += b;
            if (body.length > 2_000_000) req.destroy(new Error('Page exceeds 2 MB'));
          });
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, location: res.headers.location, body }),
          );
          res.on('error', reject);
        },
      );
      req.setTimeout(20000, () => req.destroy(new Error('Page timed out')));
      req.on('error', reject);
    },
  );
  if (result.status >= 300 && result.status < 400 && result.location)
    return fetchPublic(new URL(result.location, url).href, signal, redirects + 1);
  if (result.status >= 400) throw new Blocked(`Page returned HTTP ${result.status}`);
  const links = [...result.body.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .slice(0, 80)
    .flatMap((m) => {
      try {
        return [{ url: new URL(m[1], url).href, text: m[2].replace(/<[^>]*>/g, '').slice(0, 160) }];
      } catch {
        return [];
      }
    });
  const text = result.body
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 40000);
  return { url: url.href, text, links };
}
