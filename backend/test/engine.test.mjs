// Run with: npm test  (starts a tiny fake Ollama; no real model needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let qCount = 0;
const reply = (obj) => (typeof obj === 'string' ? obj : JSON.stringify(obj));
const ev = (n) => ({ correctness: n, understanding: n, reasoning: n, communication: n, technical_depth: n });

const server = http.createServer((req, res) => {
  let b = '';
  req.on('data', (d) => (b += d));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'test-model' }] }));
    const msgs = JSON.parse(b).messages;
    const last = msgs[msgs.length - 1].content;
    let out;
    if (last.includes('not valid JSON')) out = 'still not json';
    else if (last.includes('first primary question')) out = { question: 'Q1: explain hashing?', topic: 'hashing' };
    else if (last.startsWith('Ask the next PRIMARY')) out = { question: `Generated Q${++qCount}: describe caching?`, topic: 'caching' };
    else {
      const ans = last.split('"""')[1];
      if (ans.includes('BADJSON')) out = 'this is not json at all';
      else if (ans.includes('STRONG')) out = { evaluation: ev(9), assessment: 'strong', action: 'harder_question', question: 'Harder: design an LRU cache?', topic: 'lru', ack: 'Noted.' };
      else if (ans.includes('STRUGGLE')) out = { evaluation: ev(2), assessment: 'struggling', action: 'hint', question: 'Hint: think about key lookup cost, what structure gives O(1)?' };
      else if (ans.includes('LOOP')) out = { evaluation: ev(5), assessment: 'incomplete', action: 'follow_up', question: 'Can you elaborate further on that point please?' };
      else if (ans.includes('WEAKADV')) out = { evaluation: ev(2), assessment: 'struggling', action: 'harder_question', question: 'Should be overridden to next question.', topic: 'x' };
      else out = { evaluation: ev(7), assessment: 'adequate', action: 'next_question', question: 'Q-next: what is a mutex?', topic: 'mutex' };
    }
    res.end(JSON.stringify({ message: { content: reply(out) } }));
  });
});
await new Promise((r) => server.listen(0, r));
process.env.OLLAMA_URL = `http://localhost:${server.address().port}`;
process.env.AI_MODEL = 'test-model';
const svc = await import('../src/services/interviewService.js');
const { extractJson } = await import('../src/utils/json.js');
test.after(() => server.close());

const setup = { type: 'web', difficulty: 'medium', totalQuestions: 3 };
const lastBot = (s) => [...s.transcript].reverse().find((m) => m.role === 'interviewer');

test('extractJson recovers fenced, wrapped and trailing-comma JSON', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! {"a":1,} thanks'), { a: 1 });
  assert.equal(extractJson('nope'), null);
});

test('rejects invalid setup and empty answers', async () => {
  await assert.rejects(() => svc.startInterview({ ...setup, type: 'x' }));
  const s = await svc.startInterview(setup);
  await assert.rejects(() => svc.submitAnswer(s.id, '   '));
});

test('strong answer raises difficulty and advances; evaluations stay private', async () => {
  const s = await svc.startInterview(setup);
  assert.equal(s.mode, 'ai');
  assert.equal(s.questionNumber, 1);
  const { session } = await svc.submitAnswer(s.id, 'STRONG answer');
  assert.equal(session.questionNumber, 2);
  assert.equal(session.difficulty, 'hard');
  assert.deepEqual(session.difficultyHistory, ['medium', 'hard']);
  assert.ok(lastBot(session).text.includes('Harder'));
  assert.equal(JSON.stringify(session).includes('evaluation'), false);
});

test('struggling gives one hint, then does not hint again', async () => {
  const s = await svc.startInterview(setup);
  const r1 = await svc.submitAnswer(s.id, 'STRUGGLE');
  assert.equal(lastBot(r1.session).kind, 'hint');
  assert.equal(r1.session.questionNumber, 1);
  const r2 = await svc.submitAnswer(s.id, 'STRUGGLE again');
  assert.notEqual(lastBot(r2.session).kind, 'hint');
});

test('follow-ups are capped, then the engine forces progression', async () => {
  const s = await svc.startInterview(setup);
  let r;
  for (let i = 0; i < 3; i++) { r = await svc.submitAnswer(s.id, 'LOOP'); assert.equal(r.session.questionNumber, 1); }
  r = await svc.submitAnswer(s.id, 'LOOP');
  assert.equal(r.session.questionNumber, 2);
});

test('struggling candidate is never given a harder question', async () => {
  const s = await svc.startInterview(setup);
  const { session } = await svc.submitAnswer(s.id, 'WEAKADV');
  assert.notEqual(session.difficulty, 'hard');
});

test('malformed JSON is handled without crashing', async () => {
  const s = await svc.startInterview(setup);
  const { session } = await svc.submitAnswer(s.id, 'BADJSON');
  assert.ok(lastBot(session).text.length > 10);
});

test('interview completes after the target number of primary questions', async () => {
  const s = await svc.startInterview({ ...setup, totalQuestions: 2 });
  let r = await svc.submitAnswer(s.id, 'a normal answer');
  assert.equal(r.session.status, 'active');
  assert.equal(r.session.questionNumber, 2);
  r = await svc.submitAnswer(s.id, 'another normal answer');
  assert.equal(r.session.status, 'completed');
  assert.equal(lastBot(r.session).kind, 'closing');
  await assert.rejects(() => svc.submitAnswer(s.id, 'too late'), /already finished/);
});

test('completed interview exposes a scored report and keeps it private until completion', async () => {
  const s = await svc.startInterview({ ...setup, totalQuestions: 1 });
  assert.throws(() => svc.getInterviewReport(s.id), /available when the interview is complete/);
  const { session } = await svc.submitAnswer(s.id, 'STRONG answer with an example');
  assert.equal(session.status, 'completed');
  assert.equal(session.report.scores.overall, 9);
  assert.equal(session.report.scores.technical, 9);
  assert.equal(session.report.scores.problemSolving, 9);
  assert.equal(session.report.scores.communication, 9);
  assert.equal(session.report.scores.reasoning, 9);
  assert.ok(Array.isArray(session.report.strengths));
  assert.ok(Array.isArray(session.report.weaknesses));
  assert.ok(Array.isArray(session.report.questionsToImprove));
  assert.ok(Array.isArray(session.report.topicsToRevise));
  assert.deepEqual(session.report.difficultyProgression, ['medium']);
  assert.equal(svc.getInterviewReport(s.id).report.summary, session.report.summary);
});

test('skip moves to the next question, keeps difficulty, resets probes, never leaks evaluations', async () => {
  const s = await svc.startInterview(setup);
  await svc.submitAnswer(s.id, 'LOOP'); // one probe on Q1
  const { session } = await svc.skipQuestion(s.id);
  assert.equal(session.questionNumber, 2);
  assert.equal(session.difficulty, 'medium');
  assert.ok(session.transcript.some((m) => m.kind === 'skip'));
  assert.equal(lastBot(session).kind, 'question');
  assert.equal(JSON.stringify(session).includes('"evaluation"'), false);
  const r = await svc.submitAnswer(s.id, 'LOOP'); // probes were reset, so a probe is allowed again
  assert.equal(r.session.questionNumber, 2);
});

test('skipping the last question completes the interview; skip after completion is rejected', async () => {
  const s = await svc.startInterview({ ...setup, totalQuestions: 1 });
  const { session } = await svc.skipQuestion(s.id);
  assert.equal(session.status, 'completed');
  await assert.rejects(() => svc.skipQuestion(s.id), /already finished/);
});
