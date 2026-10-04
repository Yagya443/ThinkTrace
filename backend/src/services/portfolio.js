import { safeFetchText } from '../utils/safeFetch.js';
import { AppError } from '../utils/AppError.js';

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const strip = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Converts HTML to a compact text digest: title, description, headings, body text. */
export function htmlToDigest(html) {
  const clean = html.replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const title = strip((clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const desc = decode((clean.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '');
  const headings = [...clean.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => strip(m[1])).filter(Boolean).slice(0, 25);
  const body = strip((clean.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, clean])[1]);
  return [title && `Title: ${title}`, desc && `Description: ${desc}`, headings.length && `Headings: ${headings.join(' | ')}`, `Text: ${body}`]
    .filter(Boolean).join('\n').slice(0, 3500);
}

export async function fetchPortfolioContext(url) {
  const html = await safeFetchText(url);
  const digest = htmlToDigest(html);
  if (digest.replace(/^(Title|Description|Headings|Text):/gm, '').trim().length < 80) {
    throw new AppError('That page had almost no readable text (it may render with JavaScript). Paste your project details instead.', 422, 'PORTFOLIO_EMPTY');
  }
  return digest;
}
