import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { ApiError } from '../api/errors.js';
import * as authApi from '../api/auth.js';

vi.mock('../api/auth.js');

beforeEach(() => {
  vi.resetAllMocks();
  authApi.getMe.mockRejectedValue(
    new ApiError({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Sign in.' })
  );
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('branding', () => {
  it('says "Splitter" in the header, home page and footer, never the old name', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Splitter home' })).toBeInTheDocument();
    expect(screen.getByText(/^Splitter helps a group/)).toBeInTheDocument();
    expect(screen.getByText('Splitter V1. Payments happen outside the app.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Expense Splitter/);
  });

  it('shows the logo on the sign-in page as well as in the header', async () => {
    renderAt('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    const logos = screen.getAllByRole('img', { name: 'Splitter' });
    expect(logos.length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toMatch(/Expense Splitter/);
  });
});
