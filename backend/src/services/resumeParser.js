import pdf from 'pdf-parse/lib/pdf-parse.js';
import { AppError } from '../utils/AppError.js';

/** Extracts plain text from an uploaded PDF buffer. Throws AppError with a user-friendly message. */
export async function extractResumeText(file) {
  if (!file?.buffer?.length) throw new AppError('The resume file was empty.', 400, 'RESUME_EMPTY');
  if (file.buffer.slice(0, 5).toString('latin1') !== '%PDF-') throw new AppError('The resume must be a PDF file.', 400, 'RESUME_NOT_PDF');
  let data;
  try {
    // Copy into a fresh Uint8Array: pdf-parse misreads Node's pooled Buffers (ignores byteOffset).
    data = await pdf(new Uint8Array(file.buffer));
  } catch {
    throw new AppError('Could not read that PDF. It may be corrupted or password-protected.', 422, 'RESUME_UNREADABLE');
  }
  const text = (data.text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 40) throw new AppError('No selectable text was found in that PDF (it may be a scanned image).', 422, 'RESUME_NO_TEXT');
  return text;
}
