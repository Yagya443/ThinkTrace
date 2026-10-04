import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError } from './AppError.js';

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  return true;
}

/** Throws AppError unless the URL is http(s) and resolves only to public addresses. */
export async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new AppError('That URL is not valid.', 400, 'BAD_URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError('Only http(s) URLs are supported.', 400, 'BAD_URL');
  if (url.username || url.password) throw new AppError('URLs with credentials are not supported.', 400, 'BAD_URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new AppError('That address is not publicly reachable.', 400, 'BAD_URL');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new AppError('Could not find that website.', 502, 'UNREACHABLE');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new AppError('That address is not publicly reachable.', 400, 'BAD_URL');
  return url;
}

/**
 * GET a public web page as text. Validates every redirect hop, enforces a timeout and a size cap.
 * Note: DNS is resolved separately from the connection, so this is best-effort SSRF protection for a local tool.
 */
export async function safeFetchText(raw, { timeoutMs = 8000, maxBytes = 1_000_000, maxRedirects = 3 } = {}) {
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: 'manual', signal: ctrl.signal,
        headers: { 'User-Agent': 'ThinkTrace/0.3 (+local interview practice)', Accept: 'text/html,text/plain' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), url).toString();
        continue;
      }
      if (!res.ok) throw new AppError('The website returned an error.', 502, 'UNREACHABLE');
      const type = res.headers.get('content-type') || '';
      if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new AppError('That page is not a readable web page.', 502, 'UNREADABLE');
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        chunks.push(value);
        if (size > maxBytes) { reader.cancel().catch(() => {}); break; }
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(err.name === 'AbortError' ? 'The website took too long to respond.' : 'Could not reach the website.', 502, 'UNREACHABLE');
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AppError('The website redirected too many times.', 502, 'UNREACHABLE');
}
