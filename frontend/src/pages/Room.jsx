import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { FiVolume2, FiPause, FiPlay, FiSquare, FiMic, FiSkipForward, FiSend, FiPlayCircle } from 'react-icons/fi';
import { getInterview, submitAnswer, skipQuestion, friendlyError } from '../services/api.js';
import ModeBadge from '../components/ModeBadge.jsx';
import ProblemCard from '../components/ProblemCard.jsx';
import CodeEditor from '../components/CodeEditor.jsx';
import { LANGUAGES, STARTERS, isStarter } from '../utils/code.js';
import useSpeechSynthesis from '../hooks/useSpeechSynthesis.js';
import useSpeechRecognition from '../hooks/useSpeechRecognition.js';
import { interviewerState, mergeTranscript } from '../utils/voice.js';
import InterviewReport from '../components/InterviewReport.jsx';
import { saveCompletedInterview } from '../utils/history.js';

const KIND_LABEL = { problem: 'New problem', code: 'Your code', question: 'Question', follow_up: 'Follow-up', clarify: 'Clarification', hint: 'Hint', closing: 'Closing', skip: 'Skipped' };
const LEVEL_STYLE = {
  easy: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  hard: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
const STATE_DOT = { speaking: 'bg-accent-blue', listening: 'bg-rose-400', thinking: 'bg-accent-violet', paused: 'bg-amber-400', waiting: 'bg-slate-500', done: 'bg-emerald-400' };

function useTimer(running) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function loadAutoRead() { try { return localStorage.getItem('thinktrace.autoRead') === '1'; } catch { return false; } }
function saveAutoRead(v) { try { localStorage.setItem('thinktrace.autoRead', v ? '1' : '0'); } catch { /* storage unavailable */ } }

export default function Room() {
  const { id } = useParams();
  const { state } = useLocation();
  const [session, setSession] = useState(state?.session || null);
  const [loadError, setLoadError] = useState('');
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [autoRead, setAutoRead] = useState(loadAutoRead);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(STARTERS.python);
  const endRef = useRef(null);
  const done = session?.status === 'completed';
  const time = useTimer(!done && !paused);

  const tts = useSpeechSynthesis();
  const stt = useSpeechRecognition({ onFinal: (text) => setAnswer((a) => mergeTranscript(a, text)) });

  useEffect(() => {
    if (session) return;
    getInterview(id).then(setSession).catch((e) => setLoadError(friendlyError(e)));
  }, [id, session]);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [session?.transcript?.length, sending]);
  useEffect(() => { if (done) saveCompletedInterview(session); }, [done, session]);

  const interviewerMsgs = session ? session.transcript.filter((m) => m.role === 'interviewer') : [];
  const current = interviewerMsgs[interviewerMsgs.length - 1];
  const currentText = current?.text;
  const isDsa = session?.type === 'dsa';
  const problemEntry = session ? [...session.transcript].reverse().find((m) => m.kind === 'problem') : null;
  const problemKey = problemEntry?.problem?.title;

  // A new problem starts with a fresh editor.
  useEffect(() => { if (problemKey) setCode(STARTERS[language]); }, [problemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeLanguage(next) {
    setCode((c) => (isStarter(c) ? STARTERS[next] : c));
    setLanguage(next);
  }

  // Optionally read each new interviewer message aloud.
  const lastSpoken = useRef(null);
  useEffect(() => {
    if (!autoRead || !tts.supported || !currentText || paused || done) return;
    if (lastSpoken.current === currentText) return;
    lastSpoken.current = currentText;
    tts.speak(currentText);
  }, [autoRead, currentText, paused, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const silence = useCallback(() => { tts.stop(); stt.stop(); }, [tts.stop, stt.stop]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (paused) return;
    if (!answer.trim()) { setError(isDsa ? 'Explain your thinking first, or use Submit code.' : 'Write or dictate an answer before submitting.'); return; }
    silence();
    setSending(true); setError('');
    try {
      const res = await submitAnswer(id, answer);
      setSession(res.session);
      setAnswer('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function submitCode() {
    if (paused) return;
    if (isStarter(code)) { setError('Write some code in the editor before submitting it.'); return; }
    silence();
    setSending(true); setError('');
    try {
      const res = await submitAnswer(id, answer, { code, language });
      setSession(res.session);
      setAnswer('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  async function skip() {
    if (!confirmSkip) { setConfirmSkip(true); return; }
    setConfirmSkip(false);
    silence();
    setSending(true); setError('');
    try {
      const res = await skipQuestion(id);
      setSession(res.session);
      setAnswer('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  function togglePause() {
    if (paused) {
      setPaused(false);
      if (tts.paused) tts.resume();
    } else {
      setPaused(true);
      setConfirmSkip(false);
      stt.stop();
      if (tts.speaking) tts.pause();
    }
  }

  function toggleAutoRead(e) {
    setAutoRead(e.target.checked);
    saveAutoRead(e.target.checked);
    if (!e.target.checked) tts.stop();
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-slate-300">{loadError}</p>
        <Link to="/setup" className="btn-primary mt-6">Start a new interview</Link>
      </div>
    );
  }
  if (!session) return <p className="px-4 py-20 text-center text-slate-500">Loading interview…</p>;

  const history = session.transcript.slice(0, -1);
  const progress = done ? 100 : ((session.questionNumber - 1) / session.totalQuestions) * 100;
  const status = interviewerState({ completed: done, paused, thinking: sending, speaking: tts.speaking && !tts.paused, listening: stt.listening });
  const voiceError = tts.error || stt.error;
  const busy = sending || paused;


  const problemIsCurrent = isDsa && current.kind === 'problem';
  const panelText = problemIsCurrent ? current.text.split('\n\n').pop() : current.text;
  const hearText = current.text;

  const header = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-3 text-slate-400">
          <span className="font-semibold text-white">{session.typeLabel}</span>
          <span className={`capitalize rounded border px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[session.difficulty]}`} title="Current difficulty">{session.difficulty}</span>
          <span>{done ? 'Interview complete' : `Question ${session.questionNumber} / ${session.totalQuestions}`}</span>
        </div>
        <div className="flex items-center gap-3">
          <ModeBadge mode={session.mode} model={session.model} />
          <span className="font-mono text-slate-300" aria-label="Elapsed time">{time}</span>
        </div>
      </div>
      <div className="mt-3 h-1 rounded bg-ink-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label="Interview progress">
        <div className="h-1 rounded bg-gradient-to-r from-accent-blue to-accent-violet transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      {session.personalized && (
        <p className="mt-3 text-xs text-slate-400">
          Personalized from your {session.contextSources.map((x) => ({ resume: 'resume', github: 'GitHub', portfolio: 'portfolio', notes: 'project notes' }[x] || x)).join(', ')}.
        </p>
      )}
      {session.contextWarnings?.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200" aria-label="Background warnings">
          {session.contextWarnings.map((w, i) => <li key={i}>Could not use your {w.source === 'general' ? 'background' : w.source}: {w.message}</li>)}
        </ul>
      )}
      {session.mode === 'fallback' && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          Demo mode: no AI model is running. {isDsa ? 'Problems come from a built-in set and follow-ups are simulated; your thinking and code are not truly analysed.' : 'Follow-ups are simulated from answer length and your answers are not truly analysed.'}
        </p>
      )}
    </>
  );

  const historyEl = history.length > 0 && (
    <section className="space-y-3" aria-label="Earlier conversation">
      {history.map((m, i) => {
        if (m.kind === 'problem') {
          return <div key={i} className="mr-8 rounded-lg border-l-2 border-ink-600 bg-ink-900 px-4 py-2 text-xs text-slate-500">Earlier problem: {m.problem?.title} ({m.problem?.difficulty})</div>;
        }
        return (
          <div key={i} className={m.role === 'candidate'
            ? 'ml-8 rounded-lg bg-ink-800 border border-ink-700 px-4 py-3 text-sm whitespace-pre-wrap'
            : 'mr-8 rounded-lg border-l-2 border-ink-600 bg-ink-900 px-4 py-3 text-sm text-slate-400 whitespace-pre-wrap'}>
            <div className="text-xs text-slate-500 mb-1">{m.role === 'candidate' ? (m.kind === 'code' ? 'You (code submitted)' : 'You') : KIND_LABEL[m.kind] || 'Interviewer'}</div>
            {m.text}
            {m.kind === 'code' && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-accent-blue">Show submitted {m.language} code</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-ink-950 p-3 font-mono text-xs text-slate-300">{m.code}</pre>
              </details>
            )}
          </div>
        );
      })}
    </section>
  );

  const interviewerPanel = (
    <section className="panel p-6 border-l-2 !border-l-accent-violet" aria-label="Interviewer">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-accent-blue">{KIND_LABEL[current.kind] || 'Interviewer'}</p>
        <p className="inline-flex items-center gap-2 text-xs text-slate-400" role="status" aria-live="polite" data-testid="interviewer-status">
          <span className={`h-2 w-2 rounded-full ${STATE_DOT[status.key]} ${['speaking', 'listening', 'thinking'].includes(status.key) ? 'animate-pulse' : ''}`} aria-hidden />
          Interviewer: {status.label}
        </p>
      </div>
      <p className={`mt-2 font-semibold text-white leading-snug whitespace-pre-wrap ${isDsa ? 'text-lg' : 'text-xl'}`}>{panelText}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tts.speaking ? (
          <>
            {tts.paused
              ? <button type="button" className="btn-ghost" onClick={tts.resume} disabled={paused}><FiPlay aria-hidden /> Resume audio</button>
              : <button type="button" className="btn-ghost" onClick={tts.pause}><FiPause aria-hidden /> Pause audio</button>}
            <button type="button" className="btn-ghost" onClick={tts.stop}><FiSquare aria-hidden /> Stop</button>
          </>
        ) : !problemIsCurrent && (
          <button type="button" className="btn-ghost" onClick={() => tts.speak(hearText)} disabled={!tts.supported || paused} title={tts.supported ? undefined : 'Your browser cannot read text aloud'}>
            <FiVolume2 aria-hidden /> Hear Question
          </button>
        )}
        {tts.supported && (
          <label className="ml-auto flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={autoRead} onChange={toggleAutoRead} className="accent-accent-violet" /> Read questions aloud automatically
          </label>
        )}
      </div>
      {!tts.supported && <p className="mt-3 text-xs text-slate-500">Your browser can't read text aloud, so questions are shown on screen only.</p>}
    </section>
  );

  const voiceErrorEl = voiceError && (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
      <span>{voiceError}</span>
      <button type="button" className="underline shrink-0" onClick={() => { tts.clearError(); stt.clearError(); }}>Dismiss</button>
    </div>
  );

  const doneEl = (
    <section className="panel p-5 sm:p-7" aria-live="polite">
      <p className="mb-5 text-center text-sm text-slate-400">Interview complete · {session.typeLabel} · {session.difficulty} starting difficulty</p>
      {session.report ? <InterviewReport session={session} /> : <div role="status" className="text-center text-sm text-slate-400">Your report is not available for this session. You can still review the conversation above or start a new interview.<Link to="/setup" className="btn-primary mt-4">Start another interview</Link></div>}
    </section>
  );

  const mic = stt.listening
    ? <button type="button" className="btn-ghost !border-rose-400/60 !text-rose-300" onClick={stt.stop}><FiSquare aria-hidden /> Stop answering</button>
    : <button type="button" className="btn-ghost" onClick={stt.start} disabled={!stt.supported || busy} title={stt.supported ? undefined : 'Voice input is not supported in this browser'}><FiMic aria-hidden /> Start answering</button>;
  const skipBtn = (
    <button type="button" className="btn-ghost" onClick={skip} disabled={busy} onBlur={() => setConfirmSkip(false)}>
      <FiSkipForward aria-hidden /> {confirmSkip ? 'Confirm skip?' : 'Skip question'}
    </button>
  );
  const pauseBtn = (
    <button type="button" className="btn-ghost" onClick={togglePause} disabled={sending}>
      {paused ? <><FiPlay aria-hidden /> Resume</> : <><FiPause aria-hidden /> Pause</>}
    </button>
  );
  const pausedNote = paused && <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200" role="status">Interview paused. The timer is stopped. Press Resume to continue.</p>;
  const listeningNote = stt.listening && <p className="mt-1 text-xs text-rose-300" aria-live="polite">Listening… {stt.interim && <span className="italic text-slate-400">{stt.interim}</span>}</p>;
  const errorEl = error && <div role="alert" className="mt-2 text-sm text-red-300">{error}</div>;
  const voiceNote = (
    <p className="mt-3 text-xs text-slate-500">
      {stt.supported
        ? "Voice input uses your browser's speech service. In Chrome, audio may be sent to Google to be transcribed; typing never leaves your machine except to your local model."
        : 'Voice input is not supported in this browser (try Chrome, Edge or Safari). Typing works everywhere.'}
    </p>
  );

  // ---------- Coding interview workspace ----------
  if (isDsa) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        {header}
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 min-w-0">
            {problemEntry?.problem && (
              <ProblemCard problem={problemEntry.problem} hearDisabled={!tts.supported || paused || tts.speaking} onHear={() => tts.speak(problemEntry.text)} />
            )}
            {interviewerPanel}
            {voiceErrorEl}
            {historyEl}
            <div ref={endRef} />
          </div>
          <div className="min-w-0 space-y-3">
            {done ? doneEl : (
              <>
                {pausedNote}
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="language" className="text-sm font-semibold text-slate-300">Your solution</label>
                  <select id="language" value={language} onChange={(e) => changeLanguage(e.target.value)} disabled={busy}
                    className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-slate-200 focus:border-accent-blue focus:outline-none">
                    {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <CodeEditor value={code} onChange={setCode} language={LANGUAGES.find((l) => l.id === language).monaco} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-primary" onClick={submitCode} disabled={busy}><FiSend aria-hidden /> Submit code</button>
                  <button type="button" className="btn-ghost" disabled title="Running code needs a secure sandbox, which is a planned feature."><FiPlayCircle aria-hidden /> Run sample tests</button>
                  <span className="text-xs text-slate-500">Code is not executed. The interviewer reads it. Automated test running is a future feature.</span>
                </div>

                <label htmlFor="answer" className="block pt-2 text-sm font-semibold text-slate-300">Talk through your thinking</label>
                <textarea
                  id="answer" aria-label="Your answer" rows={4} value={answer} disabled={busy}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(); }}
                  placeholder="Explain your approach, trade-offs and complexity. Type or dictate. Ctrl+Enter sends."
                  className="w-full rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-slate-100 placeholder-slate-600 focus:border-accent-blue focus:outline-none disabled:opacity-60"
                />
                {listeningNote}
                {errorEl}
                <div className="flex flex-wrap items-center gap-2">
                  {mic}{skipBtn}{pauseBtn}
                  <button type="button" onClick={submit} disabled={busy} className="btn-primary ml-auto">{sending ? 'Sending…' : 'Submit answer'}</button>
                </div>
                {voiceNote}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Standard interview room ----------
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {header}
      {historyEl && <div className="mt-5">{historyEl}</div>}
      <div className="mt-5">{interviewerPanel}</div>
      <div ref={endRef} />
      {voiceErrorEl && <div className="mt-3">{voiceErrorEl}</div>}
      {done ? <div className="mt-5">{doneEl}</div> : (
        <div className="mt-5">
          {pausedNote}
          <label htmlFor="answer" className="sr-only">Your answer</label>
          <textarea
            id="answer" rows={5} value={answer} disabled={busy}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(); }}
            placeholder={stt.supported ? 'Type your answer, or press Start answering to dictate. Ctrl+Enter to submit.' : 'Type your answer. Ctrl+Enter to submit.'}
            className="w-full rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-slate-100 placeholder-slate-600 focus:border-accent-blue focus:outline-none disabled:opacity-60"
          />
          {listeningNote}
          {errorEl}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {mic}{skipBtn}{pauseBtn}
            <button type="button" onClick={submit} disabled={busy} className="btn-primary ml-auto">{sending ? 'Sending…' : 'Submit answer'}</button>
          </div>
          {voiceNote}
        </div>
      )}
    </div>
  );
}
