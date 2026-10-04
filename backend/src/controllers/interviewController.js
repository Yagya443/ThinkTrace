import * as svc from "../services/interviewService.js";
import * as ollama from "../services/ollama.js";
import { config } from "../config.js";
import { isExecutionSupported } from "../services/codeRunner.js";

export const health = async (_req, res) => {
    const status = await ollama.checkStatus();
    res.json({
        ok: true,
        provider: config.ai.provider,
        model: config.ai.model,
        ollamaAvailable: status.available,
        modelReady: status.modelReady,
        mode: status.available && status.modelReady ? "ai" : "fallback",
    });
};
export const start = async (req, res) =>
    res.status(201).json(await svc.startInterview(req.body || {}));
export const get = async (req, res) =>
    res.json(svc.getPublicInterview(req.params.id));
export const report = async (req, res) =>
    res.json(svc.getInterviewReport(req.params.id));
export const answer = async (req, res) =>
    res.json(
        await svc.submitAnswer(req.params.id, req.body?.answer, {
            code: req.body?.code,
            language: req.body?.language,
        }),
    );
export const capabilities = (_req, res) =>
    res.json({ codeExecution: isExecutionSupported });
export const skip = async (req, res) =>
    res.json(await svc.skipQuestion(req.params.id));
