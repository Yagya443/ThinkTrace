// Personalization tests: heuristics, SSRF guard, prompt economy. Fake Ollama captures prompts.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = [];
let aiExtract = null; // set per test to simulate model extraction
const server = http.createServer((req, res) => {
  let b = '';
  req.on('data', (d) => (b += d));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'test-model' }] }));
    const msgs = JSON.parse(b).messages;
    requests.push(msgs);
    const last = msgs.at(-1).content;
    let out;
    if (msgs[0].content.startsWith('You extract')) out = aiExtract || 'not json';
    else if (last.includes('first primary question')) out = { question: 'First personalised question about your project?', topic: 'project' };
    else if (last.startsWith('Ask the next PRIMARY')) out = { question: 'A new primary question please answer it?', topic: 'next' };
    else out = { evaluation: { correctness: 7, understanding: 7, reasoning: 7, communication: 7, technical_depth: 7 }, assessment: 'adequate', action: 'next_question', question: 'Next one about the other project, please?', topic: 'p2' };
    res.end(JSON.stringify({ message: { content: typeof out === 'string' ? out : JSON.stringify(out) } }));
  });
});
await new Promise((r) => server.listen(0, r));
process.env.OLLAMA_URL = `http://localhost:${server.address().port}`;
process.env.AI_MODEL = 'test-model';
const { buildContext, heuristicResume, detectTech, buildFocusQueue } = await import('../src/services/candidateContext.js');
const { isPrivateIp, assertPublicUrl } = await import('../src/utils/safeFetch.js');
const { parseGithubUrl } = await import('../src/services/github.js');
const { htmlToDigest } = await import('../src/services/portfolio.js');
const svc = await import('../src/services/interviewService.js');
test.after(() => server.close());

const RESUME = `Jane Doe
jane@example.com

Skills
JavaScript, React, Node.js, SQL

Projects
Wanderly | Travel planner
• Built a React travel application using React Query, Redux Toolkit and Express.
• Cached server state to cut API calls.
ChatRoom
• Real-time chat with WebSocket and MongoDB.

Experience
Frontend Intern, Acme Corp
• Migrated forms to React Hook Form.

Education
B.Tech Computer Science, 2025
UNRELATED_FILLER_LINE_${'x'.repeat(40)}`;

test('detectTech finds technologies without false positives', () => {
  const t = detectTech('Used React Query, Express and C++. We went to the java coffee shop? Go build.');
  assert.ok(t.includes('React Query') && t.includes('Express') && t.includes('C++'));
  assert.ok(!detectTech('I like to organise things').includes('Go'));
});

test('heuristic resume parsing extracts projects, tech and experience', () => {
  const p = heuristicResume(RESUME);
  assert.equal(p.projects[0].name, 'Wanderly');
  assert.ok(p.projects[0].tech.includes('React Query'));
  assert.equal(p.projects[1].name, 'ChatRoom');
  assert.ok(p.technologies.includes('Node.js'));
  assert.ok(p.experience[0].role.includes('Frontend Intern'));
  assert.ok(p.skills.includes('SQL'));
});

test('SSRF guard blocks private, loopback and metadata addresses', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '172.16.0.1', '::1', 'fd00::1']) assert.equal(isPrivateIp(ip), true, ip);
  assert.equal(isPrivateIp('8.8.8.8'), false);
  for (const u of ['http://localhost:5000', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'ftp://example.com', 'not a url', 'http://user:pw@example.com'])
    await assert.rejects(() => assertPublicUrl(u), u);
});

test('GitHub URL parsing and portfolio digest', () => {
  assert.deepEqual(parseGithubUrl('https://github.com/octocat'), { owner: 'octocat', repo: null });
  assert.deepEqual(parseGithubUrl('github.com/octocat/Hello-World.git'), { owner: 'octocat', repo: 'Hello-World' });
  assert.equal(parseGithubUrl('https://evil.com/octocat'), null);
  const d = htmlToDigest('<html><head><title>Jane</title><script>var secret=1</script></head><body><h1>Hi, I am Jane</h1><p>I build things</p></body></html>');
  assert.ok(d.includes('Title: Jane') && d.includes('Hi, I am Jane') && !d.includes('secret'));
});

test('no inputs gives an unusable context and failures become warnings, never errors', async () => {
  const none = await buildContext({});
  assert.equal(none.usable, false);
  const bad = await buildContext({ githubUrl: 'https://example.com/x', portfolioUrl: 'http://127.0.0.1:1', resumeWarning: 'Could not read that PDF.' });
  assert.equal(bad.usable, false);
  assert.deepEqual(bad.warnings.map((w) => w.source).sort(), ['github', 'portfolio', 'resume']);
});

test('model extraction is used when valid; heuristics when the model returns junk', async () => {
  aiExtract = { skills: ['React'], technologies: ['React', 'Express'], projects: [{ name: 'Wanderly', summary: 'Travel app using React Query', tech: ['React Query'] }], experience: [], education: [], achievements: [] };
  const a = await buildContext({ resumeText: RESUME });
  assert.equal(a.extractedBy, 'ai');
  aiExtract = null;
  const h = await buildContext({ resumeText: RESUME });
  assert.equal(h.extractedBy, 'heuristic');
  assert.equal(h.profile.projects[0].name, 'Wanderly');
});

test('personalized interview sends a compact focus, not the whole resume', async () => {
  aiExtract = null;
  const ctx = await buildContext({ resumeText: RESUME });
  requests.length = 0;
  const s = await svc.startInterview({ type: 'project', difficulty: 'medium', totalQuestions: 3, contextId: ctx.contextId });
  assert.equal(s.personalized, true);
  assert.deepEqual(s.contextSources, ['resume']);
  const first = JSON.stringify(requests.at(-1));
  assert.ok(first.includes('Wanderly'));
  assert.ok(!first.includes('UNRELATED_FILLER_LINE'));
  assert.ok(!first.includes('jane@example.com'));
  // Advancing moves to the next project focus
  requests.length = 0;
  await svc.submitAnswer(s.id, 'Some answer about the project.');
  assert.ok(JSON.stringify(requests.at(-1)).includes('ChatRoom'));
});

test('DSA never forces resume projects; no context means no personalization text', async () => {
  const ctx = await buildContext({ resumeText: RESUME });
  assert.deepEqual(buildFocusQueue(ctx.profile, 'dsa'), []);
  requests.length = 0;
  const plain = await svc.startInterview({ type: 'web', difficulty: 'easy', totalQuestions: 2 });
  assert.equal(plain.personalized, false);
  const sent = JSON.stringify(requests);
  assert.ok(!sent.includes('PERSONALIZATION') && !sent.includes('CANDIDATE BACKGROUND'));
  const bogus = await svc.startInterview({ type: 'web', difficulty: 'easy', totalQuestions: 2, contextId: 'does-not-exist' });
  assert.equal(bogus.personalized, false);
});

test('PDF resume parsing: real PDF works, blank/non-PDF give friendly errors', async () => {
  const fs = await import('node:fs');
  const { extractResumeText } = await import('../src/services/resumeParser.js');
  const dir = new URL('./fixtures/', import.meta.url);
  const text = await extractResumeText({ buffer: fs.readFileSync(new URL('sample-resume.pdf', dir)) });
  assert.ok(text.includes('Wanderly') && text.includes('React Query'));
  const pooled = Buffer.from(fs.readFileSync(new URL('sample-resume.pdf', dir))); // small buffers come from Node's pool
  assert.ok((await extractResumeText({ buffer: pooled })).includes('ChatRoom'));
  await assert.rejects(() => extractResumeText({ buffer: fs.readFileSync(new URL('blank.pdf', dir)) }), /No selectable text/);
  await assert.rejects(() => extractResumeText({ buffer: Buffer.from('hello world') }), /must be a PDF/);
  // end to end: PDF text -> profile
  const ctx = await buildContext({ resumeText: text });
  assert.ok(ctx.usable && ctx.profile.projects.some((p) => p.name === 'Wanderly'));
});

test('GitHub profile import (stubbed API): filters forks, ranks repos, merges into profile', async () => {
  const { fetchGithubContext } = await import('../src/services/github.js');
  const realFetch = globalThis.fetch;
  const repos = [
    { name: 'forked-lib', fork: true, archived: false, language: 'C', stargazers_count: 900, pushed_at: '2026-01-01', topics: [] },
    { name: 'wanderly', fork: false, archived: false, description: 'Travel planner', language: 'TypeScript', stargazers_count: 5, pushed_at: '2026-02-01', topics: ['react', 'express'] },
    { name: 'dotfiles', fork: false, archived: false, description: '', language: 'Shell', stargazers_count: 0, pushed_at: '2025-01-01', topics: [] },
  ];
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('https://api.github.com/users/jane/repos')) return new Response(JSON.stringify(repos), { status: 200 });
    if (String(url).includes('/users/ghost/')) return new Response('{}', { status: 404 });
    return realFetch(url, opts);
  };
  try {
    const gh = await fetchGithubContext('https://github.com/jane');
    assert.deepEqual(gh.repos.map((r) => r.name), ['wanderly', 'dotfiles']);
    assert.equal(gh.languages[0], 'TypeScript');
    await assert.rejects(() => fetchGithubContext('https://github.com/ghost'), /not found/);
    const ctx = await buildContext({ githubUrl: 'https://github.com/jane' });
    assert.ok(ctx.usable && ctx.sources.includes('github'));
    assert.equal(ctx.profile.projects[0].name, 'wanderly');
    assert.ok(ctx.profile.projects[0].tech.includes('TypeScript'));
  } finally { globalThis.fetch = realFetch; }
});
