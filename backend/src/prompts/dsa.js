export const LANGUAGES = ['javascript', 'python', 'java', 'cpp'];
export const APPROACH_LINE = 'Before writing any code, walk me through your initial approach.';

export const STAGE_PROMPTS = {
  complexity: 'What are the time and space complexity of your approach, and why?',
  code: "When you're ready, write your solution in the editor and submit it. Talk me through anything tricky as you go.",
};

export function dsaProblemPrompt({ difficulty, topics }) {
  return `Generate a coding interview problem at ${difficulty} difficulty. Avoid these topics/titles already used: ${topics.join(', ') || 'none'}.
Rules: a classic, self-contained data-structures/algorithms problem; no external libraries; examples MUST be correct and verifiable by hand and consistent with the statement; do not include a solution or hints.
Return ONLY a JSON object:
{"title":"...","statement":"clear problem statement","examples":[{"input":"...","output":"...","explanation":"optional"}],
 "constraints":["..."],"input_format":"short description","output_format":"short description","topic":"short topic"}
Give 2-3 examples and 2-5 constraints.`;
}

/** Private context added to each DSA turn so the interviewer tests thinking, not only the final code. */
export function dsaTurnContext(s, covered) {
  const yn = (b) => (b ? 'yes' : 'no');
  return `DSA INTERVIEW STAGE (private):
- Problem: ${s.problem?.title}
- Approach discussed: ${yn(covered.approach)}; complexity discussed: ${yn(covered.complexity)}; code submitted: ${yn(covered.code)}
- You are judging the candidate's THINKING, not only the code. Typical probes: why the chosen data structure helps, edge cases, time/space complexity, a possible optimisation, or (after code is submitted) a bug you spotted. For a bug, ask a question that leads them to it; never state the fix.
- You cannot run code. If code was submitted, judge it by reading it carefully and say nothing about test results.
- The system, not you, supplies the next problem. For next/harder/easier actions leave "question" empty and only set "ack".`;
}
