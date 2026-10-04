import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../src/services/api.js', () => ({
  getInterview: vi.fn(), submitAnswer: vi.fn(), skipQuestion: vi.fn(),
  friendlyError: (e) => e?.message || 'Something went wrong. Please try again.',
}));
vi.mock('../src/components/MonacoEditor.jsx', () => ({
  default: ({ value, onChange, language }) => <textarea data-testid="monaco" data-language={language} value={value} onChange={(e) => onChange(e.target.value)} />,
}));
import { submitAnswer, skipQuestion } from '../src/services/api.js';
import Room from '../src/pages/Room.jsx';

const base = {
  id: 'abc', typeLabel: 'Web Development Interview', difficulty: 'medium', totalQuestions: 3, questionNumber: 1,
  status: 'active', mode: 'ai', model: 'gemma3:4b', personalized: false, contextSources: [], contextWarnings: [],
  difficultyHistory: ['medium'],
  transcript: [{ role: 'interviewer', kind: 'question', text: 'Why use React Query instead of useEffect?' }],
};
const renderRoom = (session = base) => render(
  <MemoryRouter initialEntries={[{ pathname: '/interview/abc', state: { session } }]}>
    <Routes><Route path="/interview/:id" element={<Room />} /></Routes>
  </MemoryRouter>,
);

class FakeUtterance { constructor(t) { this.text = t; } }
let spoken; let recs;
class FakeRec { constructor() { recs.push(this); } start() { this.onstart?.(); } stop() { this.onend?.(); } abort() {} }

function withSpeech() {
  spoken = []; recs = [];
  window.speechSynthesis = { getVoices: () => [], speak: (u) => spoken.push(u), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() };
  window.SpeechSynthesisUtterance = FakeUtterance;
  window.webkitSpeechRecognition = FakeRec;
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => {
  cleanup();
  delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; delete window.webkitSpeechRecognition;
});

describe('Room voice controls', () => {
  it('shows the question, counters and a waiting status', () => {
    withSpeech(); renderRoom();
    expect(screen.getByText('Why use React Query instead of useEffect?')).toBeTruthy();
    expect(screen.getByText('Question 1 / 3')).toBeTruthy();
    expect(screen.getByTestId('interviewer-status').textContent).toMatch(/Waiting for your answer/);
  });

  it('Hear Question speaks the question, shows Speaking, and Stop returns to waiting', () => {
    withSpeech(); renderRoom();
    fireEvent.click(screen.getByRole('button', { name: /Hear Question/ }));
    expect(spoken[0].text).toMatch(/React Query/);
    expect(screen.getByTestId('interviewer-status').textContent).toMatch(/Speaking/);
    fireEvent.click(screen.getByRole('button', { name: /Pause audio/ }));
    expect(window.speechSynthesis.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Resume audio/ }));
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    expect(screen.getByTestId('interviewer-status').textContent).toMatch(/Waiting/);
  });

  it('dictation fills the answer box and Submit sends it', async () => {
    withSpeech(); renderRoom();
    submitAnswer.mockResolvedValue({ session: { ...base, transcript: [...base.transcript, { role: 'candidate', kind: 'answer', text: 'x' }, { role: 'interviewer', kind: 'follow_up', text: 'Why?' }] } });
    fireEvent.click(screen.getByRole('button', { name: /Start answering/ }));
    expect(screen.getByTestId('interviewer-status').textContent).toMatch(/Listening/);
    const r = [{ transcript: 'it caches server state' }]; r.isFinal = true;
    act(() => recs[0].onresult({ resultIndex: 0, results: [r] }));
    expect(screen.getByLabelText('Your answer').value).toBe('it caches server state');
    fireEvent.click(screen.getByRole('button', { name: /Submit answer/ }));
    await waitFor(() => expect(submitAnswer).toHaveBeenCalledWith('abc', 'it caches server state'));
    await waitFor(() => expect(screen.getByText('Why?')).toBeTruthy());
    expect(screen.getByLabelText('Your answer').value).toBe('');
  });

  it('Pause stops the interview controls; Resume restores them', () => {
    withSpeech(); renderRoom();
    fireEvent.click(screen.getByRole('button', { name: /^Pause$/ }));
    expect(screen.getByTestId('interviewer-status').textContent).toMatch(/Paused/);
    expect(screen.getByLabelText('Your answer').disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Submit answer/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Start answering/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Resume$/ }));
    expect(screen.getByLabelText('Your answer').disabled).toBe(false);
  });

  it('Skip asks for confirmation, then calls the API', async () => {
    withSpeech(); renderRoom();
    skipQuestion.mockResolvedValue({ session: { ...base, questionNumber: 2, transcript: [...base.transcript, { role: 'candidate', kind: 'skip', text: 'Skipped this question.' }, { role: 'interviewer', kind: 'question', text: 'Next question here?' }] } });
    fireEvent.click(screen.getByRole('button', { name: /Skip question/ }));
    expect(skipQuestion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Confirm skip/ }));
    await waitFor(() => expect(skipQuestion).toHaveBeenCalledWith('abc'));
    await waitFor(() => expect(screen.getByText('Question 2 / 3')).toBeTruthy());
  });

  it('works fully by typing when speech APIs are unavailable', async () => {
    renderRoom(); // no speech APIs installed
    expect(screen.getByRole('button', { name: /Hear Question/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Start answering/ }).disabled).toBe(true);
    expect(screen.getByText(/can't read text aloud/)).toBeTruthy();
    expect(screen.getByText(/Voice input is not supported/)).toBeTruthy();
    submitAnswer.mockResolvedValue({ session: { ...base, status: 'completed', transcript: [...base.transcript, { role: 'candidate', kind: 'answer', text: 'typed' }, { role: 'interviewer', kind: 'closing', text: 'Thanks.' }] } });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'typed' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit answer/ }));
    await waitFor(() => expect(screen.getByText(/end of the interview/)).toBeTruthy());
  });

  it('rejects an empty answer without calling the API and shows a mic error message', () => {
    withSpeech(); renderRoom();
    fireEvent.click(screen.getByRole('button', { name: /Submit answer/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/Write or dictate/);
    expect(submitAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Start answering/ }));
    act(() => { recs[0].onerror({ error: 'not-allowed' }); recs[0].onend(); });
    expect(screen.getAllByRole('alert').some((a) => /Microphone access/.test(a.textContent))).toBe(true);
  });

  it('auto-read speaks the question once when enabled and remembers the choice', () => {
    withSpeech(); renderRoom();
    fireEvent.click(screen.getByLabelText(/Read questions aloud automatically/));
    expect(spoken).toHaveLength(1);
    expect(localStorage.getItem('thinktrace.autoRead')).toBe('1');
  });
});

const problem = {
  title: 'Two Sum', difficulty: 'easy', statement: 'Given an array of integers nums and a target, return the indices of the two numbers that add up to target.',
  examples: [{ input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'nums[0] + nums[1] = 9.' }],
  constraints: ['2 <= nums.length <= 10^4'], inputFormat: 'An array and a target', outputFormat: 'Two indices', topic: 'arrays',
};
const dsaText = `Two Sum (easy)\n\n${problem.statement}\n\nBefore writing any code, walk me through your initial approach.`;
const dsa = {
  ...base, type: 'dsa', typeLabel: 'DSA / Coding Interview', difficulty: 'easy', totalQuestions: 2,
  transcript: [{ role: 'interviewer', kind: 'problem', text: dsaText, problem }],
};

describe('Coding interview workspace', () => {
  it('shows the problem, examples, constraints, editor and an honest no-execution note', async () => {
    withSpeech(); renderRoom(dsa);
    expect(screen.getByRole('heading', { name: 'Two Sum' })).toBeTruthy();
    expect(screen.getByText('nums = [2,7,11,15], target = 9')).toBeTruthy();
    expect(screen.getByText('2 <= nums.length <= 10^4')).toBeTruthy();
    expect(screen.getByText(/walk me through your initial approach/)).toBeTruthy();
    expect((await screen.findByTestId('monaco')).getAttribute('data-language')).toBe('python');
    expect(screen.getByRole('button', { name: /Run sample tests/ }).disabled).toBe(true);
    expect(screen.getByText(/Code is not executed/)).toBeTruthy();
  });

  it('Hear Question on the problem card reads the whole problem aloud', () => {
    withSpeech(); renderRoom(dsa);
    fireEvent.click(screen.getByRole('button', { name: /Hear Question/ }));
    expect(spoken.map((u) => u.text).join(' ')).toMatch(/Two Sum/);
    expect(screen.getByTestId('interviewer-status').textContent).toMatch(/Speaking/);
  });

  it('Submit code sends code and language with the explanation', async () => {
    withSpeech(); renderRoom(dsa);
    submitAnswer.mockResolvedValue({ session: { ...dsa, transcript: [...dsa.transcript, { role: 'candidate', kind: 'code', text: 'one pass', code: 'def f(): return 1', language: 'python' }, { role: 'interviewer', kind: 'follow_up', text: 'What is the complexity?' }] } });
    const editor = await screen.findByTestId('monaco');
    fireEvent.change(editor, { target: { value: 'def f(): return 1' } });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'one pass' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit code/ }));
    await waitFor(() => expect(submitAnswer).toHaveBeenCalledWith('abc', 'one pass', { code: 'def f(): return 1', language: 'python' }));
    await waitFor(() => expect(screen.getByText('What is the complexity?')).toBeTruthy());
    expect(screen.getByText(/Show submitted python code/)).toBeTruthy();
  });

  it('refuses to submit an untouched starter template, and Submit answer needs an explanation', async () => {
    withSpeech(); renderRoom(dsa);
    await screen.findByTestId('monaco');
    fireEvent.click(screen.getByRole('button', { name: /Submit code/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/Write some code/);
    fireEvent.click(screen.getByRole('button', { name: /Submit answer/ }));
    expect(screen.getAllByRole('alert').some((a) => /Explain your thinking/.test(a.textContent))).toBe(true);
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it('changing language swaps the starter template but keeps the candidate\'s own code', async () => {
    withSpeech(); renderRoom(dsa);
    const editor = await screen.findByTestId('monaco');
    fireEvent.change(screen.getByLabelText('Your solution'), { target: { value: 'javascript' } });
    expect(editor.value).toMatch(/function solve/);
    expect(editor.getAttribute('data-language')).toBe('javascript');
    fireEvent.change(editor, { target: { value: 'const mine = 1;' } });
    fireEvent.change(screen.getByLabelText('Your solution'), { target: { value: 'python' } });
    expect(editor.value).toBe('const mine = 1;');
  });

  it('a new problem arrives with a fresh editor and no editor appears in non-coding interviews', async () => {
    withSpeech();
    const { unmount } = renderRoom(dsa);
    submitAnswer.mockResolvedValue({ session: { ...dsa, questionNumber: 2, transcript: [...dsa.transcript, { role: 'candidate', kind: 'code', text: '', code: 'x = 1', language: 'python' }, { role: 'interviewer', kind: 'problem', text: 'Valid Parentheses (easy)\n\nGiven a string of brackets decide if it is valid.\n\nBefore writing any code, walk me through your initial approach.', problem: { ...problem, title: 'Valid Parentheses' } }] } });
    fireEvent.change(await screen.findByTestId('monaco'), { target: { value: 'x = 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit code/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Valid Parentheses' })).toBeTruthy());
    expect(screen.getByTestId('monaco').value).toMatch(/Write your solution here/);
    unmount();
    renderRoom(); // web interview
    expect(screen.queryByTestId('monaco')).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit code/ })).toBeNull();
  });
});
