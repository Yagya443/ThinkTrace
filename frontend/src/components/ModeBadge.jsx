export default function ModeBadge({ mode, model }) {
  if (!mode) return null;
  const fallback = mode === 'fallback';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border ${
        fallback ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      }`}
      title={fallback ? 'Ollama or the model is unavailable. Questions are predefined and answers are not analysed.' : `Running locally via Ollama: ${model}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${fallback ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      {fallback ? 'Demo / Fallback Mode' : `AI: ${model}`}
    </span>
  );
}
