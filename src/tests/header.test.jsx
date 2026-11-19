import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Header from '../components/Header.jsx';
let auth;
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => auth }));
vi.mock('../features/notifications/NotificationsProvider.jsx', () => ({ useNotifications: () => ({ count: { data: { unread_count: 3 } } }) }));
beforeEach(() => {
  auth = { status: 'authenticated', user: { id: 'me', full_name: 'Aman', username: 'aman' }, logout: vi.fn(async () => ({ ok: true })), recheck: vi.fn() };
});
afterEach(cleanup);
function Location() { const location = useLocation(); return <output aria-label="Location">{location.pathname}</output>; }
function open(path = '/dashboard') { render(<MemoryRouter initialEntries={[path]}><Header /><Location /></MemoryRouter>); }
it('keeps primary links beside the brand and account controls ordered with sign out last', () => {
  open();
  const primary = document.querySelector('.nav-primary');
  expect(within(primary).getAllByRole('link').map((link) => link.textContent)).toEqual(['Home', 'Quick Split', 'My groups', 'Messages']);
  expect(screen.getByRole('link', { name: 'My groups' })).toHaveAttribute('aria-current', 'page');
  const account = document.querySelector('.nav-secondary');
  const links = within(account).getAllByRole('link');
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/invitations', '/notifications', '/profile']);
  const signout = within(account).getByRole('button', { name: 'Sign out' });
  expect(account.lastElementChild).toBe(signout);
  expect(signout).toHaveClass('btn', 'btn-secondary', 'header-signout');
  expect(screen.getAllByRole('link', { name: 'Notifications, 3 unread' })).toHaveLength(1);
  expect(document.querySelector('.notification-badge')).toHaveTextContent('3');
});
it('opens the mobile menu, dismisses with Escape, and keeps account navigation functional', async () => {
  open(); const toggle = screen.getByRole('button', { name: 'Open navigation' });
  expect(toggle).toHaveAttribute('aria-controls', 'main-nav');
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass('is-open');
  await userEvent.keyboard('{Escape}');
  expect(toggle).toHaveAttribute('aria-expanded', 'false'); expect(toggle).toHaveFocus();
  await userEvent.click(toggle); await userEvent.click(screen.getByRole('link', { name: 'Profile' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/profile');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
it('preserves notification navigation and closes the menu', async () => {
  open(); await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  await userEvent.click(screen.getByRole('link', { name: 'Notifications, 3 unread' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/notifications');
  expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
});
it('signs out once and returns home', async () => {
  open(); await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(auth.logout).toHaveBeenCalledOnce(); expect(screen.getByLabelText('Location')).toHaveTextContent('/');
});
it('keeps failed sign-out visible without navigating away', async () => {
  auth.logout.mockResolvedValue({ ok: false, message: 'Try again.' }); open();
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('You are still signed in: Try again.');
  expect(screen.getByLabelText('Location')).toHaveTextContent('/dashboard');
});
it('keeps guest navigation without account controls', async () => {
  auth.status = 'anonymous'; auth.user = null; open('/quick-split');
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Notifications/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register');
  expect(screen.getByRole('link', { name: 'Quick Split' })).toHaveAttribute('aria-current', 'page');
});
