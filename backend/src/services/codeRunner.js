import { AppError } from '../utils/AppError.js';

/**
 * Automated code execution is intentionally NOT implemented.
 * Running candidate code safely needs a real sandbox (containers/microVMs with no network, CPU/memory/time limits,
 * a locked-down filesystem), which is out of scope for a local MVP. This module is the seam where a sandbox
 * backend can be plugged in later: implement runSamples({ language, code, problem }) and flip the flag.
 */
export const isExecutionSupported = false;

export async function runSamples() {
  throw new AppError('Running code is not available yet. Your code is reviewed by the interviewer instead.', 501, 'EXECUTION_UNAVAILABLE');
}
