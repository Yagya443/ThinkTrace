import { extractResumeText } from "../services/resumeParser.js";
import { buildContext } from "../services/candidateContext.js";
import { AppError } from "../utils/AppError.js";

/** POST /api/context  (multipart: resume?, github?, portfolio?, notes?) - every field optional. */
export async function build(req, res) {
    const { github = "", portfolio = "", notes = "" } = req.body || {};
    let resumeText = "";
    let resumeWarning = "";
    if (req.file) {
        try {
            resumeText = await extractResumeText(req.file);
        } catch (e) {
            if (e instanceof AppError) resumeWarning = e.message;
            else throw e;
        }
    }
    const ctx = await buildContext({
        resumeText,
        resumeWarning,
        githubUrl: String(github),
        portfolioUrl: String(portfolio),
        notes: String(notes),
    });
    res.json({
        contextId: ctx.contextId,
        usable: ctx.usable,
        sources: ctx.sources,
        warnings: ctx.warnings,
        profile: ctx.profile,
        extractedBy: ctx.extractedBy || null,
    });
}
