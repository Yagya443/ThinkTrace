import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getHealth } from "../services/api.js";
import ModeBadge from "../components/ModeBadge.jsx";

export default function Landing() {
    const [health, setHealth] = useState(null);
    useEffect(() => {
        getHealth()
            .then(setHealth)
            .catch(() => setHealth(null));
    }, []);

    return (
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
            <div>
                <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.05]">
                    Practice with an interviewer that listens.
                </h1>
                <p className="mt-6 text-lg text-slate-400 max-w-xl">
                    ThinkTrace runs a mock technical interview on a local
                    open-weight model. Pick a track, answer in your own words,
                    and get questions that respond to what you said.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Link to="/setup" className="btn-primary px-7 py-3">
                        Set up an interview
                    </Link>
                    <ModeBadge mode={health?.mode} model={health?.model} />
                </div>
                {health === null && (
                    <p className="mt-4 text-sm text-slate-500">
                        Backend not detected yet. Start it with{" "}
                        <code className="font-mono text-slate-300">
                            npm run dev
                        </code>{" "}
                        in{" "}
                        <code className="font-mono text-slate-300">
                            backend/
                        </code>
                        .
                    </p>
                )}
            </div>

            <div
                className="panel p-6 shadow-2xl shadow-accent-violet/10"
                aria-hidden
            >
                <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Question 2 of 5</span>
                    <span className="font-mono">04:12</span>
                </div>
                <p className="mt-4 text-lg text-white font-semibold leading-snug">
                    Why would you use React Query instead of managing the
                    request with useEffect?
                </p>
                <div className="mt-5 rounded-lg bg-ink-800 border border-ink-700 p-4 text-sm text-slate-400">
                    It handles caching and refetching, so I don't have to track
                    loading and error state by hand...
                </div>
                <div className="mt-4 rounded-lg border-l-2 border-accent-violet bg-ink-800/60 px-4 py-3 text-sm text-slate-300">
                    What happens when two components request the same data at
                    the same moment?
                </div>
            </div>
        </div>
    );
}
