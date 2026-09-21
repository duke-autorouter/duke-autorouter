import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Blocked } from './types.js';
import { nativeDocument } from './native-documents.js';
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
): Promise<{
  url: string;
  text: string;
  links: { text: string; url: string }[];
  truncated: boolean;
}> {
  if (redirects > 4) throw new Blocked('Too many redirects');
  const { url, address } = await publicURL(raw);
  const result = await new Promise<{
    status: number;
    location?: string;
    body: Buffer;
    type: string;
  }>((resolve, reject) => {
    const req = https.get(
      url,
      {
        signal,
        headers: {
          'User-Agent': 'DukeRouter/0.1 (public research)',
          Accept: 'text/html,text/plain,application/json,application/pdf',
          'Accept-Encoding': 'identity',
        },
        lookup: ((_h: any, _o: any, cb: any) =>
          cb(null, [{ address: address.address, family: address.family }])) as any,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (b) => {
          size += b.length;
          if (size > 2_000_000) req.destroy(new Error('Source exceeds 2 MB'));
          else chunks.push(b);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            body: Buffer.concat(chunks),
            type: String(res.headers['content-type'] ?? ''),
          }),
        );
        res.on('error', reject);
      },
    );
    req.setTimeout(20000, () => req.destroy(new Error('Page timed out')));
    req.on('error', reject);
  });
  if (result.status >= 300 && result.status < 400 && result.location)
    return fetchPublic(new URL(result.location, url).href, signal, redirects + 1);
  if (result.status >= 400) throw new Blocked(`Page returned HTTP ${result.status}`);
  return parsePublicContent(url.href, result.body, result.type, signal);
}

export async function parsePublicContent(
  url: string,
  bytes: Buffer,
  type: string,
  signal: AbortSignal,
) {
  if (bytes.length > 2_000_000) throw new Error('Source exceeds 2 MB');
  if (/^application\/pdf(?:;|$)/i.test(type)) {
    const temporary = await mkdtemp(join(tmpdir(), 'duke-public-pdf-'));
    try {
      const path = join(temporary, 'source.pdf');
      await writeFile(path, bytes, { mode: 0o600 });
      const result = await nativeDocument({ operation: 'pdf_text', path }, signal);
      if (!result.hasText)
        throw new Error(
          'This PDF has no extractable text; scanned PDFs require OCR, which is not included.',
        );
      const missingPages: number[] = result.pagesWithoutText ?? [];
      return {
        url,
        text: result.text.slice(0, 40000),
        links: [],
        truncated: result.truncated || result.text.length > 40000 || missingPages.length > 0,
        format: 'pdf',
        pages: result.pages,
        notes: missingPages.length
          ? [
              `Pages ${missingPages.join(', ')} have no extractable text and may be blank or image-only.`,
            ]
          : [],
      };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  if (
    !/^(text\/(?:html|plain|xml)|application\/(?:json|xml|rss\+xml|xhtml\+xml))(?:;|$)/i.test(type)
  )
    throw new Error(
      'This source format is unsupported. Research reads public text pages and text-based PDFs.',
    );
  const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const html = /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(type);
  const rssLinks = [...(html ? '' : body).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(
    (item) => {
      const url = item[1].match(/<link>([\s\S]*?)<\/link>/i)?.[1];
      const title = item[1].match(/<title>([\s\S]*?)<\/title>/i)?.[1];
      return url && title
        ? [
            {
              url: url.replace(/&amp;/g, '&').trim(),
              text: title
                .replace(/<!\[CDATA\[|\]\]>/g, '')
                .replace(/<[^>]*>/g, '')
                .trim()
                .slice(0, 160),
            },
          ]
        : [];
    },
  );
  const links = [
    ...(html ? body : '').matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ]
    .slice(0, 80)
    .flatMap((m) => {
      try {
        return [{ url: new URL(m[1], url).href, text: m[2].replace(/<[^>]*>/g, '').slice(0, 160) }];
      } catch {
        return [];
      }
    });
  const fullText = html ? researchHTMLText(body) : body.trim();
  if (!fullText) throw new Error('The page returned no readable body.');
  return {
    url,
    text: fullText.slice(0, 40000),
    links: rssLinks.length ? rssLinks.slice(0, 80) : links,
    truncated: fullText.length > 40000,
  };
}

// The public search-page implementations were rejected after live checks returned
// challenges and unrelated results. Use the provider's supported keyless API;
// never attach a key or silently switch this default to paid account usage.
export async function searchPublic(
  query: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  signal.throwIfAborted();
  const response = await transport('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tavily-Access-Mode': 'keyless',
      'X-Client-Source': 'duke-autorouter',
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: 6,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      auto_parameters: false,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(
      [429, 432, 433].includes(response.status)
        ? 'The free search service is temporarily rate-limited. Retry later or use a known source URL. No paid fallback was used.'
        : `Search service unavailable (HTTP ${response.status}). Read a known source URL or report search as unavailable.`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Search returned no response body.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 2_000_000) {
        await reader.cancel();
        throw new Error('Search response exceeds 2 MB.');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (result.error || !Array.isArray(result.results))
    throw new Error('Search returned an error or an unreadable result.');
  const unique = new Map<string, { url: string; text: string; snippet: string }>();
  for (const item of result.results) {
    try {
      const url = new URL(item.url),
        title = typeof item.title === 'string' ? item.title.trim() : '';
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        (url.port && url.port !== '443') ||
        !title ||
        (isIP(url.hostname) && !publicIP(url.hostname))
      )
        continue;
      if (!unique.has(url.href))
        unique.set(url.href, {
          url: url.href,
          text: title.slice(0, 200),
          snippet: typeof item.content === 'string' ? item.content.slice(0, 600) : '',
        });
    } catch {
      /* Malformed source URLs do not become evidence. */
    }
  }
  const results = [...unique.values()].slice(0, 6);
  if (!results.length)
    throw new Error(
      'Web search returned no usable results. Do not treat this as evidence that no sources exist.',
    );
  return {
    query,
    url: 'https://api.tavily.com/search',
    discoveryService: 'Tavily (keyless)',
    text: results.map((r) => `${r.text}\n${r.url}\n${r.snippet}`).join('\n\n'),
    links: results.map(({ snippet, ...link }) => link),
    truncated: result.results.length > 6,
    note: 'Discovery results only. Read each original source with web_read before citing it. Search uses Tavily keyless access, which has service limits; it does not use a paid account.',
  };
}

// Preserve source revision cues as data before removing presentation markup.
// This does not render CSS or infer whether a statement is currently correct.
export function researchHTMLText(body: string): string {
  return body
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(s|strike|del)\b[^>]*>/gi, ' [source text marked deleted or struck through: ')
    .replace(/<\/(?:s|strike|del)\s*>/gi, ' :end marked text] ')
    .replace(/<ins\b[^>]*>/gi, ' [source insertion: ')
    .replace(/<\/ins\s*>/gi, ' :end insertion] ')
    .replace(/<[^>]*>/g, ' ')
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (entity) =>
        ({
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&apos;': "'",
          '&nbsp;': ' ',
        })[entity]!,
    )
    .replace(/\s+/g, ' ')
    .trim();
}
