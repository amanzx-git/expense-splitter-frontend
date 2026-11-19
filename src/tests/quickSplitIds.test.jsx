import { selectOption } from './selectOption.js';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickSplitPage from '../pages/QuickSplitPage.jsx';

afterEach(() => vi.unstubAllGlobals());

describe('Quick Split IDs', () => {
  it('works when only getRandomValues exists (for example over plain http)', async () => {
    vi.stubGlobal('crypto', { getRandomValues: (array) => webcrypto.getRandomValues(array) });
    const user = userEvent.setup();
    render(<QuickSplitPage />);

    for (const name of ['Aman', 'Rahul']) {
      await user.type(screen.getByLabelText('Person name'), name);
      await user.click(screen.getByRole('button', { name: 'Add person' }));
    }
    await user.click(screen.getByRole('button', { name: 'Next: Expenses' }));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await selectOption(screen.getByRole('combobox', { name: /Paid by/ }), 'Aman');
    await user.click(screen.getByRole('button', { name: 'Add expense' }));
    await user.click(screen.getByRole('button', { name: 'Calculate split' }));

    const results = within(screen.getByRole('region', { name: 'Results' }));
    expect(results.getByText(/Rahul pays Aman/)).toHaveTextContent('₹50.00');
  });

  it('shows an unsupported-environment message, not a broken calculator, without secure randomness', () => {
    vi.stubGlobal('crypto', undefined);
    render(<QuickSplitPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/can’t run Quick Split safely/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/Update your browser or try another one/i);
    expect(screen.queryByRole('button', { name: 'Add person' })).not.toBeInTheDocument();
  });
});
