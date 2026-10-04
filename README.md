# ThinkTrace

ThinkTrace is a personalized, adaptive mock interview platform built around a simple idea: interview practice works better when the interviewer reacts to the candidate's background, explanations, and code.

**Final project phase:** final evaluation and product polish. The app supports DSA / coding, web development, project / resume, behavioral, and full technical interviews. Candidate background is optional.

## Build for a Friend

This project was built for a friend preparing for software engineering interviews. Generic mock interviews often jump between disconnected questions and ignore the work a candidate has actually done. ThinkTrace can use an optional resume, public GitHub profile, portfolio, or project notes to ask more relevant questions, then adapt follow-ups to the candidate's answers. The goal is practice that feels closer to a thoughtful interviewer than a static question list.

## Features

- Adaptive interviews: one question at a time, concise follow-ups, clarification, hints, and difficulty changes based on private answer evaluations.
- Five interview tracks, adjustable difficulty and question count.
- Optional candidate context from a PDF resume, GitHub, portfolio, or project notes. Failed imports do not block the interview.
- DSA coding workspace with locally bundled Monaco, Python / JavaScript / Java / C++ templates, and a plain-text editor fallback. Submitted code is reviewed as text; arbitrary code is never executed.
- Browser-native question read-aloud and optional speech-to-text with a text answer fallback.
- Completion report with overall, technical, problem-solving, communication, and reasoning scores; strengths; focus areas; questions to revisit; topics to revise; interview summary; and difficulty progression.
- Interview history retained in browser storage on the current device (up to 30 completed reports).
- Honest demo mode when Ollama or the selected model is unavailable.
- Responsive layouts, loading and error messages, keyboard focus states, screen-reader labels, and reduced-motion support.

## Screenshots

_Add product screenshots here._

## Architecture

```text
React + Vite browser app -> Express API -> interview engine -> Ollama -> local model
                                  |                 |
                                  |                 +-- private evaluation -> final report
                                  +-- optional resume/GitHub/portfolio context
```

The browser never calls Ollama directly. Interview state and private evaluations are held in backend memory and reset when the server restarts. Completed report summaries are copied to local browser storage so the history screen remains useful after a restart. They do not sync between browsers or devices.

### Tech stack

- Frontend: React 18, Vite, Tailwind CSS, React Router, Monaco Editor, Vitest / Testing Library.
- Backend: Node.js 18+, Express, Ollama HTTP API, `pdf-parse`, Node test runner.
- AI: Ollama with Gemma by default. Any compatible local Ollama model can be selected.

### AI and scoring

The server asks the model for structured evaluations across correctness, understanding, reasoning, communication, and technical depth. The engine enforces question and follow-up limits and keeps these evaluations private while the interview is active. At completion, the report aggregates the stored scores and derives practice topics from questions that need improvement. In fallback/demo mode, the app clearly labels simulated assessments; those scores are not a substitute for model evaluation.

## Requirements and setup

Requires Node.js 18+ and npm. Install [Ollama](https://ollama.com) for AI-powered interviews.

```bash
ollama pull gemma3:4b
cp .env.example backend/.env
npm run install:all
```

On Windows PowerShell, copy the environment template with:

```powershell
Copy-Item .env.example backend/.env
```

Start the backend and frontend in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Open http://localhost:5173. Without Ollama, the app starts in labelled demo mode and uses built-in questions; it does not pretend that simulated feedback is a real AI assessment.

## Environment variables

Place these in `backend/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | Express API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origin |
| `AI_PROVIDER` | `ollama` | AI provider (Ollama) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `AI_MODEL` | `gemma3:4b` | Pulled Ollama model name |
| `AI_TIMEOUT_MS` | `60000` | Model request timeout |
| `GITHUB_TOKEN` | unset | Optional token to raise public GitHub API limits |

No API key is required for a local Ollama setup. Never commit a real `.env` file.

## Example interview

1. Choose **Web Development**, **Medium**, and five questions.
2. Optionally add project notes such as “React travel app using React Query and Express.”
3. Start the interview and answer the opening question.
4. ThinkTrace evaluates the answer privately and chooses a relevant follow-up, clarification, hint, or next question.
5. At the end, review the scored report and save it in local interview history.

For DSA, explain your approach, discuss complexity, and submit code. ThinkTrace does not execute submitted code; a secure sandbox is a future enhancement.

## API

- `GET /api/health` — model availability and demo/AI mode.
- `GET /api/capabilities` — currently reports code execution as unavailable.
- `POST /api/context` — optional multipart resume, GitHub URL, portfolio URL, and notes.
- `POST /api/interview/start` — create a session.
- `GET /api/interview/:id` — current public session; private evaluations are omitted.
- `POST /api/interview/:id/answer` — submit a text answer and optional DSA code.
- `POST /api/interview/:id/skip` — skip a primary question.
- `GET /api/interview/:id/report` — completed candidate-facing report; unavailable before completion.

## Privacy and open-weight models

With local Ollama, interview text and extracted candidate context are sent to the Ollama process configured on your machine rather than a hosted AI API. Public GitHub and portfolio URLs are fetched by the backend when provided. Speech recognition may use the browser vendor's service; typing never sends audio. Completed reports are stored in browser local storage on the current device. Sessions and raw evaluations remain in backend memory and are lost on server restart. This is a local development application, not a formal privacy guarantee.

Open-weight models such as Gemma can be run locally and swapped for another compatible model. Model output can be inaccurate: generated DSA examples and code judgements should be treated as interview discussion, not an authoritative correctness verdict.

## Tests and build

```bash
npm test
npm run build --prefix frontend
```

Backend tests use a small local fake Ollama server; no real model is needed. Frontend tests use Vitest and mocked browser APIs. Try Monaco and microphone / speaker behavior in a real browser for manual validation.

## Future improvements

- Secure isolated code execution with strict CPU, memory, time, and network limits.
- Durable, exportable interview history and report sharing.
- More robust browser-based accessibility and real-device testing.
- Further calibration of score consistency across local models.

## Troubleshooting

- **Demo / Fallback Mode:** start Ollama, pull the configured model, and start a new interview.
- **Cannot reach the server:** run `npm run dev:backend` and check port 5000.
- **Monaco appears as a text box:** the local editor bundle did not load; refresh and continue with the accessible fallback editor.
- **Interview not found:** sessions live in backend memory; a server restart clears active sessions. Completed reports already saved in browser history remain available.
- **Resume has no text:** scanned PDFs need OCR; paste key project details into the optional notes field.
- **Microphone unavailable:** browser speech recognition support varies. Typing is always available.
- **Portfolio context is sparse:** JavaScript-rendered pages may not expose text to the backend; use project notes.
