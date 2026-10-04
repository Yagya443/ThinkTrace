/** Pure helpers for the browser voice features (kept separate so they can be unit-tested). */

/** Split text into sentence-sized chunks. Chrome cuts off long utterances, so we queue short ones. */
export function chunkText(text, max = 180) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [clean];
  const chunks = [];
  let cur = '';
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (sentence.length > max) {
      push();
      let part = '';
      for (const w of sentence.split(' ')) {
        if ((part + ' ' + w).trim().length > max) { chunks.push(part.trim()); part = w; } else part = `${part} ${w}`;
      }
      cur = part;
      continue;
    }
    if ((cur + ' ' + sentence).trim().length > max) push();
    cur = `${cur} ${sentence}`;
  }
  push();
  return chunks;
}

export function mapRecognitionError(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed': return 'Microphone access was blocked. Allow it in your browser settings, or type your answer instead.';
    case 'no-speech': return "I didn't hear anything. Check your microphone and try again, or type your answer.";
    case 'audio-capture': return 'No microphone was found. You can type your answer instead.';
    case 'network': return 'Speech recognition needs an internet connection in this browser. You can type your answer instead.';
    case 'language-not-supported': return 'Speech recognition does not support your language setting. You can type your answer instead.';
    case 'aborted': return '';
    default: return 'Voice input stopped unexpectedly. You can type your answer instead.';
  }
}

export function mapSynthesisError(code) {
  if (code === 'canceled' || code === 'interrupted') return '';
  if (code === 'not-allowed') return 'Your browser blocked audio until you interact with the page. Click "Hear Question" to play.';
  return 'Could not play the question aloud. You can read it on screen.';
}

/** Append dictated text to whatever is already typed, with sane spacing. */
export function mergeTranscript(base, spoken) {
  const s = String(spoken || '').trim();
  if (!s) return base;
  const b = String(base || '').replace(/\s+$/, '');
  return b ? `${b} ${s}` : s;
}

/** What the "AI interviewer" is doing right now, for the status indicator. */
export function interviewerState({ completed, paused, thinking, speaking, listening }) {
  if (completed) return { key: 'done', label: 'Interview complete' };
  if (paused) return { key: 'paused', label: 'Paused' };
  if (thinking) return { key: 'thinking', label: 'Thinking' };
  if (speaking) return { key: 'speaking', label: 'Speaking' };
  if (listening) return { key: 'listening', label: 'Listening to you' };
  return { key: 'waiting', label: 'Waiting for your answer' };
}

export function getRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}
export function getSynthesis() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance === 'undefined') return null;
  return window.speechSynthesis;
}
