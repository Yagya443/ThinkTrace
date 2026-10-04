import { Link } from "react-router-dom";
import { useState } from "react";
import InterviewReport from "../components/InterviewReport.jsx";
import { readHistory } from "../utils/history.js";

export default function History() {
    const [items] = useState(readHistory);
    const [openId, setOpenId] = useState(null);
    return (
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent-blue">
                        Your practice log
                    </p>
                    <h1 className="mt-2 text-3xl font-extrabold text-white">
                        Interview history
                    </h1>
                    <p className="mt-2 text-sm text-slate-400">
                        Saved on this device. Reports stay available after the
                        interview server restarts.
                    </p>
                </div>
                <Link to="/setup" className="btn-primary">
                    New interview
                </Link>
            </div>
            {!items.length ? (
                <section className="panel mt-8 px-5 py-12 text-center">
                    <h2 className="text-lg font-semibold text-white">
                        No completed interviews yet
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                        Finish your first session and your report will appear
                        here.
                    </p>
                    <Link to="/setup" className="btn-primary mt-5">
                        Set up an interview
                    </Link>
                </section>
            ) : (
                <div className="mt-8 space-y-4">
                    {items.map((item) => (
                        <article key={item.id} className="panel p-4 sm:p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="font-semibold text-white">
                                            {item.typeLabel}
                                        </h2>
                                        <span className="rounded border border-ink-600 px-2 py-0.5 text-xs capitalize text-slate-400">
                                            {item.difficulty}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {new Date(
                                            item.completedAt,
                                        ).toLocaleString()}{" "}
                                        · {item.report.questionCount} questions
                                    </p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-slate-300">
                                        Score{" "}
                                        <strong className="text-white">
                                            {item.report.scores.overall}/10
                                        </strong>
                                    </span>
                                    <button
                                        type="button"
                                        className="btn-ghost !px-3 !py-2"
                                        aria-expanded={openId === item.id}
                                        onClick={() =>
                                            setOpenId(
                                                openId === item.id
                                                    ? null
                                                    : item.id,
                                            )
                                        }
                                    >
                                        {openId === item.id
                                            ? "Hide report"
                                            : "View report"}
                                    </button>
                                </div>
                            </div>
                            {openId === item.id && (
                                <div className="mt-5 border-t border-ink-700 pt-5">
                                    <InterviewReport
                                        session={{
                                            ...item,
                                            report: item.report,
                                        }}
                                    />
                                </div>
                            )}
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
