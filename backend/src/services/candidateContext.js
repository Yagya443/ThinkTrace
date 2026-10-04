import { randomUUID } from 'crypto';
import * as ollama from './ollama.js';
import { fetchGithubContext } from './github.js';
import { fetchPortfolioContext } from './portfolio.js';
import { EXTRACT_SYSTEM, extractPrompt } from '../prompts/personalization.js';
import { extractJson } from '../utils/json.js';

const contexts = new Map();
export const getContext = (id) => (id ? contexts.get(id) || null : null);

const TECH = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Kotlin', 'Swift', 'PHP', 'Ruby', 'SQL',
  'React', 'Next.js', 'Vue', 'Angular', 'Svelte', 'Redux', 'Redux Toolkit', 'React Query', 'TanStack Query', 'Tailwind', 'HTML', 'CSS',
  'Node.js', 'Express', 'NestJS', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'GraphQL', 'REST', 'WebSocket',
  'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Firebase', 'Supabase', 'Prisma', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
  'Git', 'Linux', 'Jest', 'Vite', 'Webpack', 'TensorFlow', 'PyTorch', 'Pandas', 'Flutter', 'React Native'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TECH_RE = TECH.map((t) => [t, new RegExp(`(^|[^A-Za-z0-9+#])${esc(t)}($|[^A-Za-z0-9+#])`, 'i')]);

export const detectTech = (text) => TECH_RE.filter(([, re]) => re.test(text)).map(([t]) => t);
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const cap = (arr, n) => arr.slice(0, n);
const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const strArr = (v, n, len = 80) => (Array.isArray(v) ? cap(uniq(v.map((x) => s(x, len))), n) : []);

export const emptyProfile = () => ({ skills: [], technologies: [], projects: [], experience: [], education: [], achievements: [] });

/* ---------- heuristic extraction (works without an AI model) ---------- */
const HEADERS = {
  projects: /^(personal |academic |selected )?projects?\b/i,
  experience: /^(work |professional )?(experience|employment|internships?)\b/i,
  education: /^education\b/i,
  skills: /^(technical )?skills\b/i,
  achievements: /^(achievements|awards|honou?rs|certifications?)\b/i,
};
const isBullet = (l) => /^[•\-*▪◦●]/.test(l);
const unbullet = (l) => l.replace(/^[•\-*▪◦●]\s*/, '').trim();

export function heuristicResume(text) {
  const profile = emptyProfile();
  const sections = {};
  let cur = 'other';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const key = line.length < 40 && Object.keys(HEADERS).find((k) => HEADERS[k].test(line.replace(/[:\s]+$/, '')));
    if (key) { cur = key; sections[cur] = sections[cur] || []; continue; }
    (sections[cur] = sections[cur] || []).push(line);
  }
  const blocks = (lines) => {
    const out = [];
    for (const l of lines || []) {
      if (!isBullet(l) && l.length <= 100 && !/[.]$/.test(l)) out.push({ title: l, body: [] });
      else if (out.length) out.at(-1).body.push(unbullet(l));
      else out.push({ title: unbullet(l).slice(0, 80), body: [] });
    }
    return out;
  };
  profile.projects = cap(blocks(sections.projects).map((b) => {
    const body = b.body.join(' ').slice(0, 300);
    return { name: s(b.title.split(/\s[|–—-]\s|:/)[0], 60), summary: body, tech: cap(detectTech(`${b.title} ${body}`), 8) };
  }).filter((p) => p.name), 6);
  profile.experience = cap(blocks(sections.experience).map((b) => ({ role: s(b.title, 80), org: '', highlights: b.body.join(' ').slice(0, 300) })), 5);
  profile.education = cap((sections.education || []).map((l) => s(unbullet(l), 100)), 3);
  profile.achievements = cap((sections.achievements || []).map((l) => s(unbullet(l), 120)), 5);
  profile.skills = cap(uniq((sections.skills || []).join(',').split(/[,;|•\n]/).map((x) => s(x.replace(/^[A-Za-z ]{2,20}:/, ''), 30))), 12);
  profile.technologies = cap(detectTech(text), 15);
  return profile;
}

/* ---------- normalising / merging ---------- */
function normalizeProfile(d) {
  const p = emptyProfile();
  if (!d || typeof d !== 'object') return p;
  p.skills = strArr(d.skills, 12, 40);
  p.technologies = strArr(d.technologies, 15, 40);
  p.projects = cap((Array.isArray(d.projects) ? d.projects : []).map((x) => ({ name: s(x?.name, 60), summary: s(x?.summary, 300), tech: strArr(x?.tech, 8, 30) })).filter((x) => x.name), 6);
  p.experience = cap((Array.isArray(d.experience) ? d.experience : []).map((x) => ({ role: s(x?.role, 80), org: s(x?.org, 80), highlights: s(x?.highlights, 300) })).filter((x) => x.role || x.org), 5);
  p.education = strArr(d.education, 3, 100);
  p.achievements = strArr(d.achievements, 5, 120);
  return p;
}

function mergeGithub(profile, gh) {
  const have = new Set(profile.projects.map((p) => p.name.toLowerCase()));
  for (const r of gh.repos) {
    if (have.has(r.name.toLowerCase())) continue;
    const tech = uniq([r.language, ...(r.topics || []), ...detectTech(`${r.description} ${r.readme || ''}`)]).slice(0, 8);
    profile.projects.push({ name: r.name, summary: [r.description, r.readme && r.readme.slice(0, 200)].filter(Boolean).join(' ').slice(0, 300), tech });
  }
  profile.projects = cap(profile.projects, 8);
  profile.technologies = cap(uniq([...profile.technologies, ...gh.languages]), 15);
}

const githubText = (gh) => gh.repos.map((r) => `- ${r.name}${r.language ? ` (${r.language})` : ''}: ${r.description || 'no description'}${r.readme ? ` | README: ${r.readme.slice(0, 400)}` : ''}`).join('\n').slice(0, 2500);

/* ---------- main entry ---------- */
/**
 * Builds a compact candidate profile from any combination of optional sources.
 * Every failure becomes a warning; nothing here ever blocks starting an interview.
 */
export async function buildContext({ resumeText = '', resumeWarning = '', githubUrl = '', portfolioUrl = '', notes = '' } = {}) {
  const warnings = [];
  const sources = [];
  if (resumeWarning) warnings.push({ source: 'resume', message: resumeWarning });
  const resume = resumeText.trim();
  if (resume) sources.push('resume');
  const note = notes.trim().slice(0, 1500);
  if (note) sources.push('notes');

  let gh = null;
  if (githubUrl.trim()) {
    try { gh = await fetchGithubContext(githubUrl.trim()); sources.push('github'); }
    catch (e) { warnings.push({ source: 'github', message: e.message }); }
  }
  let portfolio = '';
  if (portfolioUrl.trim()) {
    try { portfolio = await fetchPortfolioContext(portfolioUrl.trim()); sources.push('portfolio'); }
    catch (e) { warnings.push({ source: 'portfolio', message: e.message }); }
  }

  if (!sources.length) return { contextId: null, usable: false, sources, warnings, profile: emptyProfile() };

  // Only compact, capped excerpts are ever sent to the model.
  let profile = null;
  let extractedBy = 'heuristic';
  const status = await ollama.checkStatus();
  if (status.available && status.modelReady) {
    try {
      const raw = await ollama.chat([
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: extractPrompt({ resume: resume.slice(0, 6000), github: gh ? githubText(gh) : '', portfolio: portfolio.slice(0, 3000), notes: note }) },
      ], { json: true });
      const d = extractJson(raw);
      if (d) { profile = normalizeProfile(d); extractedBy = 'ai'; }
    } catch { /* fall back to heuristics */ }
  }
  if (!profile) {
    profile = resume ? heuristicResume(resume) : emptyProfile();
    if (note) {
      profile.projects.push({ name: 'Project described by candidate', summary: note.slice(0, 300), tech: cap(detectTech(note), 8) });
      profile.technologies = cap(uniq([...profile.technologies, ...detectTech(note)]), 15);
    }
    if (portfolio) profile.technologies = cap(uniq([...profile.technologies, ...detectTech(portfolio)]), 15);
  }
  if (gh) mergeGithub(profile, gh);

  const total = profile.projects.length + profile.experience.length + profile.technologies.length + profile.skills.length;
  if (!total) {
    warnings.push({ source: 'general', message: 'Nothing useful could be extracted from the provided information, so the interview will not be personalized.' });
    return { contextId: null, usable: false, sources, warnings, profile };
  }
  const contextId = randomUUID();
  const ctx = { contextId, usable: true, sources, warnings, profile, extractedBy };
  contexts.set(contextId, ctx);
  return ctx;
}

/* ---------- selecting what each question should focus on ---------- */
export function buildFocusQueue(profile, type) {
  if (!profile || type === 'dsa') return [];
  const projects = profile.projects.map((p) => ({ kind: 'project', label: p.name, tech: p.tech, detail: p.summary }));
  const exp = profile.experience.map((e) => ({ kind: 'experience', label: [e.role, e.org].filter(Boolean).join(' at '), detail: e.highlights }));
  const ach = profile.achievements.map((a) => ({ kind: 'achievement', label: a, detail: '' }));
  const order = type === 'behavioral' ? [...exp, ...ach, ...projects] : type === 'full' ? interleave(projects, exp) : [...projects, ...exp];
  return cap(order, 8);
}
function interleave(a, b) { const out = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); } return out; }
