import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useSpeechSynthesis from '../src/hooks/useSpeechSynthesis.js';
import useSpeechRecognition from '../src/hooks/useSpeechRecognition.js';

class FakeUtterance { constructor(text) { this.text = text; } }
function installSynth() {
  const spoken = [];
  const synth = {
    spoken, cancelled: 0, paused: false,
    getVoices: () => [{ lang: 'en-US', default: true, name: 'Test' }],
    speak: (u) => spoken.push(u), cancel: vi.fn(() => { synth.cancelled += 1; }),
    pause: vi.fn(() => { synth.paused = true; }), resume: vi.fn(() => { synth.paused = false; }),
  };
  window.speechSynthesis = synth;
  window.SpeechSynthesisUtterance = FakeUtterance;
  return synth;
}

let instances = [];
class FakeRecognition {
  constructor() { instances.push(this); }
  start() { this.started = true; this.onstart?.(); }
  stop() { this.stopped = true; this.onend?.(); }
  abort() { this.aborted = true; }
}
const result = (text, isFinal) => { const r = [{ transcript: text }]; r.isFinal = isFinal; return r; };

afterEach(() => {
  delete window.speechSynthesis; delete window.SpeechSynthesisUtterance;
  delete window.SpeechRecognition; delete window.webkitSpeechRecognition; instances = [];
});

describe('useSpeechSynthesis', () => {
  let synth;
  beforeEach(() => { synth = installSynth(); });

  it('speaks sentence chunks in order and finishes', () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.supported).toBe(true);
    act(() => result.current.speak('First sentence here. Second sentence here.'));
    expect(result.current.speaking).toBe(true);
    expect(synth.spoken).toHaveLength(1);
    act(() => synth.spoken[0].onend());
    expect(synth.spoken.length).toBeGreaterThanOrEqual(1);
    act(() => { while (result.current.speaking) { synth.spoken.at(-1).onend(); } });
    expect(result.current.speaking).toBe(false);
  });

  it('pause, resume and stop work; stop cancels the rest of the chain', () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => result.current.speak('x'.repeat(150) + '. ' + 'y'.repeat(150) + '.'));
    act(() => result.current.pause());
    expect(synth.pause).toHaveBeenCalled();
    expect(result.current.paused).toBe(true);
    act(() => result.current.resume());
    expect(result.current.paused).toBe(false);
    const countBefore = synth.spoken.length;
    act(() => result.current.stop());
    expect(result.current.speaking).toBe(false);
    act(() => synth.spoken[0].onend?.()); // stale callback must not speak more
    expect(synth.spoken.length).toBe(countBefore);
  });

  it('reports real errors but ignores cancel/interrupt', () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => result.current.speak('Hello there my friend.'));
    act(() => synth.spoken[0].onerror({ error: 'interrupted' }));
    expect(result.current.error).toBe('');
    act(() => result.current.speak('Hello again my friend.'));
    act(() => synth.spoken.at(-1).onerror({ error: 'synthesis-failed' }));
    expect(result.current.error).toMatch(/Could not play/);
    expect(result.current.speaking).toBe(false);
  });

  it('degrades gracefully when unsupported', () => {
    delete window.speechSynthesis;
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.supported).toBe(false);
    act(() => result.current.speak('hello'));
    expect(result.current.error).toMatch(/cannot read text aloud/);
  });
});

describe('useSpeechRecognition', () => {
  it('is unsupported without the API and explains why', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.error).toMatch(/not supported/);
    expect(result.current.listening).toBe(false);
  });

  it('delivers final phrases, tracks interim text, and stops', () => {
    window.webkitSpeechRecognition = FakeRecognition;
    const onFinal = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onFinal }));
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    const rec = instances[0];
    act(() => rec.onresult({ resultIndex: 0, results: [result0('I would use a hash')] }));
    expect(result.current.interim).toBe('I would use a hash');
    act(() => rec.onresult({ resultIndex: 0, results: [result1('I would use a hashmap')] }));
    expect(onFinal).toHaveBeenCalledWith('I would use a hashmap');
    act(() => result.current.stop());
    expect(result.current.listening).toBe(false);
    expect(instances).toHaveLength(1); // no restart after an explicit stop
  });

  it('maps permission errors to a friendly message and does not restart', () => {
    window.SpeechRecognition = FakeRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const rec = instances[0];
    act(() => { rec.onerror({ error: 'not-allowed' }); rec.onend(); });
    expect(result.current.error).toMatch(/Microphone access/);
    expect(result.current.listening).toBe(false);
    expect(instances).toHaveLength(1);
  });

  it('quietly restarts after a silence timeout while the user still wants to dictate', () => {
    window.SpeechRecognition = FakeRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    act(() => instances[0].onend());
    expect(instances).toHaveLength(2);
    expect(result.current.listening).toBe(true);
  });
});

const result0 = (t) => result(t, false);
const result1 = (t) => result(t, true);
