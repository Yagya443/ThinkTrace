/** Coding-problem helpers: validation of model output, readable/speakable text, and an offline problem bank. */
const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : (v == null ? '' : JSON.stringify(v).slice(0, n)));

/** Returns a safe problem object, or null if the model output is unusable. */
export function normalizeProblem(d, difficulty) {
  if (!d || typeof d !== 'object') return null;
  const title = text(d.title, 80);
  const statement = text(d.statement, 1500);
  const examples = (Array.isArray(d.examples) ? d.examples : [])
    .map((e) => ({ input: text(e?.input, 300), output: text(e?.output, 300), explanation: text(e?.explanation, 300) }))
    .filter((e) => e.input && e.output).slice(0, 3);
  if (!title || statement.length < 30 || !examples.length) return null;
  const constraints = (Array.isArray(d.constraints) ? d.constraints : []).map((c) => text(c, 150)).filter(Boolean).slice(0, 6);
  return {
    title, statement, examples, constraints, difficulty,
    inputFormat: text(d.input_format ?? d.inputFormat, 200), outputFormat: text(d.output_format ?? d.outputFormat, 200),
    topic: text(d.topic, 40),
  };
}

/** Plain-text version used for the transcript, the model's history and Hear Question. */
export function problemToText(p) {
  const ex = p.examples.map((e, i) => `Example ${i + 1}:\nInput: ${e.input}\nOutput: ${e.output}${e.explanation ? `\nExplanation: ${e.explanation}` : ''}`).join('\n\n');
  const cons = p.constraints.length ? `\n\nConstraints:\n${p.constraints.map((c) => `- ${c}`).join('\n')}` : '';
  const io = p.inputFormat || p.outputFormat ? `\n\n${[p.inputFormat && `Input: ${p.inputFormat}`, p.outputFormat && `Output: ${p.outputFormat}`].filter(Boolean).join('\n')}` : '';
  return `${p.title} (${p.difficulty})\n\n${p.statement}${io}\n\n${ex}${cons}`;
}

const P = (title, difficulty, topic, statement, examples, constraints, inputFormat, outputFormat) =>
  ({ title, difficulty, topic, statement, examples, constraints, inputFormat, outputFormat });

// Hand-checked examples. Used in demo mode, or when the model's problem is unusable.
export const PROBLEM_BANK = [
  P('Two Sum', 'easy', 'arrays', 'Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. Exactly one solution exists and you may not use the same element twice.',
    [{ input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'nums[0] + nums[1] = 9.' }, { input: 'nums = [3,2,4], target = 6', output: '[1,2]', explanation: '' }],
    ['2 <= nums.length <= 10^4', '-10^9 <= nums[i], target <= 10^9', 'Exactly one valid answer exists'], 'An integer array and a target integer', 'Two indices in any order'),
  P('Valid Parentheses', 'easy', 'stacks', 'Given a string s containing only the characters ()[]{}, determine whether it is valid. Brackets must close in the correct order and every closing bracket must match the most recent unmatched opening bracket of the same type.',
    [{ input: 's = "()[]{}"', output: 'true', explanation: '' }, { input: 's = "(]"', output: 'false', explanation: '' }, { input: 's = "([)]"', output: 'false', explanation: 'The brackets close in the wrong order.' }],
    ['1 <= s.length <= 10^4', 's consists only of ()[]{}'], 'A string', 'A boolean'),
  P('Longest Substring Without Repeating Characters', 'medium', 'sliding window', 'Given a string s, return the length of the longest substring that contains no repeated characters.',
    [{ input: 's = "abcabcbb"', output: '3', explanation: 'The answer is "abc".' }, { input: 's = "bbbbb"', output: '1', explanation: '' }, { input: 's = "pwwkew"', output: '3', explanation: 'The answer is "wke".' }],
    ['0 <= s.length <= 5 * 10^4', 's consists of English letters, digits, symbols and spaces'], 'A string', 'An integer'),
  P('Merge Intervals', 'medium', 'sorting', 'Given an array of intervals where intervals[i] = [start, end], merge all overlapping intervals and return the non-overlapping intervals that cover all the input intervals.',
    [{ input: 'intervals = [[1,3],[2,6],[8,10],[15,18]]', output: '[[1,6],[8,10],[15,18]]', explanation: '[1,3] and [2,6] overlap, so they merge into [1,6].' }, { input: 'intervals = [[1,4],[4,5]]', output: '[[1,5]]', explanation: 'Intervals that touch are considered overlapping.' }],
    ['1 <= intervals.length <= 10^4', 'start <= end for every interval', '0 <= start, end <= 10^4'], 'A list of [start, end] pairs', 'A list of merged [start, end] pairs'),
  P('Trapping Rain Water', 'hard', 'two pointers', 'Given n non-negative integers representing an elevation map where each bar has width 1, compute how much water it can trap after raining.',
    [{ input: 'height = [0,1,0,2,1,0,1,3,2,1,2,1]', output: '6', explanation: '' }, { input: 'height = [4,2,0,3,2,5]', output: '9', explanation: '' }],
    ['1 <= height.length <= 2 * 10^4', '0 <= height[i] <= 10^5'], 'An integer array', 'An integer'),
  P('Minimum Window Substring', 'hard', 'sliding window', 'Given strings s and t, return the smallest substring of s that contains every character of t, including duplicates. If there is no such substring, return the empty string.',
    [{ input: 's = "ADOBECODEBANC", t = "ABC"', output: '"BANC"', explanation: '' }, { input: 's = "a", t = "aa"', output: '""', explanation: 'Both a characters are required but s only has one.' }],
    ['1 <= s.length, t.length <= 10^5', 's and t consist of English letters'], 'Two strings', 'A string'),
];

export function pickBankProblem(difficulty, usedTitles = []) {
  const pool = PROBLEM_BANK.filter((p) => p.difficulty === difficulty);
  const fresh = pool.filter((p) => !usedTitles.includes(p.title));
  const anyFresh = PROBLEM_BANK.filter((p) => !usedTitles.includes(p.title));
  return structuredClone((fresh[0] || anyFresh[0] || pool[0] || PROBLEM_BANK[0]));
}
