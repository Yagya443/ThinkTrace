// Monaco is bundled locally (no CDN) and only loaded when a coding interview opens this component.
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import Editor, { loader } from '@monaco-editor/react';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

export default function MonacoEditor({ value, onChange, language, height = 340, readOnly = false }) {
  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme="vs-dark"
      onChange={(v) => onChange(v ?? '')}
      loading={<p className="p-4 text-sm text-slate-500">Loading editor…</p>}
      options={{
        readOnly, minimap: { enabled: false }, fontSize: 14, fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, padding: { top: 12 }, ariaLabel: 'Code editor',
      }}
    />
  );
}
