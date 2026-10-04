import { useCallback, useEffect, useRef, useState } from 'react';
import { chunkText, getSynthesis, mapSynthesisError } from '../utils/voice.js';

/** Browser-native text-to-speech (no external API). */
export default function useSpeechSynthesis() {
  const synth = getSynthesis();
  const supported = Boolean(synth);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const runRef = useRef(0); // invalidates in-flight chains when stop()/speak() is called

  const pickVoice = useCallback(() => {
    const voices = synth?.getVoices?.() || [];
    const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    return voices.find((v) => v.lang === lang && v.default) || voices.find((v) => v.lang === lang) ||
      voices.find((v) => v.lang?.toLowerCase().startsWith('en') && v.default) || voices.find((v) => v.lang?.toLowerCase().startsWith('en')) || null;
  }, [synth]);

  const stop = useCallback(() => {
    runRef.current += 1;
    synth?.cancel();
    setSpeaking(false);
    setPaused(false);
  }, [synth]);

  const speak = useCallback((text) => {
    if (!synth) { setError('Your browser cannot read text aloud. You can read the question on screen.'); return; }
    const chunks = chunkText(text);
    if (!chunks.length) return;
    runRef.current += 1;
    const run = runRef.current;
    synth.cancel();
    setError(''); setPaused(false); setSpeaking(true);
    const voice = pickVoice();
    const next = (i) => {
      if (run !== runRef.current) return;
      if (i >= chunks.length) { setSpeaking(false); return; }
      const u = new window.SpeechSynthesisUtterance(chunks[i]);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.onend = () => next(i + 1);
      u.onerror = (e) => {
        if (run !== runRef.current) return;
        const msg = mapSynthesisError(e?.error);
        if (msg) setError(msg);
        setSpeaking(false); setPaused(false);
      };
      synth.speak(u);
    };
    next(0);
  }, [synth, pickVoice]);

  const pause = useCallback(() => { if (synth && speaking) { synth.pause(); setPaused(true); } }, [synth, speaking]);
  const resume = useCallback(() => { if (synth && paused) { synth.resume(); setPaused(false); } }, [synth, paused]);

  useEffect(() => () => { runRef.current += 1; synth?.cancel(); }, [synth]);

  return { supported, speaking, paused, error, speak, stop, pause, resume, clearError: () => setError('') };
}
