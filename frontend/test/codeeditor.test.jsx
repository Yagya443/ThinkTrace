import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Simulate the Monaco chunk failing to load (offline/blocked/old browser).
vi.mock('../src/components/MonacoEditor.jsx', () => { throw new Error('monaco failed to load'); });
import CodeEditor from '../src/components/CodeEditor.jsx';
import { isStarter, STARTERS } from '../src/utils/code.js';

describe('CodeEditor fallback', () => {
  it('falls back to a working plain editor with a notice when Monaco cannot load', async () => {
    const onChange = vi.fn();
    render(<CodeEditor value="print(1)" onChange={onChange} language="python" />);
    await waitFor(() => expect(screen.getByText(/rich editor could not load/)).toBeTruthy());
    const box = screen.getByLabelText('Code editor');
    expect(box.value).toBe('print(1)');
    fireEvent.change(box, { target: { value: 'print(2)' } });
    expect(onChange).toHaveBeenCalledWith('print(2)');
  });
  it('detects untouched starter code', () => {
    expect(isStarter(STARTERS.python)).toBe(true);
    expect(isStarter('   ')).toBe(true);
    expect(isStarter(`${STARTERS.python}\nx = 1`)).toBe(false);
  });
});
