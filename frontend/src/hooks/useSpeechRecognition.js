import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecognitionCtor, mapRecognitionError } from '../utils/voice.js';

const FATAL = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported', 'no-speech'];

/**
 * Browser speech-to-text via the Web Speech API (not available in every browser).
 * onFinal(text) is called with each finished phrase; `interim` holds the in-progress phrase.
 */
export default function useSpeechRecognition({ onFinal } = {}) {
  const Ctor = getRecognitionCtor();
  const supported = Boolean(Ctor);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const wantRef = useRef(false);
  const fatalRef = useRef(false);
  const restartsRef = useRef(0);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const begin = useCallback(() => {
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    rec.onstart = () => setListening(true);
    rec.onresult = (e) => {
      restartsRef.current = 0;
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript || '';
        if (r.isFinal) onFinalRef.current?.(text); else live += text;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      const msg = mapRecognitionError(e?.error);
      if (FATAL.includes(e?.error)) fatalRef.current = true;
      if (msg) setError(msg);
    };
    rec.onend = () => {
      setInterim('');
      // Browsers end continuous sessions after silence; quietly restart while the user still wants to dictate.
      if (wantRef.current && !fatalRef.current && restartsRef.current < 5) {
        restartsRef.current += 1;
        try { begin(); return; } catch { /* fall through */ }
      }
      wantRef.current = false;
      setListening(false);
    };
    recRef.current = rec;
    rec.start();
  }, [Ctor]);

  const start = useCallback(() => {
    if (!Ctor) { setError('Voice input is not supported in this browser. Try Chrome, Edge or Safari, or type your answer.'); return; }
    if (wantRef.current) return;
    setError('');
    wantRef.current = true; fatalRef.current = false; restartsRef.current = 0;
    try { begin(); } catch { wantRef.current = false; setError(mapRecognitionError('other')); }
  }, [Ctor, begin]);

  const stop = useCallback(() => {
    wantRef.current = false;
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false); setInterim('');
  }, []);

  useEffect(() => () => {
    wantRef.current = false;
    try { recRef.current?.abort(); } catch { /* noop */ }
  }, []);

  return { supported, listening, interim, error, start, stop, clearError: () => setError('') };
}
