/** Best-effort extraction of a JSON object from model output. Returns null if impossible. */
export function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { const v = JSON.parse(t); if (v && typeof v === 'object') return v; } catch { /* continue */ }
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e > s) {
    let c = t.slice(s, e + 1);
    try { return JSON.parse(c); } catch { /* continue */ }
    c = c.replace(/,\s*([}\]])/g, '$1').replace(/[\u201C\u201D]/g, '"');
    try { return JSON.parse(c); } catch { /* give up */ }
  }
  return null;
}

export function clampScore(v, fallback = 5) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : fallback;
}
