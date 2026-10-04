import axios from "axios";

const http = axios.create({ baseURL: "/api", timeout: 90000 });

/** Turns any failure into a short, user-friendly message. */
export function friendlyError(err) {
    if (err?.response?.data?.error) return err.response.data.error;
    if (err?.code === "ECONNABORTED")
        return "The request timed out. The model may be slow, so try again.";
    if (!err?.response)
        return "Cannot reach the ThinkTrace server. Make sure the backend is running.";
    return "Something went wrong. Please try again.";
}

export const getHealth = () => http.get("/health").then((r) => r.data);
/** formData may contain resume (PDF), github, portfolio, notes. All optional. */
export const buildContext = (formData) =>
    http
        .post("/context", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data);
export const startInterview = (payload) =>
    http.post("/interview/start", payload).then((r) => r.data);
export const getInterview = (id) =>
    http.get(`/interview/${id}`).then((r) => r.data);
export const getInterviewReport = (id) =>
    http.get(`/interview/${id}/report`).then((r) => r.data);
/** extra: { code, language } for coding interviews */
export const submitAnswer = (id, answer, extra) =>
    http
        .post(`/interview/${id}/answer`, { answer, ...(extra || {}) })
        .then((r) => r.data);
export const getCapabilities = () =>
    http.get("/capabilities").then((r) => r.data);
export const skipQuestion = (id) =>
    http.post(`/interview/${id}/skip`).then((r) => r.data);
