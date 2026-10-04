import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiUpload, FiX } from "react-icons/fi";
import {
    startInterview,
    buildContext,
    friendlyError,
} from "../services/api.js";

const TYPES = [
    {
        id: "dsa",
        title: "DSA / Coding",
        desc: "A coding problem, an editor, and an interviewer who asks how you think.",
    },
    {
        id: "web",
        title: "Web Development",
        desc: "Frontend, backend, browsers, APIs.",
    },
    {
        id: "project",
        title: "Project / Resume",
        desc: "Decisions and trade-offs in your own work.",
    },
    {
        id: "behavioral",
        title: "Behavioral / HR",
        desc: "Teamwork, conflict, motivation.",
    },
    {
        id: "full",
        title: "Full Technical",
        desc: "A mix across core CS and engineering.",
    },
];
const LEVELS = ["easy", "medium", "hard"];
const fieldCls =
    "w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-accent-blue focus:outline-none";

export default function Setup() {
    const nav = useNavigate();
    const fileRef = useRef(null);
    const [type, setType] = useState("dsa");
    const [difficulty, setDifficulty] = useState("medium");
    const [count, setCount] = useState(5);
    const [resume, setResume] = useState(null);
    const [github, setGithub] = useState("");
    const [portfolio, setPortfolio] = useState("");
    const [notes, setNotes] = useState("");
    const [phase, setPhase] = useState(""); // '', 'context', 'start'
    const [error, setError] = useState("");

    const hasBackground = Boolean(
        resume || github.trim() || portfolio.trim() || notes.trim(),
    );
    const loading = phase !== "";

    function pickFile(e) {
        const f = e.target.files?.[0];
        if (!f) return;
        if (
            f.type !== "application/pdf" &&
            !f.name.toLowerCase().endsWith(".pdf")
        ) {
            setError("Please choose a PDF file.");
            e.target.value = "";
            return;
        }
        if (f.size > 5 * 1024 * 1024) {
            setError("That file is too large (max 5 MB).");
            e.target.value = "";
            return;
        }
        setError("");
        setResume(f);
    }
    function clearBackground() {
        setResume(null);
        setGithub("");
        setPortfolio("");
        setNotes("");
        if (fileRef.current) fileRef.current.value = "";
    }

    async function start() {
        setError("");
        let context = null;
        try {
            if (hasBackground) {
                setPhase("context");
                const fd = new FormData();
                if (resume) fd.append("resume", resume);
                fd.append("github", github.trim());
                fd.append("portfolio", portfolio.trim());
                fd.append("notes", notes.trim());
                context = await buildContext(fd);
            }
            setPhase("start");
            const s = await startInterview({
                type,
                difficulty,
                totalQuestions: count,
                contextId: context?.contextId || undefined,
            });
            nav(`/interview/${s.id}`, { state: { session: s } });
        } catch (e) {
            setError(
                `${friendlyError(e)}${hasBackground ? " You can clear the optional background and start without it." : ""}`,
            );
            setPhase("");
        }
    }

    return (
        <div className="mx-auto max-w-3xl px-4 py-12">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
                Set up your interview
            </h1>
            <p className="mt-2 text-slate-400">
                Choose a track, a difficulty and how many main questions you
                want.
            </p>

            <fieldset className="mt-8">
                <legend className="text-sm font-semibold text-slate-300 mb-3">
                    Interview type
                </legend>
                <div className="grid sm:grid-cols-2 gap-3">
                    {TYPES.map((t) => (
                        <label
                            key={t.id}
                            className={`panel p-4 cursor-pointer transition ${type === t.id ? "border-accent-blue ring-1 ring-accent-blue" : "hover:border-ink-600"}`}
                        >
                            <input
                                type="radio"
                                name="type"
                                className="sr-only"
                                checked={type === t.id}
                                onChange={() => setType(t.id)}
                            />
                            <div className="font-semibold text-white">
                                {t.title}
                            </div>
                            <div className="text-sm text-slate-400 mt-1">
                                {t.desc}
                            </div>
                        </label>
                    ))}
                </div>
            </fieldset>

            <div className="mt-8 grid sm:grid-cols-2 gap-8">
                <fieldset>
                    <legend className="text-sm font-semibold text-slate-300 mb-3">
                        Difficulty
                    </legend>
                    <div className="flex gap-2">
                        {LEVELS.map((l) => (
                            <label
                                key={l}
                                className={`flex-1 text-center capitalize rounded-lg border px-3 py-2 text-sm font-semibold cursor-pointer transition ${difficulty === l ? "border-accent-violet bg-accent-violet/15 text-white" : "border-ink-700 text-slate-400 hover:bg-ink-800"}`}
                            >
                                <input
                                    type="radio"
                                    name="difficulty"
                                    className="sr-only"
                                    checked={difficulty === l}
                                    onChange={() => setDifficulty(l)}
                                />
                                {l}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div>
                    <label
                        htmlFor="count"
                        className="text-sm font-semibold text-slate-300 mb-3 block"
                    >
                        Number of questions:{" "}
                        <span className="text-white">{count}</span>
                    </label>
                    <input
                        id="count"
                        type="range"
                        min="1"
                        max="15"
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                        className="w-full accent-accent-violet"
                    />
                </div>
            </div>

            <details
                className="panel mt-8 p-5"
                open={hasBackground || undefined}
            >
                <summary className="cursor-pointer text-sm font-semibold text-white">
                    Your background{" "}
                    <span className="font-normal text-slate-500">
                        (optional: personalizes the questions)
                    </span>
                </summary>
                <p className="mt-3 text-xs text-slate-500">
                    Skip all of this and the interview still works. Only a short
                    summary of your projects and skills is sent to the model,
                    never the whole document. With a local Ollama model, this
                    stays on your machine, except the public GitHub/portfolio
                    pages ThinkTrace fetches.
                </p>
                <div className="mt-4 space-y-4">
                    <div>
                        <span className="block text-sm text-slate-300 mb-1">
                            Resume (PDF, up to 5 MB)
                        </span>
                        <input
                            ref={fileRef}
                            id="resume"
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={pickFile}
                            className="sr-only"
                        />
                        {resume ? (
                            <div className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm">
                                <span className="truncate">{resume.name}</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setResume(null);
                                        fileRef.current.value = "";
                                    }}
                                    aria-label="Remove resume"
                                    className="text-slate-400 hover:text-white"
                                >
                                    <FiX />
                                </button>
                            </div>
                        ) : (
                            <label
                                htmlFor="resume"
                                className="btn-ghost cursor-pointer"
                            >
                                <FiUpload aria-hidden /> Choose PDF
                            </label>
                        )}
                    </div>
                    <div>
                        <label
                            htmlFor="github"
                            className="block text-sm text-slate-300 mb-1"
                        >
                            GitHub profile or repository URL
                        </label>
                        <input
                            id="github"
                            className={fieldCls}
                            value={github}
                            onChange={(e) => setGithub(e.target.value)}
                            placeholder="https://github.com/username"
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="portfolio"
                            className="block text-sm text-slate-300 mb-1"
                        >
                            Portfolio website URL
                        </label>
                        <input
                            id="portfolio"
                            className={fieldCls}
                            value={portfolio}
                            onChange={(e) => setPortfolio(e.target.value)}
                            placeholder="https://your-portfolio.dev"
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="notes"
                            className="block text-sm text-slate-300 mb-1"
                        >
                            Or describe a project yourself
                        </label>
                        <textarea
                            id="notes"
                            rows={3}
                            maxLength={1500}
                            className={fieldCls}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g. A React travel app using React Query, Redux Toolkit and an Express API."
                        />
                    </div>
                    {hasBackground && (
                        <button
                            type="button"
                            onClick={clearBackground}
                            className="text-xs text-slate-400 underline hover:text-white"
                        >
                            Clear background
                        </button>
                    )}
                </div>
            </details>

            {error && (
                <div
                    role="alert"
                    className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                >
                    {error}
                </div>
            )}

            <button
                onClick={start}
                disabled={loading}
                className="btn-primary mt-8 px-8 py-3"
            >
                {phase === "context"
                    ? "Reading your background…"
                    : phase === "start"
                      ? "Preparing your interviewer…"
                      : "Start interview"}
            </button>
        </div>
    );
}
