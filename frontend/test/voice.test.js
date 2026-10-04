import { describe, it, expect } from 'vitest';
import { chunkText, mapRecognitionError, mapSynthesisError, mergeTranscript, interviewerState } from '../src/utils/voice.js';

describe('voice utils', () => {
  it('chunks text by sentence and respects the max length', () => {
    const long = `${'word '.repeat(80).trim()}. Short one. Another short one!`;
    const chunks = chunkText(long, 100);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(' ')).toContain('Another short one!');
    expect(chunkText('')).toEqual([]);
    expect(chunkText('One. Two.')).toEqual(['One. Two.']);
  });
  it('maps errors to friendly messages and ignores benign ones', () => {
    expect(mapRecognitionError('not-allowed')).toMatch(/Microphone access/);
    expect(mapRecognitionError('no-speech')).toMatch(/didn't hear/);
    expect(mapRecognitionError('aborted')).toBe('');
    expect(mapRecognitionError('weird')).toMatch(/type your answer/);
    expect(mapSynthesisError('canceled')).toBe('');
    expect(mapSynthesisError('interrupted')).toBe('');
    expect(mapSynthesisError('synthesis-failed')).toMatch(/read it on screen/);
  });
  it('merges dictated text with spacing', () => {
    expect(mergeTranscript('', ' hello ')).toBe('hello');
    expect(mergeTranscript('I would use  ', 'a hashmap')).toBe('I would use a hashmap');
    expect(mergeTranscript('keep', '   ')).toBe('keep');
  });
  it('derives interviewer state with the right priority', () => {
    expect(interviewerState({ completed: true, paused: true }).key).toBe('done');
    expect(interviewerState({ paused: true, speaking: true }).key).toBe('paused');
    expect(interviewerState({ thinking: true, speaking: true }).key).toBe('thinking');
    expect(interviewerState({ speaking: true, listening: true }).key).toBe('speaking');
    expect(interviewerState({ listening: true }).key).toBe('listening');
    expect(interviewerState({}).key).toBe('waiting');
  });
});
