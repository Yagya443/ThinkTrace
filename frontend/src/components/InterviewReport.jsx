import { Link } from "react-router-dom";

const SCORE_ROWS = [
    ["overall", "Overall"],
    ["technical", "Technical"],
    ["problemSolving", "Problem-solving"],
    ["communication", "Communication"],
    ["reasoning", "Reasoning"],
];
function ScoreCard({ label, score, featured = false }) {
    const width = `${Math.max(0, Math.min(100, score * 10))}%`;
    return (
        <div
            className={`rounded-xl border p-4 ${featured ? "border-accent-violet/50 bg-accent-violet/10 sm:col-span-2" : "border-ink-700 bg-ink-950/60"}`}
        >
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-slate-300">{label}</span>
                <strong className="text-xl text-white">
                    {score}
                    <span className="text-xs font-normal text-slate-500">
                        {" "}
                        / 10
                    </span>
                </strong>
            </div>
            <div
                className="mt-3 h-1.5 rounded-full bg-ink-700"
                role="progressbar"
                aria-label={`${label} score`}
                aria-valuemin="0"
                aria-valuemax="10"
                aria-valuenow={score}
            >
                <div
                    className="h-full rounded-full bg-gradient-to-r from-accent-blue to-accent-violet"
                    style={{ width }}
                />
            </div>
        </div>
    );
}

export default function InterviewReport({ session }) {
    const report = session.report;
    return (
        <section
            className="space-y-5 text-left"
            aria-labelledby="report-heading"
        >
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent-blue">
                        Your interview debrief
                    </p>
                    <h2
                        id="report-heading"
                        className="mt-1 text-2xl font-bold text-white"
                    >
                        Performance report
                    </h2>
                </div>
                <span className="rounded-full border border-ink-600 px-3 py-1 text-xs text-slate-400">
                    {report.evaluatedTurns} evaluated turns
                    {report.demoMode ? " · Demo scores" : ""}
                </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SCORE_ROWS.map(([key, label]) => (
                    <ScoreCard
                        key={key}
                        label={label}
                        score={report.scores[key]}
                        featured={key === "overall"}
                    />
                ))}
            </div>
            <p className="rounded-xl border border-ink-700 bg-ink-950/60 p-4 text-sm leading-relaxed text-slate-300">
                {report.summary}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-ink-700 bg-ink-950/50 p-4">
                    <h3 className="font-semibold text-white">Strengths</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                        {report.strengths.map((x) => (
                            <li key={x}>{x}</li>
                        ))}
                    </ul>
                </section>
                <section className="rounded-xl border border-ink-700 bg-ink-950/50 p-4">
                    <h3 className="font-semibold text-white">Focus areas</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                        {report.weaknesses.map((x) => (
                            <li key={x}>{x}</li>
                        ))}
                    </ul>
                </section>
            </div>
            <section className="rounded-xl border border-ink-700 bg-ink-950/50 p-4">
                <h3 className="font-semibold text-white">
                    Questions to revisit
                </h3>
                {report.questionsToImprove.length ? (
                    <ul className="mt-3 space-y-3">
                        {report.questionsToImprove.map((x, i) => (
                            <li
                                key={`${x.questionNumber}-${i}`}
                                className="border-l-2 border-accent-violet pl-3"
                            >
                                <p className="text-sm text-slate-200">
                                    <span className="text-slate-500">
                                        Q{x.questionNumber} ·{" "}
                                    </span>
                                    {x.question}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                    Practice: {x.focus.join(", ")}
                                    {x.skipped ? " · skipped" : ""}
                                </p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-2 text-sm text-slate-400">
                        No question fell below the improvement threshold this
                        time.
                    </p>
                )}
            </section>
            <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-ink-700 bg-ink-950/50 p-4">
                    <h3 className="font-semibold text-white">
                        Topics to revise
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {report.topicsToRevise.map((x) => (
                            <span
                                key={x}
                                className="rounded-full bg-ink-800 px-3 py-1 text-xs text-slate-300"
                            >
                                {x}
                            </span>
                        ))}
                    </div>
                </section>
                <section className="rounded-xl border border-ink-700 bg-ink-950/50 p-4">
                    <h3 className="font-semibold text-white">
                        Difficulty progression
                    </h3>
                    <div
                        className="mt-3 flex flex-wrap items-center gap-2"
                        aria-label="Difficulty progression"
                    >
                        {report.difficultyProgression.map((x, i) => (
                            <span
                                key={`${x}-${i}`}
                                className="flex items-center gap-2"
                            >
                                <span className="rounded-md border border-ink-600 px-2.5 py-1 text-xs capitalize text-slate-300">
                                    {x}
                                </span>
                                {i <
                                    report.difficultyProgression.length - 1 && (
                                    <span
                                        className="text-slate-600"
                                        aria-hidden
                                    >
                                        →
                                    </span>
                                )}
                            </span>
                        ))}
                    </div>
                </section>
            </div>
            <div className="flex flex-wrap gap-3">
                <Link to="/setup" className="btn-primary">
                    Practice again
                </Link>
                <Link to="/history" className="btn-ghost">
                    View interview history
                </Link>
            </div>
        </section>
    );
}
