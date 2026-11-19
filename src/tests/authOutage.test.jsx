import { selectOption } from './selectOption.js';
// These tests stub the network (fetch) and use the REAL api client, AuthContext, guards and
// pages, so they check the whole chain: client -> context -> header / pages.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';

const USER = {
  id: 'u1', username: 'aman', full_name: 'Aman Yadav', email: 'aman@example.com',
  email_verified: true, upi_id: null, profile_photo_url: null,
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// A tiny fake backend. Flip these flags inside a test to change what the "server" does.
const server = { down: false, signedIn: false, logoutStatus: 204, loginResponse: null };
let fetchMock;

beforeEach(() => {
  document.cookie = 'csrftoken=; path=/; max-age=0';
  Object.assign(server, { down: false, signedIn: false, logoutStatus: 204, loginResponse: null });
  fetchMock = vi.fn(async (url) => {
    if (server.down) throw new TypeError('Failed to fetch');
    const path = url.replace('/api/v1', '');
    if (path === '/auth/csrf/') {
      document.cookie = 'csrftoken=test-token; path=/';
      return json(200, { message: 'CSRF cookie set' });
    }
    if (path === '/users/me/') {
      return server.signedIn
        ? json(200, { user: USER })
        : json(401, { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to continue.' });
    }
    if (path === '/auth/login/') return server.loginResponse ? server.loginResponse() : json(200, { user: USER });
    if (path === '/auth/logout/') {
      return server.logoutStatus === 204
        ? new Response(null, { status: 204 })
        : json(server.logoutStatus, { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to continue.' });
    }
    if (path === '/notifications/unread-count/') return json(200, { unread_count: 0 });
    if (path.startsWith('/groups/?') || path.startsWith('/invitations/?')) return json(200, { count: 0, next: null, previous: null, results: [] });
    if (path === '/auth/register/') return json(201, { user: USER, message: 'Verify your email' });
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const meCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/v1/users/me/').length;
const banner = () => within(screen.getByRole('banner')); // the <header>
const main = () => within(screen.getByRole('main'));

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
}

async function addPeople(user, names) {
  for (const name of names) {
    await user.type(screen.getByLabelText('Person name'), name);
    await user.click(screen.getByRole('button', { name: 'Add person' }));
  }
}

describe('public pages with the backend down', () => {
  it('renders the home page and tells the user about the outage', async () => {
    server.down = true;
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /Split expenses\.\s*Keep friendships simple\./ })).toBeInTheDocument();
    expect(await banner().findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
    expect(banner().getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    // guests can still reach Quick Split, Sign in and Create account
    expect(banner().getByRole('link', { name: 'Quick Split' })).toBeInTheDocument();
    expect(banner().getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(banner().getByRole('link', { name: 'Create account' })).toBeInTheDocument();
  });

  it('Quick Split works completely and makes no requests except the session check', async () => {
    const user = userEvent.setup();
    server.down = true;
    renderApp('/quick-split');
    await screen.findByRole('heading', { name: 'Quick Split' });
    await addPeople(user, ['Aman', 'Rahul']);
    await user.click(screen.getByRole('button', { name: 'Next: Expenses' }));
    await user.type(screen.getByLabelText('Description'), 'Dinner');
    await user.type(screen.getByLabelText(/amount/i), '100');
    await selectOption(screen.getByLabelText('Paid by'), 'Aman');
    await user.click(screen.getByRole('button', { name: 'Add expense' }));
    await user.click(screen.getByRole('button', { name: 'Calculate split' }));

    const results = within(screen.getByRole('region', { name: 'Results' }));
    expect(results.getByText(/Rahul pays Aman/)).toHaveTextContent('₹50.00');
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/v1/users/me/')).toBe(true);
  });
});

describe('Retry really rechecks the backend', () => {
  it('asks again each time, keeps the notice while down, and clears it when the server is back', async () => {
    const user = userEvent.setup();
    server.down = true;
    renderApp('/');
    await banner().findByText(UNAVAILABLE_MESSAGE, { exact: false });
    expect(meCalls()).toBe(1);

    await user.click(banner().getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(meCalls()).toBe(2));
    expect(await banner().findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument(); // still down

    server.down = false; // Django comes back (the visitor is simply signed out)
    await user.click(banner().getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(meCalls()).toBe(3));
    await waitFor(() => expect(screen.queryByText(UNAVAILABLE_MESSAGE)).not.toBeInTheDocument());
  });
});

describe('protected pages during an outage', () => {
  it('shows a retry panel and does not redirect to login', async () => {
    const user = userEvent.setup();
    server.down = true;
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Could not check your sign-in' })).toBeInTheDocument();
    expect(main().getByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'open Quick Split' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();

    server.down = false;
    server.signedIn = true;
    await user.click(main().getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });
});

describe('sign-in and registration during an outage', () => {
  it('login shows the friendly message, keeps what was typed, and works once the server is back', async () => {
    const user = userEvent.setup();
    server.down = true;
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Email'), 'aman@example.com');
    await user.type(screen.getByLabelText('Password'), 'password-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await main().findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('aman@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('password-123');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();

    server.down = false;
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
  });

  it('wrong credentials are a normal error, not an outage', async () => {
    const user = userEvent.setup();
    server.loginResponse = () => json(400, { code: 'VALIDATION_ERROR', message: 'Incorrect email or password.' });
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Email'), 'aman@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('registration keeps every entry when the server is unavailable', async () => {
    const user = userEvent.setup();
    server.down = true;
    renderApp('/register');
    await screen.findByRole('heading', { name: 'Create account' });
    await user.type(screen.getByLabelText('Username'), 'priya_k');
    await user.type(screen.getByLabelText('Full name'), 'Priya K');
    await user.type(screen.getByLabelText('Email'), 'priya@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-long-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await main().findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('priya_k');
    expect(screen.getByLabelText('Password')).toHaveValue('a-long-password');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });
});

describe('an outage never clears the signed-in state', () => {
  async function signedInOnDashboard() {
    server.signedIn = true;
    renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
  }

  it('a failed sign-out keeps the user signed in and says so', async () => {
    const user = userEvent.setup();
    await signedInOnDashboard();

    server.down = true;
    await user.click(banner().getByRole('button', { name: 'Sign out' }));

    const alert = (await banner().findByText(/^You are still signed in:/)).closest('[role="alert"]');
    expect(alert).toHaveTextContent(/still signed in/i);
    expect(alert).toHaveTextContent(UNAVAILABLE_MESSAGE);
    // nothing about the signed-in UI changed
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/Welcome back/)).toHaveTextContent('Aman Yadav');
    expect(banner().getByRole('button', { name: 'Sign out' })).toBeEnabled();
    expect(banner().queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('signing out works once the server is back', async () => {
    const user = userEvent.setup();
    await signedInOnDashboard();
    server.down = true;
    await user.click(banner().getByRole('button', { name: 'Sign out' }));
    await banner().findByText(/^You are still signed in:/);

    server.down = false;
    await user.click(banner().getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: /Split expenses\.\s*Keep friendships simple\./ })).toBeInTheDocument();
    expect(banner().getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('Retry after a failed sign-out rechecks the session and keeps the user signed in', async () => {
    const user = userEvent.setup();
    await signedInOnDashboard();
    server.down = true;
    await user.click(banner().getByRole('button', { name: 'Sign out' }));
    await banner().findByRole('alert');

    server.down = false;
    const before = meCalls();
    await user.click(banner().getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(meCalls()).toBe(before + 1));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('treats a 401 from sign-out as "already signed out"', async () => {
    const user = userEvent.setup();
    await signedInOnDashboard();
    server.logoutStatus = 401;
    await user.click(banner().getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: /Split expenses\.\s*Keep friendships simple\./ })).toBeInTheDocument();
  });
});
