import { randomUUID } from 'crypto';
import * as ollama from './ollama.js';
import { fallbackQuestion, simulatedTurn } from './fallback.js';
import {
  systemPrompt, firstQuestionPrompt, nextQuestionPrompt, turnPrompt, REPAIR_PROMPT,
  INTERVIEW_TYPES, DIFFICULTIES,
} from '../prompts/interviewer.js';
import { extractJson, clampScore } from '../utils/json.js';
import { getContext, buildFocusQueue } from './candidateContext.js';
import { dsaProblemPrompt, dsaTurnContext, STAGE_PROMPTS, APPROACH_LINE, LANGUAGES } from '../prompts/dsa.js';
import { normalizeProblem, problemToText, pickBankProblem } from './dsaProblems.js';
import { candidateSnapshot, focusInstruction, templateQuestion } from '../prompts/personalization.js';
import { AppError } from '../utils/AppError.js';
import { config } from '../config.js';

// Follow-up / clarify / hint turns allowed per primary question. Coding problems need more turns (approach, why, complexity, code).
const limits = (s) => (s.type === 'dsa' ? { probes: 6, hints: 2 } : { probes: 3, hints: 1 });
const MAX_CODE_CHARS = 12000;
const HISTORY_WINDOW = 12; // messages sent to the model (state summary carries the rest)
const PROBE_ACTIONS = ['follow_up', 'clarify', 'hint'];
const ADVANCE_ACTIONS = ['next_question', 'harder_question', 'easier_question'];
const ASSESSMENTS = ['strong', 'adequate', 'incomplete', 'struggling'];

const sessions = new Map(); // in-memory (resets on restart)

/* ---------- views ---------- */
function publicView(s) {
  return {
    id: s.id, type: s.type, typeLabel: INTERVIEW_TYPES[s.type], difficulty: s.difficulty,
    difficultyHistory: s.difficultyHistory,
    totalQuestions: s.totalQuestions, questionNumber: s.questionNumber,
    personalized: s.personalized, contextSources: s.contextSources, contextWarnings: s.contextWarnings,
    status: s.status, completedAt: s.completedAt || null, mode: s.mode, model: s.mode === 'ai' ? config.ai.model : null,
    transcript: s.transcript, // evaluations and reasons stay server-side
    ...(s.status === 'completed' ? { report: buildReport(s) } : {}),
  };
}

const round = (n) => Math.round(n * 10) / 10;
const dimensionLabels = {
  correctness: 'Technical accuracy', understanding: 'Technical understanding', reasoning: 'Reasoning',
  communication: 'Communication', technical_depth: 'Technical depth',
};
const topicMatchers = [
  ['arrays and hashing', /array|hash|map|set|duplicate|frequency/i],
  ['algorithms and complexity', /complexity|big.?o|runtime|time complexity|space complexity/i],
  ['data structures', /tree|graph|heap|stack|queue|linked list|trie/i],
  ['web fundamentals', /react|browser|javascript|http|api|css|html|frontend|backend/i],
  ['system design and trade-offs', /design|scale|trade.?off|architecture|cache|database/i],
  ['project decisions', /project|built|implemented|why did|decision/i],
  ['communication and examples', /example|explain|describe|team|conflict/i],
];
function topicsFor(text) {
  const found = topicMatchers.filter(([, re]) => re.test(text || '')).map(([label]) => label);
  return found.length ? found.slice(0, 2) : ['clear problem-solving explanations'];
}
function buildReport(s) {
  const evaluations = s.evaluations;
  const dims = Object.keys(dimensionLabels);
  const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const byQuestion = [...new Set(evaluations.map((e) => e.questionNumber))].map((questionNumber) => {
    const turns = evaluations.filter((e) => e.questionNumber === questionNumber);
    const source = turns.find((e) => e.primaryQuestion) || turns[0];
    return { questionNumber, primaryQuestion: source.primaryQuestion, skipped: turns.some((e) => e.skipped), turns,
      evaluation: Object.fromEntries(dims.map((key) => [key, mean(turns.map((e) => e.evaluation?.[key] ?? 0))])) };
  });
  const dimension = (key) => round(mean(byQuestion.map((q) => q.evaluation[key])));
  const scores = {
    overall: round(mean([
      dimension('correctness'), dimension('understanding'), dimension('reasoning'),
      dimension('communication'), dimension('technical_depth'),
    ])),
    technical: round(mean([dimension('correctness'), dimension('understanding'), dimension('technical_depth')])),
    problemSolving: round(mean([dimension('correctness'), dimension('reasoning')])),
    communication: dimension('communication'), reasoning: dimension('reasoning'),
  };
  const skipped = evaluations.filter((e) => e.skipped).length;
  const strengths = dims.map((key) => ({ label: dimensionLabels[key], score: dimension(key) }))
    .filter((x) => x.score >= 6.5).sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.label);
  const weaknesses = dims.map((key) => ({ label: dimensionLabels[key], score: dimension(key) }))
    .filter((x) => x.score <= 5.5).sort((a, b) => a.score - b.score).slice(0, 3).map((x) => x.label);
  const improvements = byQuestion.filter((q) => q.skipped || mean(dims.map((k) => q.evaluation[k])) < 6)
    .slice(0, 5).map((q) => ({ questionNumber: q.questionNumber, question: q.primaryQuestion, focus: topicsFor(q.primaryQuestion), skipped: q.skipped }));
  const recommendedTopics = [...new Set(improvements.flatMap((x) => x.focus))].slice(0, 5);
  if (!recommendedTopics.length) recommendedTopics.push('Keep practicing clear explanations and progressively harder questions');
  const answered = evaluations.filter((e) => !e.skipped).length;
  const summary = `You completed ${s.totalQuestions} ${s.type === 'dsa' ? 'coding' : ''} primary question${s.totalQuestions === 1 ? '' : 's'} and ${answered} evaluation turn${answered === 1 ? '' : 's'}${skipped ? `, with ${skipped} skipped question${skipped === 1 ? '' : 's'}` : ''}. Your overall score was ${scores.overall}/10. ${scores.overall >= 7.5 ? 'You showed a strong foundation; keep sharpening depth and consistency.' : scores.overall >= 5 ? 'You showed developing skills; targeted practice can make your answers more consistent.' : 'Use the improvement areas below as a focused practice plan, then try another interview.'}`;
  return {
    scores, strengths: strengths.length ? strengths : ['You completed the interview and worked through the questions.'],
    weaknesses: weaknesses.length ? weaknesses : ['No major scoring gap stood out; continue building depth with harder follow-ups.'],
    questionsToImprove: improvements, topicsToRevise: recommendedTopics,
    difficultyProgression: s.difficultyHistory, summary, questionCount: s.totalQuestions,
    evaluatedTurns: evaluations.length, skippedQuestions: skipped, demoMode: s.mode === 'fallback',
  };
}

export function validateSetup({ type, difficulty, totalQuestions }) {
  if (!INTERVIEW_TYPES[type]) throw new AppError('Choose a valid interview type.');
  if (!DIFFICULTIES.includes(difficulty)) throw new AppError('Choose a valid difficulty.');
  const n = Number(totalQuestions);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new AppError('Number of questions must be between 1 and 20.');
  return n;
}

/* ---------- model helpers ---------- */
function modelMessages(s, finalUser) {
  return [
    { role: 'system', content: systemPrompt(s) },
    ...s.history.slice(-HISTORY_WINDOW),
    { role: 'user', content: finalUser },
  ];
}

/** Next focus item (peek) and the prompt text for it. Empty strings when not personalized. */
const peekFocus = (s) => s.focusQueue[s.focusIdx] || null;
const focusTextFor = (s, item) => (s.personalized ? focusInstruction(s.type, item, s.profile) : '');

/** Calls the model expecting JSON; repairs once; returns { data|null, raw }. */
async function askJson(messages) {
  const raw = await ollama.chat(messages, { json: true });
  let data = extractJson(raw);
  if (data) return { data, raw };
  const retryRaw = await ollama.chat(
    [...messages, { role: 'assistant', content: raw }, { role: 'user', content: REPAIR_PROMPT }],
    { json: true },
  );
  data = extractJson(retryRaw);
  return { data, raw: data ? retryRaw : raw };
}

const looksLikeQuestion = (t) => typeof t === 'string' && t.length > 15 && t.length < 600 && !t.trim().startsWith('{');
const str = (v, max = 800) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Validate/normalise whatever the model returned into a safe turn object. */
export function normalizeTurn(data) {
  const ev = data?.evaluation || {};
  const evaluation = {
    correctness: clampScore(ev.correctness), understanding: clampScore(ev.understanding),
    reasoning: clampScore(ev.reasoning), communication: clampScore(ev.communication),
    technical_depth: clampScore(ev.technical_depth),
  };
  const assessment = ASSESSMENTS.includes(data?.assessment) ? data.assessment : null;
  return {
    evaluation, assessment, action: str(data?.action, 30), question: str(data?.question),
    ack: str(data?.ack, 220), topic: str(data?.topic, 60), reason: str(data?.reason, 300),
    valid: Boolean(data && assessment),
  };
}

function avgScore(ev) {
  const v = Object.values(ev);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** If the model's assessment is missing, derive one from its scores. */
function deriveAssessment(t) {
  if (t.assessment) return t.assessment;
  const a = avgScore(t.evaluation);
  return a >= 8 ? 'strong' : a >= 6 ? 'adequate' : a >= 4 ? 'incomplete' : 'struggling';
}

function shiftDifficulty(current, dir) {
  const i = DIFFICULTIES.indexOf(current);
  return DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, i + dir))];
}

/** Engine-side guardrails: the model proposes, the engine decides. */
export function decideAction(s, t, assessment) {
  const { probes: maxProbes, hints: maxHints } = limits(s);
  const mustAdvance = s.probes >= maxProbes;
  const allowedProbe = (a) => PROBE_ACTIONS.includes(a) && !mustAdvance && !(a === 'hint' && s.hints >= maxHints);
  let action = t.action;
  const wantsProbe = PROBE_ACTIONS.includes(action);
  if (wantsProbe && !allowedProbe(action)) action = null;
  if (!ADVANCE_ACTIONS.includes(action) && !allowedProbe(action)) {
    // Missing/invalid action: choose from the assessment.
    if (assessment === 'strong') action = s.probes >= 1 ? 'harder_question' : 'follow_up';
    else if (assessment === 'struggling') action = s.hints < maxHints && !mustAdvance ? 'hint' : 'easier_question';
    else if (assessment === 'incomplete' && !mustAdvance) action = 'follow_up';
    else action = 'next_question';
    if (PROBE_ACTIONS.includes(action) && !allowedProbe(action)) action = 'next_question';
  }
  // Strong answer after probing: stop probing and raise the bar. Struggling: never raise.
  if (assessment === 'strong' && s.probes >= 1 && PROBE_ACTIONS.includes(action)) action = 'harder_question';
  if (assessment === 'struggling' && action === 'harder_question') action = 'next_question';
  if (assessment === 'strong' && action === 'easier_question') action = 'next_question';
  return action;
}

async function generateNextQuestion(s, difficulty, item) {
  if (s.mode === 'ai') {
    try {
      const { data, raw } = await askJson(modelMessages(s, nextQuestionPrompt({ difficulty, topics: s.topics, focusText: focusTextFor(s, item) })));
      const q = str(data?.question) || (looksLikeQuestion(raw) ? raw : '');
      if (q) return { question: q, topic: str(data?.topic, 60) };
    } catch (err) {
      if (err.code === 'OLLAMA_UNAVAILABLE' || err.code === 'MODEL_UNAVAILABLE') throw err;
      /* otherwise use the predefined question below */
    }
  }
  const templated = s.personalized ? templateQuestion(s.type, item) : '';
  return { question: templated || fallbackQuestion(s.type, s.questionNumber), topic: item?.label?.slice(0, 60) || '' };
}

/* ---------- DSA helpers ---------- */
/** AI-generated problem when possible; hand-checked offline bank otherwise. Never returns an unusable problem. */
async function generateProblem(s, difficulty) {
  if (s.mode === 'ai') {
    try {
      const { data } = await askJson(modelMessages(s, dsaProblemPrompt({ difficulty, topics: [...s.usedProblems, ...s.topics] })));
      const p = normalizeProblem(data, difficulty);
      if (p && !s.usedProblems.includes(p.title)) return p;
    } catch (err) {
      if (err.code === 'OLLAMA_UNAVAILABLE' || err.code === 'MODEL_UNAVAILABLE') throw err;
    }
  }
  return pickBankProblem(difficulty, s.usedProblems);
}

function setProblem(s, problem, ack) {
  s.problem = problem;
  s.primaryQuestion = `${problem.title}: ${problem.statement}`;
  s.usedProblems.push(problem.title);
  if (problem.topic) s.topics.push(problem.topic);
  s.dsa = { approach: false, complexity: false, code: false };
  const body = `${ack}${problemToText(problem)}\n\n${APPROACH_LINE}`;
  s.history.push({ role: 'assistant', content: body });
  s.transcript.push({ role: 'interviewer', kind: 'problem', text: body, problem });
}

const COMPLEXITY_RE = /\bO\s*\(|time complexity|space complexity|linear time|quadratic|logarithmic|constant space/i;
function updateCoverage(s, text, code) {
  if (code) s.dsa.code = true;
  else if (text.split(/\s+/).filter(Boolean).length >= 6) s.dsa.approach = true;
  if (COMPLEXITY_RE.test(`${text}\n${code || ''}`)) s.dsa.complexity = true;
}
const missingDsa = (s) => ['approach', 'complexity', 'code'].filter((k) => !s.dsa[k]);

/* ---------- lifecycle ---------- */
export async function startInterview(body) {
  const totalQuestions = validateSetup(body);
  const { type, difficulty } = body;
  const status = await ollama.checkStatus();
  const s = {
    id: randomUUID(), type, difficulty, totalQuestions, questionNumber: 1,
    status: 'active', mode: 'ai', history: [], transcript: [], evaluations: [],
    primaryQuestion: '', probes: 0, hints: 0, topics: [], difficultyHistory: [difficulty],
    profile: null, personalized: false, contextSources: [], contextWarnings: [], focusQueue: [], focusIdx: 0, snapshot: '',
    problem: null, usedProblems: [], dsa: { approach: false, complexity: false, code: false },
  };
  const ctx = getContext(body.contextId);
  if (ctx?.usable) {
    s.profile = ctx.profile;
    s.focusQueue = buildFocusQueue(ctx.profile, type);
    s.snapshot = candidateSnapshot(ctx.profile);
    s.personalized = Boolean(s.snapshot || s.focusQueue.length);
    s.contextSources = ctx.sources;
    s.contextWarnings = ctx.warnings;
  }
  const firstFocus = peekFocus(s);
  s.focusIdx = firstFocus ? 1 : 0;

  if (type === 'dsa') {
    s.mode = status.available && status.modelReady ? 'ai' : 'fallback';
    let problem;
    try { problem = await generateProblem(s, difficulty); } catch (err) {
      if (!['OLLAMA_UNAVAILABLE', 'MODEL_UNAVAILABLE'].includes(err.code)) throw err;
      s.mode = 'fallback';
      problem = pickBankProblem(difficulty, []);
    }
    setProblem(s, problem, '');
    sessions.set(s.id, s);
    return publicView(s);
  }

  let topic = '';
  if (status.available && status.modelReady) {
    try {
      const { data, raw } = await askJson([
        { role: 'system', content: systemPrompt(s) },
        { role: 'user', content: firstQuestionPrompt({ ...s, focusText: focusTextFor(s, firstFocus) }) },
      ]);
      s.primaryQuestion = str(data?.question) || (looksLikeQuestion(raw) ? raw : '');
      topic = str(data?.topic, 60);
    } catch (err) {
      if (!['OLLAMA_UNAVAILABLE', 'MODEL_UNAVAILABLE'].includes(err.code)) throw err;
      s.mode = 'fallback';
    }
  } else {
    s.mode = 'fallback';
  }
  if (!s.primaryQuestion) {
    const templated = s.personalized && s.mode === 'fallback' ? templateQuestion(type, firstFocus) : '';
    s.primaryQuestion = templated || fallbackQuestion(type, 0);
  }
  if (!topic && firstFocus) topic = firstFocus.label.slice(0, 60);
  if (topic) s.topics.push(topic);

  s.history.push({ role: 'assistant', content: s.primaryQuestion });
  s.transcript.push({ role: 'interviewer', kind: 'question', text: s.primaryQuestion });
  sessions.set(s.id, s);
  return publicView(s);
}

function getSession(id) {
  const s = sessions.get(id);
  if (!s) throw new AppError('Interview not found. It may have expired after a server restart.', 404, 'NOT_FOUND');
  return s;
}
export const getPublicInterview = (id) => publicView(getSession(id));
export const getInterviewReport = (id) => {
  const s = getSession(id);
  if (s.status !== 'completed') throw new AppError('Your report will be available when the interview is complete.', 409, 'NOT_COMPLETE');
  return { id: s.id, type: s.type, typeLabel: INTERVIEW_TYPES[s.type], difficulty: s.difficulty, difficultyHistory: s.difficultyHistory, status: s.status, mode: s.mode, completedAt: s.completedAt || null, report: buildReport(s) };
};

export async function submitAnswer(id, answer, extra = {}) {
  const s = getSession(id);
  if (s.status === 'completed') throw new AppError('This interview has already finished.', 409, 'COMPLETED');
  const text = typeof answer === 'string' ? answer.trim() : '';
  const code = typeof extra.code === 'string' ? extra.code.trim() : '';
  const language = extra.language;
  if (code) {
    if (s.type !== 'dsa') throw new AppError('Code can only be submitted in a coding interview.');
    if (!LANGUAGES.includes(language)) throw new AppError('Choose a supported language.');
    if (code.length > MAX_CODE_CHARS) throw new AppError('That code is too long (max 12,000 characters).');
  }
  if (!text && !code) throw new AppError(s.type === 'dsa' ? 'Explain your thinking or submit some code first.' : 'Please write an answer before submitting.');
  if (text.length > 6000) throw new AppError('Answer is too long (max 6000 characters).');
  // What the interviewer model reads: explanation plus the code, if any.
  const forModel = code ? `${text || '(no explanation given)'}\n\n[Submitted ${language} code]\n${code}` : text;

  // 1. Get the model's (or simulated) judgement. Nothing is mutated until this succeeds.
  let t;
  if (s.mode === 'ai') {
    const lim = limits(s);
    const allowed = s.probes >= lim.probes ? ADVANCE_ACTIONS : [...PROBE_ACTIONS.filter((a) => !(a === 'hint' && s.hints >= lim.hints)), ...ADVANCE_ACTIONS];
    const covered = { ...s.dsa };
    if (s.type === 'dsa') {
      if (code) covered.code = true; else if (text.split(/\s+/).filter(Boolean).length >= 6) covered.approach = true;
      if (COMPLEXITY_RE.test(forModel)) covered.complexity = true;
    }
    const { data } = await askJson(modelMessages(s, turnPrompt({
      s, answer: forModel, allowed, extra: s.type === 'dsa' ? dsaTurnContext(s, covered) : '',
      focusText: s.type !== 'dsa' && s.questionNumber < s.totalQuestions ? focusTextFor(s, peekFocus(s)) : '',
    })));
    t = normalizeTurn(data);
  } else {
    t = { ...normalizeTurn(null), ...simulatedTurn(text, s) };
  }
  const assessment = deriveAssessment(t);
  let action = decideAction(s, t, assessment);

  // Coding interviews: the engine makes sure approach, complexity and code are all covered before moving on.
  let forced = '';
  if (s.type === 'dsa') {
    updateCoverage(s, text, code);
    const missing = missingDsa(s);
    const lim = limits(s);
    if (ADVANCE_ACTIONS.includes(action) && missing.length && s.probes < lim.probes) {
      action = 'follow_up';
      forced = missing[0] === 'approach' ? 'What is your initial approach to this problem?' : STAGE_PROMPTS[missing[0]];
    } else if (s.mode === 'fallback' && (action === 'follow_up' || action === 'clarify') && missing.length) {
      forced = missing[0] === 'approach' ? 'What is your initial approach to this problem?' : STAGE_PROMPTS[missing[0]]; // demo mode: follow the interview stages
    } else if (PROBE_ACTIONS.includes(action) && !s.dsa.code && s.probes >= lim.probes - 2 && s.dsa.complexity) {
      action = 'follow_up';
      forced = STAGE_PROMPTS.code; // running out of turns: make sure they get to write code
    }
  }

  // 2. Record private evaluation.
  s.evaluations.push({
    questionNumber: s.questionNumber, difficulty: s.difficulty, primaryQuestion: s.primaryQuestion,
    answer: text, evaluation: t.evaluation, assessment, action, reason: t.reason,
    ...(code ? { code: code.slice(0, 4000), language } : {}),
    simulated: Boolean(t.simulated), parsed: t.valid || Boolean(t.simulated),
  });
  s.history.push({ role: 'user', content: forModel.slice(0, 7000) });
  s.transcript.push(code ? { role: 'candidate', kind: 'code', text, code, language } : { role: 'candidate', kind: 'answer', text });

  // 3a. Probe on the same question.
  if (PROBE_ACTIONS.includes(action)) {
    const msg = forced || (looksLikeQuestion(t.question) ? t.question : 'Can you walk me through your reasoning in a bit more detail?');
    s.probes += 1;
    if (action === 'hint') s.hints += 1;
    s.history.push({ role: 'assistant', content: msg });
    s.transcript.push({ role: 'interviewer', kind: forced ? 'follow_up' : action, text: msg });
    return { session: publicView(s) };
  }

  // 3b. Finish this primary question.
  const dir = action === 'harder_question' ? 1 : action === 'easier_question' ? -1 : 0;
  const ack = t.ack && !t.simulated ? `${t.ack}\n\n` : '';
  const preset = looksLikeQuestion(t.question) && t.question !== s.primaryQuestion ? { question: t.question, topic: t.topic } : null;
  await finishPrimary(s, { dir, ack, preset });
  return { session: publicView(s) };
}

/** Ends the current primary question: either closes the interview or moves to the next question. */
async function finishPrimary(s, { dir, ack, preset }) {
  if (s.questionNumber >= s.totalQuestions) {
    const closing = `${ack}That's all the questions I have. Thank you for your time.`.trim();
    s.status = 'completed';
    s.completedAt = new Date().toISOString();
    s.history.push({ role: 'assistant', content: closing });
    s.transcript.push({ role: 'interviewer', kind: 'closing', text: closing });
    return;
  }
  const nextDifficulty = shiftDifficulty(s.difficulty, dir);
  if (s.type === 'dsa') {
    const problem = await generateProblem(s, nextDifficulty);
    s.questionNumber += 1; s.probes = 0; s.hints = 0; s.difficulty = nextDifficulty;
    s.difficultyHistory.push(nextDifficulty);
    setProblem(s, problem, ack);
    s.transcript.at(-1).difficultyChange = dir;
    return;
  }
  const focusItem = peekFocus(s);
  const next = preset
    ? { question: preset.question, topic: preset.topic || focusItem?.label?.slice(0, 60) || '' }
    : await generateNextQuestion(s, nextDifficulty, focusItem);
  if (focusItem) s.focusIdx += 1;

  s.questionNumber += 1;
  s.probes = 0;
  s.hints = 0;
  s.difficulty = nextDifficulty;
  s.difficultyHistory.push(nextDifficulty);
  s.primaryQuestion = next.question;
  if (next.topic) s.topics.push(next.topic);
  const msg = `${ack}${next.question}`;
  s.history.push({ role: 'assistant', content: msg });
  s.transcript.push({ role: 'interviewer', kind: 'question', text: msg, difficultyChange: dir });
}

/** Candidate skips the current primary question. Recorded as skipped (counts against them in the report). */
export async function skipQuestion(id) {
  const s = getSession(id);
  if (s.status === 'completed') throw new AppError('This interview has already finished.', 409, 'COMPLETED');
  const zero = { correctness: 0, understanding: 0, reasoning: 0, communication: 0, technical_depth: 0 };
  s.evaluations.push({
    questionNumber: s.questionNumber, difficulty: s.difficulty, primaryQuestion: s.primaryQuestion,
    answer: '', evaluation: zero, assessment: 'skipped', action: 'skip', reason: 'Candidate skipped the question.',
    simulated: s.mode !== 'ai', parsed: true, skipped: true,
  });
  s.history.push({ role: 'user', content: '(The candidate skipped this question.)' });
  s.transcript.push({ role: 'candidate', kind: 'skip', text: 'Skipped this question.' });
  await finishPrimary(s, { dir: 0, ack: '', preset: null });
  return { session: publicView(s) };
}
