import { FiVolume2 } from "react-icons/fi";

const LEVEL = {
    easy: "text-emerald-300 border-emerald-500/30 bg-emerald-500/15",
    medium: "text-amber-300 border-amber-500/30 bg-amber-500/15",
    hard: "text-rose-300 border-rose-500/30 bg-rose-500/15",
};

export default function ProblemCard({ problem, onHear, hearDisabled }) {
    return (
        <section className="panel p-5" aria-label="Problem">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-white">
                        {problem.title}
                    </h2>
                    <span
                        className={`mt-1 inline-block capitalize rounded border px-2 py-0.5 text-xs font-semibold ${LEVEL[problem.difficulty] || ""}`}
                    >
                        {problem.difficulty}
                    </span>
                </div>
                <button
                    type="button"
                    className="btn-ghost !px-3 !py-1.5"
                    onClick={onHear}
                    disabled={hearDisabled}
                >
                    <FiVolume2 aria-hidden /> Hear Question
                </button>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
                {problem.statement}
            </p>

            {(problem.inputFormat || problem.outputFormat) && (
                <dl className="mt-4 text-sm space-y-1">
                    {problem.inputFormat && (
                        <div className="flex gap-2">
                            <dt className="text-slate-500 shrink-0">Input:</dt>
                            <dd className="text-slate-300">
                                {problem.inputFormat}
                            </dd>
                        </div>
                    )}
                    {problem.outputFormat && (
                        <div className="flex gap-2">
                            <dt className="text-slate-500 shrink-0">Output:</dt>
                            <dd className="text-slate-300">
                                {problem.outputFormat}
                            </dd>
                        </div>
                    )}
                </dl>
            )}

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Examples
            </h3>
            <div className="mt-2 space-y-3">
                {problem.examples.map((e, i) => (
                    <div
                        key={i}
                        className="rounded-lg border border-ink-700 bg-ink-800 p-3 font-mono text-xs leading-relaxed"
                    >
                        <div>
                            <span className="text-slate-500">Input:</span>{" "}
                            <span className="text-slate-100">{e.input}</span>
                        </div>
                        <div>
                            <span className="text-slate-500">Output:</span>{" "}
                            <span className="text-slate-100">{e.output}</span>
                        </div>
                        {e.explanation && (
                            <div className="mt-1 font-sans text-slate-400">
                                {e.explanation}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {problem.constraints.length > 0 && (
                <>
                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Constraints
                    </h3>
                    <ul className="mt-2 list-disc pl-5 text-sm text-slate-300 space-y-1 font-mono text-xs">
                        {problem.constraints.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}
