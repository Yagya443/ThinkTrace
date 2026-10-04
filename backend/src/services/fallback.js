// Demo content used ONLY when Ollama is unavailable. Flagged as fallback in the API/UI.
const QUESTIONS = {
  dsa: [
    'Given an array of integers and a target, how would you find two numbers that add up to the target? Walk me through your approach.',
    'How would you detect a cycle in a linked list?',
    'Explain how you would find the longest substring without repeating characters.',
  ],
  web: [
    'What is the difference between server state and client state in a React application?',
    'Explain how the browser event loop handles a setTimeout callback and a resolved Promise.',
    'How would you prevent unnecessary re-renders in a React component tree?',
  ],
  project: [
    'Tell me about a project you are proud of. What was your role and what was the hardest technical decision?',
    'Describe a bug in one of your projects that took a long time to find. How did you debug it?',
    'If you rebuilt your most recent project today, what would you change?',
  ],
  behavioral: [
    'Tell me about a time you disagreed with a teammate. How did you handle it?',
    'Describe a situation where you missed a deadline. What did you learn?',
    'Why do you want to work as a software engineer?',
  ],
  full: [
    'Explain the difference between a process and a thread.',
    'How would you design a URL shortener at a high level?',
    'What is the time complexity of searching in a balanced binary search tree and why?',
  ],
};

export function fallbackQuestion(type, index = 0) {
  const list = QUESTIONS[type] || QUESTIONS.full;
  return list[index % list.length];
}

/**
 * Simulated (NOT AI) turn decision based only on answer length.
 * Returns the same shape the AI path produces so the engine can treat both alike.
 */
export function simulatedTurn(answer, { probes, hints }) {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const assessment = words < 8 ? 'struggling' : words < 25 ? 'incomplete' : words < 70 ? 'adequate' : 'strong';
  const score = Math.min(9, Math.max(1, Math.round(words / 8)));
  const evaluation = { correctness: score, understanding: score, reasoning: score, communication: score, technical_depth: score };
  let action = 'next_question';
  let question = '';
  if (assessment === 'struggling' && hints < 1 && probes < 3) {
    action = 'hint';
    question = 'Take a moment. Try starting from a small concrete example and describe what you would do with it.';
  } else if (assessment === 'incomplete' && probes < 2) {
    action = 'follow_up';
    question = 'Can you go a bit deeper on why you would do it that way?';
  } else if (assessment === 'strong') {
    action = 'harder_question';
  } else if (assessment === 'struggling') {
    action = 'easier_question';
  }
  return { evaluation, assessment, action, question, ack: '', topic: '', reason: 'simulated (demo mode)', simulated: true };
}
