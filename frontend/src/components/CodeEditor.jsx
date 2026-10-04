import { Component, Suspense, lazy } from 'react';

const Monaco = lazy(() => import('./MonacoEditor.jsx'));

/** Plain textarea used while Monaco loads, or if it fails to load. Typing code always works. */
function PlainEditor({ value, onChange, height, notice }) {
  return (
    <div>
      {notice && <p className="px-3 py-1 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/30">{notice}</p>}
      <textarea
        aria-label="Code editor" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} style={{ height }}
        className="w-full resize-y bg-[#1e1e1e] p-3 font-mono text-sm text-slate-100 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Tab') { // keep focus in the editor and insert spaces
            e.preventDefault();
            const { selectionStart: a, selectionEnd: b } = e.target;
            onChange(`${value.slice(0, a)}    ${value.slice(b)}`);
            requestAnimationFrame(() => { e.target.selectionStart = e.target.selectionEnd = a + 4; });
          }
        }}
      />
    </div>
  );
}

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* fall back to the plain editor */ }
  render() {
    if (this.state.failed) return <PlainEditor {...this.props.plain} notice="The rich editor could not load, so you're using a simple one." />;
    return this.props.children;
  }
}

export default function CodeEditor({ value, onChange, language, height = 340 }) {
  const plain = { value, onChange, height };
  return (
    <div className="overflow-hidden rounded-xl border border-ink-700 bg-[#1e1e1e]">
      <Boundary plain={plain}>
        <Suspense fallback={<PlainEditor {...plain} />}>
          <Monaco value={value} onChange={onChange} language={language} height={height} />
        </Suspense>
      </Boundary>
    </div>
  );
}
