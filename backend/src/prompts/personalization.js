import { INTERVIEW_TYPES } from './interviewer.js';

export const EXTRACT_SYSTEM = 'You extract structured facts about a job candidate from documents they provided. Use ONLY facts present in the text. Never invent projects, technologies or employers. Output JSON only.';

export function extractPrompt({ resume, github, portfolio, notes }) {
  const parts = [];
  if (resume) parts.push(`RESUME:\n${resume}`);
  if (github) parts.push(`GITHUB (public repositories):\n${github}`);
  if (portfolio) parts.push(`PORTFOLIO WEBSITE:\n${portfolio}`);
  if (notes) parts.push(`CANDIDATE NOTES:\n${notes}`);
  return `${parts.join('\n\n')}

Return ONLY a JSON object:
{"skills":["..."],"technologies":["languages, frameworks, tools"],
 "projects":[{"name":"...","summary":"1-2 sentences of what it is and key decisions","tech":["..."]}],
 "experience":[{"role":"...","org":"...","highlights":"1-2 sentences"}],
 "education":["..."],"achievements":["..."]}
Limits: at most 12 skills, 15 technologies, 6 projects, 5 experience entries, 3 education, 5 achievements. Use empty arrays when nothing is present.`;
}

/** Compact private snapshot added once to the system prompt (never the raw resume). */
export function candidateSnapshot(profile) {
  if (!profile) return '';
  const tech = profile.technologies.slice(0, 10).join(', ');
  const projects = profile.projects.slice(0, 4).map((p) => p.name).join('; ');
  const roles = profile.experience.slice(0, 2).map((e) => [e.role, e.org].filter(Boolean).join(' at ')).join('; ');
  const lines = [tech && `Technologies: ${tech}`, projects && `Projects: ${projects}`, roles && `Experience: ${roles}`].filter(Boolean);
  return lines.length ? lines.join('\n').slice(0, 600) : '';
}

/** The one focus item for this question, phrased per interview type. Returns '' when no personalization applies. */
export function focusInstruction(type, item, profile) {
  if (type === 'dsa') {
    const langs = (profile?.technologies || []).filter((t) => /^(python|java|javascript|typescript|c\+\+|c#|go|rust|kotlin|swift|c)$/i.test(t)).slice(0, 3);
    return langs.length ? `PERSONALIZATION: the candidate works in ${langs.join(', ')}. Ask a standard data-structures/algorithms question; do not reference their projects.` : '';
  }
  if (!item) return '';
  const detail = `${item.kind}: ${item.label}${item.detail ? ` - ${item.detail}` : ''}`;
  const rule = type === 'project'
    ? 'The question MUST be about this item.'
    : 'Base the question on this item if it fits the track naturally.';
  return `PERSONALIZATION (private background from the candidate's own documents): ${detail}
${rule} Refer to it specifically (name the project/technology and ask about a decision, trade-off or problem), phrase it like "You mentioned...", and make sure the question is understandable on its own. Do not recite their resume or reveal that you were given a document.`;
}

/** Predefined (non-AI) question built from the candidate's real data, used only in demo mode. */
export function templateQuestion(type, item) {
  if (!item) return '';
  if (item.kind === 'project') {
    const tech = item.tech?.length ? ` using ${item.tech.slice(0, 3).join(', ')}` : '';
    return `You mentioned ${item.label}${tech}. What was the hardest technical decision you made in it, and what alternative did you consider?`;
  }
  if (item.kind === 'experience') {
    return type === 'behavioral'
      ? `Tell me about a challenge you faced as ${item.label}, and how you handled it.`
      : `In your role as ${item.label}, what was the most technically difficult thing you worked on?`;
  }
  return `Tell me more about ${item.label}: what did you learn from it?`;
}

export const _types = INTERVIEW_TYPES;
