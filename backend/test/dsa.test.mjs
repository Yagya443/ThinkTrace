// DSA mode tests against a fake Ollama (no model needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let problemMode = 'good'; // 'good' | 'bad'
let n = 0;
const seen = [];
const server = http.createServer((req, res) => {
  let b = '';
  req.on('data', (d) => (b += d));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'test-model' }] }));
    const msgs = JSON.parse(b).messages;
    seen.push(msgs);
    const last = msgs.at(-1).content;
    let out;
    if (last.startsWith('Generate a coding interview problem')) {
      out = problemMode === 'bad' ? 'sorry I cannot' : {
        title: `Generated Problem ${++n}`, statement: 'Given an array of integers, find the length of the longest run of equal values.',
        examples: [{ input: '[1,1,2]', output: '2', explanation: 'two ones' }], constraints: ['1 <= n <= 10^5'],
        input_format: 'array', output_format: 'integer', topic: `topic${n}`,
      };
    } else {
      const ans = last.split('"""')[1] || '';
      const ev = { correctness: 7, understanding: 7, reasoning: 7, communication: 7, technical_depth: 7 };
      out = ans.includes('ADVANCE')
        ? { evaluation: ev, assessment: 'adequate', action: 'next_question', question: 'IGNORED new problem text', ack: 'Thanks.' }
        : { evaluation: ev, assessment: 'adequate', action: 'follow_up', question: 'Why does that data structure help here?' };
    }
    res.end(JSON.stringify({ message: { content: typeof out === 'string' ? out : JSON.stringify(out) } }));
  });
});
await new Promise((r) => server.listen(0, r));
process.env.OLLAMA_URL = `http://localhost:${server.address().port}`;
process.env.AI_MODEL = 'test-model';
const svc = await import('../src/services/interviewService.js');
const { PROBLEM_BANK, normalizeProblem, pickBankProblem } = await import('../src/services/dsaProblems.js');
const runner = await import('../src/services/codeRunner.js');
test.after(() => server.close());

const setup = { type: 'dsa', difficulty: 'medium', totalQuestions: 2 };
const lastBot = (s) => [...s.transcript].reverse().find((m) => m.role === 'interviewer');

test('DSA start produces a structured problem with examples, constraints and an approach prompt', async () => {
  problemMode = 'good';
  const s = await svc.startInterview(setup);
  const first = s.transcript[0];
  assert.equal(first.kind, 'problem');
  assert.equal(first.problem.difficulty, 'medium');
  assert.ok(first.problem.examples.length >= 1 && first.problem.constraints.length >= 1);
  assert.match(first.text, /Example 1:/);
  assert.match(first.text, /Constraints:/);
  assert.match(first.text, /initial approach/);
  assert.ok(JSON.stringify(seen.at(-1)).includes('You cannot run code'));
});

test('engine will not move on until approach, complexity and code are covered', async () => {
  problemMode = 'good';
  const s = await svc.startInterview(setup);
  // Candidate gives an approach; model tries to advance immediately -> engine asks for complexity.
  let r = await svc.submitAnswer(s.id, 'ADVANCE I would use a hashmap to count the longest run as I scan the array once');
  assert.equal(r.session.questionNumber, 1);
  assert.match(lastBot(r.session).text, /complexity/i);
  // Complexity covered; model tries to advance -> engine asks for code.
  r = await svc.submitAnswer(s.id, 'ADVANCE It is O(n) time and O(1) space because one pass');
  assert.equal(r.session.questionNumber, 1);
  assert.match(lastBot(r.session).text, /editor/i);
  assert.ok(JSON.stringify(seen.at(-1)).includes('DSA INTERVIEW STAGE'));
  // Code submitted; now advancing is allowed and a new problem arrives (model's text is ignored).
  r = await svc.submitAnswer(s.id, 'ADVANCE here is my solution', { code: 'def f(a):\n  return 1', language: 'python' });
  assert.equal(r.session.questionNumber, 2);
  const entry = lastBot(r.session);
  assert.equal(entry.kind, 'problem');
  assert.ok(!entry.text.includes('IGNORED'));
  const codeMsg = r.session.transcript.find((m) => m.kind === 'code');
  assert.equal(codeMsg.language, 'python');
  assert.match(codeMsg.code, /def f/);
  assert.equal(JSON.stringify(r.session).includes('"evaluation"'), false);
});

test('code submission validation', async () => {
  problemMode = 'good';
  const s = await svc.startInterview(setup);
  await assert.rejects(() => svc.submitAnswer(s.id, '', {}), /Explain your thinking/);
  await assert.rejects(() => svc.submitAnswer(s.id, 'x', { code: 'print(1)', language: 'cobol' }), /supported language/);
  await assert.rejects(() => svc.submitAnswer(s.id, 'x', { code: 'a'.repeat(12001), language: 'python' }), /too long/);
  const web = await svc.startInterview({ type: 'web', difficulty: 'easy', totalQuestions: 2 });
  await assert.rejects(() => svc.submitAnswer(web.id, 'x', { code: 'print(1)', language: 'python' }), /coding interview/);
  const r = await svc.submitAnswer(s.id, '', { code: 'console.log(1)', language: 'javascript' }); // code-only is fine
  assert.equal(r.session.transcript.at(-2).kind, 'code');
});

test('unusable model problem falls back to a valid bank problem without crashing', async () => {
  problemMode = 'bad';
  const s = await svc.startInterview({ ...setup, difficulty: 'hard' });
  const p = s.transcript[0].problem;
  assert.equal(s.mode, 'ai');
  assert.equal(p.difficulty, 'hard');
  assert.ok(p.examples.length >= 1 && p.statement.length > 30);
  problemMode = 'good';
});

test('skipping a coding problem brings the next problem', async () => {
  problemMode = 'good';
  const s = await svc.startInterview(setup);
  const { session } = await svc.skipQuestion(s.id);
  assert.equal(session.questionNumber, 2);
  assert.equal(lastBot(session).kind, 'problem');
  assert.notEqual(lastBot(session).problem.title, s.transcript[0].problem.title);
});

test('problem bank is well formed and normalizeProblem rejects junk', () => {
  const titles = new Set();
  for (const p of PROBLEM_BANK) {
    assert.ok(p.examples.length >= 1 && p.examples.every((e) => e.input && e.output), p.title);
    assert.ok(p.constraints.length >= 1);
    titles.add(p.title);
  }
  assert.equal(titles.size, PROBLEM_BANK.length);
  for (const d of ['easy', 'medium', 'hard']) assert.ok(PROBLEM_BANK.some((p) => p.difficulty === d));
  assert.equal(normalizeProblem(null, 'easy'), null);
  assert.equal(normalizeProblem({ title: 'x', statement: 'short', examples: [] }, 'easy'), null);
  assert.equal(pickBankProblem('easy', ['Two Sum']).title, 'Valid Parentheses');
});

test('code execution is clearly unavailable (future feature seam)', async () => {
  assert.equal(runner.isExecutionSupported, false);
  await assert.rejects(() => runner.runSamples(), /not available/);
});

test('demo mode (no Ollama) still serves a bank problem and enforces the same flow', async () => {
  const saved = process.env.OLLAMA_URL;
  const { config } = await import('../src/config.js');
  const prev = config.ai.url;
  config.ai.url = 'http://localhost:9'; // nothing listens here
  try {
    const s = await svc.startInterview(setup);
    assert.equal(s.mode, 'fallback');
    assert.equal(s.transcript[0].kind, 'problem');
    const r = await svc.submitAnswer(s.id, 'I would sort first and then scan neighbours to find the answer quickly');
    assert.equal(r.session.questionNumber, 1); // not allowed to move on without complexity and code
    assert.match(lastBot(r.session).text, /complexity/i); // demo mode follows the same stages
  } finally { config.ai.url = prev; process.env.OLLAMA_URL = saved; }
});
