const KEY = 'thinktrace.history.v1';
export function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
export function saveCompletedInterview(session) {
  if (!session?.report || session.status !== 'completed') return;
  try {
    const previous = readHistory().filter((item) => item.id !== session.id);
    const item = {
      id: session.id, type: session.type, typeLabel: session.typeLabel,
      difficulty: session.difficulty, difficultyHistory: session.difficultyHistory,
      completedAt: session.completedAt || new Date().toISOString(), report: session.report,
    };
    localStorage.setItem(KEY, JSON.stringify([item, ...previous].slice(0, 30)));
  } catch { /* storage may be disabled or full; current report remains available */ }
}
