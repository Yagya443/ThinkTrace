import { AppError } from "../utils/AppError.js";
import { config } from "../config.js";

const API = "https://api.github.com";

export function parseGithubUrl(raw) {
    let u;
    try {
        u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
        return null;
    }
    if (!["github.com", "www.github.com"].includes(u.hostname.toLowerCase()))
        return null;
    const [owner, repo] = u.pathname.split("/").filter(Boolean);
    if (!owner || !/^[A-Za-z0-9-]{1,39}$/.test(owner)) return null;
    return { owner, repo: repo ? repo.replace(/\.git$/, "") : null };
}

async function gh(path, accept = "application/vnd.github+json") {
    const headers = { Accept: accept, "User-Agent": "ThinkTrace" };
    if (config.githubToken)
        headers.Authorization = `Bearer ${config.githubToken}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(`${API}${path}`, {
            headers,
            signal: ctrl.signal,
        });
        if (res.status === 404)
            throw new AppError(
                "That GitHub profile or repository was not found (is it public?).",
                404,
                "GITHUB_NOT_FOUND",
            );
        if (res.status === 403 || res.status === 429)
            throw new AppError(
                "GitHub rate limit reached. Try again later or paste your project details instead.",
                429,
                "GITHUB_RATE_LIMIT",
            );
        if (!res.ok)
            throw new AppError(
                "GitHub is unavailable right now.",
                502,
                "GITHUB_UNAVAILABLE",
            );
        return accept.includes("raw") ? res.text() : res.json();
    } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(
            "Could not reach GitHub.",
            502,
            "GITHUB_UNAVAILABLE",
        );
    } finally {
        clearTimeout(timer);
    }
}

const slim = (r) => ({
    name: r.name,
    description: (r.description || "").slice(0, 200),
    language: r.language || null,
    topics: (r.topics || []).slice(0, 6),
    stars: r.stargazers_count || 0,
});

/** Returns { owner, repos: [{name, description, language, topics, stars, readme?}], languages: [...] } */
export async function fetchGithubContext(raw) {
    const parsed = parseGithubUrl(raw);
    if (!parsed)
        throw new AppError(
            "Enter a GitHub profile or repository URL, e.g. https://github.com/username.",
            400,
            "BAD_URL",
        );

    if (parsed.repo) {
        const r = await gh(`/repos/${parsed.owner}/${parsed.repo}`);
        const repo = slim(r);
        try {
            const readme = await gh(
                `/repos/${parsed.owner}/${parsed.repo}/readme`,
                "application/vnd.github.raw",
            );
            repo.readme = readme
                .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
                .replace(/\s+/g, " ")
                .slice(0, 1500);
        } catch {
            /* README is optional */
        }
        return {
            owner: parsed.owner,
            repos: [repo],
            languages: repo.language ? [repo.language] : [],
        };
    }

    const list = await gh(
        `/users/${parsed.owner}/repos?per_page=40&sort=pushed`,
    );
    const own = list.filter((r) => !r.fork && !r.archived);
    const top = own
        .sort(
            (a, b) =>
                b.stargazers_count - a.stargazers_count ||
                new Date(b.pushed_at) - new Date(a.pushed_at),
        )
        .slice(0, 6)
        .map(slim);
    const counts = {};
    own.forEach((r) => {
        if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
    });
    const languages = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([l]) => l);
    if (!top.length)
        throw new AppError(
            "That GitHub profile has no public original repositories to use.",
            404,
            "GITHUB_EMPTY",
        );
    return { owner: parsed.owner, repos: top, languages };
}
