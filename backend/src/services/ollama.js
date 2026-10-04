import { config } from '../config.js';
import { AppError } from '../utils/AppError.js';

async function request(path, options = {}, timeoutMs = config.ai.timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${config.ai.url}${path}`, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new AppError('The AI took too long to respond.', 504, 'AI_TIMEOUT');
    throw new AppError('Cannot reach Ollama. Is it running?', 503, 'OLLAMA_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

/** Returns { available, modelReady } */
export async function checkStatus() {
  try {
    const res = await request('/api/tags', {}, 3000);
    if (!res.ok) return { available: false, modelReady: false };
    const data = await res.json();
    const names = (data.models || []).map((m) => m.name);
    const wanted = config.ai.model;
    return { available: true, modelReady: names.some((n) => n === wanted || n === `${wanted}:latest`) };
  } catch {
    return { available: false, modelReady: false };
  }
}

/** messages: [{role, content}] -> assistant text. Pass { json: true } to request JSON mode. */
export async function chat(messages, { json = false } = {}) {
  const body = { model: config.ai.model, messages, stream: false };
  if (json) body.format = 'json';
  const res = await request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 404) {
    throw new AppError(`Model "${config.ai.model}" is not installed. Run: ollama pull ${config.ai.model}`, 503, 'MODEL_UNAVAILABLE');
  }
  if (!res.ok) throw new AppError('The AI service returned an error.', 502, 'AI_ERROR');
  const data = await res.json();
  const text = data?.message?.content?.trim();
  if (!text) throw new AppError('The AI returned an empty response.', 502, 'AI_EMPTY');
  return text;
}
